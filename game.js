// Game Engine

const segmentCosts = { 1: 0, 2: 3, 3: 5, 4: 8 };
let players = [];
let board = {};
let currentPlayerIndex = 0;
let round = 1;

// Socket Sync State
const SOCKET_SERVER_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5931'
    : window.location.origin;
let socket = null;
let isSpectator = false;
let roomCode = null;
let isMultiplayer = false;
let isHost = false; // true only for the player who created the room

// State variables for events
let activeEvent = null;
let lastPlayedCard = null;
let lastWastedCard = null;
let lastAction = null;
let targetingMode = null;
let overlayedCardIdx = -1;
let masterDeck = [];
let eventModifiers = {
    revenueMultiplier: 1,
    l3RevenueMultiplier: 1,
    attacksAllowed: true,
    l1FreeNoCard: false,
    l2FirstFree: false,
    l4NoCard: false,
    l1PlayersFreeL2: false
};

const eventDeck = [
    { id: 1, name: "Group Votes", desc: "One Level 3 or Level 4 player drops to Level 2." },
    { id: 2, name: "Bounty", desc: "Player highest on the pyramid gains 5 budget tokens immediately." },
    { id: 3, name: "Opportunity", desc: "First card played on Level 2 this round claims it free." },
    { id: 4, name: "Underdog", desc: "Player lowest on the pyramid gains 4 budget tokens." },
    { id: 5, name: "Economic Boom", desc: "Every segment on the board earns double revenue this round." },
    { id: 6, name: "Targeted Growth", desc: "Level 3 segment earns triple revenue this round only." },
    { id: 6, name: "Targeted Growth", desc: "Level 3 segment earns triple revenue this round only." },
    { id: 7, name: "Cheap Warfare", desc: "All attack cards cost 2 fewer tokens this season." },
    { id: 7, name: "Cheap Warfare", desc: "All attack cards cost 2 fewer tokens this season." },
    { id: 8, name: "Ascension", desc: "All Level 1 players attempt Level 2 for free this round." },
    { id: 9, name: "Market Crash", desc: "Every player loses 3 budget tokens right now." },
    { id: 9, name: "Market Crash", desc: "Every player loses 3 budget tokens right now." },
    { id: 10, name: "Open Throne", desc: "Level 4 may be attempted this round without Golden Dot Card." },
    { id: 11, name: "Hard Times", desc: "Every player drops 2 tokens or drops one level." },
    { id: 11, name: "Hard Times", desc: "Every player drops 2 tokens or drops one level." },
    { id: 12, name: "Economic Boom", desc: "Every segment on the board earns double revenue this round." },
    { id: 13, name: "Peace Treaty", desc: "No attacks allowed this round. Climbing moves only." },
    { id: 14, name: "Land Grab", desc: "All Level 1 segments free to claim this round. No card needed." },
    { id: 15, name: "Bounty", desc: "Player highest on the pyramid gains 5 budget tokens immediately." },
    { id: 16, name: "Underdog", desc: "Player lowest on the pyramid gains 4 budget tokens immediately." }
];

// UI Elements
const rosterEl = document.getElementById('players-roster');
const actionLogEl = document.getElementById('action-log');
const currentPlayerNameEl = document.getElementById('current-player-name');
const roundCounterEl = document.getElementById('round-counter');
const btnBuyFlag = document.getElementById('btn-buy-flag');
const btnPass = document.getElementById('btn-pass');
const btnEndGame = document.getElementById('btn-end-game');
const handEl = document.getElementById('player-hand');

// Initialize
function initGame() {
    // Read query parameters to check if spectator
    const urlParams = new URLSearchParams(window.location.search);
    roomCode = urlParams.get('room') || localStorage.getItem('empireClimbRoomCode');
    isSpectator = urlParams.get('spectator') === 'true';
    isMultiplayer = localStorage.getItem('empireClimbIsMultiplayer') === 'true' || isSpectator;
    isHost = localStorage.getItem('empireClimbIsHost') === 'true';

    // Init board
    document.querySelectorAll('.segment').forEach(seg => {
        const id = seg.getAttribute('data-id');
        board[id] = { owner: null, level: parseInt(seg.getAttribute('data-level')), power: 0 };
        
        seg.addEventListener('click', () => {
            if (isSpectator) return;
            handleSegmentClick(id, seg);
        });
    });

    if (isSpectator) {
        // Set spectator body class and display indicator
        document.body.classList.add('spectator-active');
        const indicator = document.getElementById('spectator-indicator');
        if (indicator) {
            indicator.style.display = 'flex';
            document.getElementById('spec-room-code').textContent = roomCode;
        }

        // Show a loading text or placeholder in the players roster
        rosterEl.innerHTML = '<div style="color:#aaa; font-family:\'Orbitron\', monospace; font-size:0.9rem; text-align:center; padding: 20px;">CONNECTING TO BATTLEFIELD...</div>';

        // Connect to Socket.io to receive updates
        connectSocketSync();

        // Load initial state if available
        const initialStateData = localStorage.getItem('empireClimbSpectatorInitialState');
        if (initialStateData) {
            try {
                applyGameState(JSON.parse(initialStateData));
            } catch (e) {
                console.error("Error loading initial spectator state", e);
            }
        }
        return;
    }

    // Normal game loading
    const data = localStorage.getItem('empireClimbPlayers');
    if (!data) {
        window.location.href = 'players.html';
        return;
    }
    players = JSON.parse(data);

    if (isMultiplayer && !isHost) {
        // ── GUEST MULTIPLAYER PATH ──────────────────────────────────────
        // Guests must NOT deal their own cards. The host is the single
        // source of truth. Show a waiting screen until the host's first
        // game-state-update arrives via the socket.
        rosterEl.innerHTML = '<div style="color:#aaa; font-family:\'Orbitron\', monospace; font-size:0.9rem; text-align:center; padding: 20px;">SYNCING GAME STATE...</div>';
        currentPlayerNameEl.textContent = '...';

        const chatWidget = document.getElementById('chat-widget');
        if (chatWidget) {
            chatWidget.style.display = 'block';
            initChatHandlers();
        }

        // Connect — we will applyGameState once the host broadcasts
        connectSocketSync();
        return;
    }

    // ── HOST (or local pass-and-play) PATH ────────────────────────────
    // Host deals cards for all players and is the authoritative game state.
    players.forEach(p => {
        p.hand = [];
        for (let i = 0; i < 5; i++) {
            const card = drawRandomCard();
            card.isNew = true;
            p.hand.push(card);
        }
    });

    logAction('The Empire Wars have begun.');
    updateUI();
    startTurn();

    if (isMultiplayer) {
        const chatWidget = document.getElementById('chat-widget');
        if (chatWidget) {
            chatWidget.style.display = 'block';
            initChatHandlers();
        }
    }

    // Connect to sync server (host will push authoritative state on connect)
    connectSocketSync();
}

function serializeGameState() {
    return {
        players: players.map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            tokens: p.tokens,
            flags: p.flags,
            bankrupt: p.bankrupt,
            hand: p.hand
        })),
        board: board,
        currentPlayerIndex: currentPlayerIndex,
        round: round,
        activeEvent: activeEvent,
        eventModifiers: eventModifiers,
        actionLogHtml: actionLogEl.innerHTML
    };
}

function applyGameState(state) {
    if (!state) return;
    
    players = state.players;
    board = state.board;
    currentPlayerIndex = state.currentPlayerIndex;
    round = state.round;
    activeEvent = state.activeEvent;
    eventModifiers = state.eventModifiers;
    
    // Update action log
    if (state.actionLogHtml) {
        actionLogEl.innerHTML = state.actionLogHtml;
        actionLogEl.scrollTop = actionLogEl.scrollHeight;
    }
    
    // Update UI elements
    updateUI();
    
    // Update turn header
    const cp = players[currentPlayerIndex];
    if (cp) {
        currentPlayerNameEl.textContent = cp.name;
        currentPlayerNameEl.style.color = cp.color;
    }
    if (roundCounterEl) {
        roundCounterEl.textContent = `ROUND ${round}`;
    }
}

function syncGameState() {
    if (isSpectator) return;
    // In multiplayer, only push state when it's your turn (or you're the host doing initial sync)
    // This prevents each client from overwriting the shared state with their stale local copy.
    if (isMultiplayer && !isLocalTurn()) return;
    if (socket && socket.connected && roomCode) {
        const state = serializeGameState();
        socket.emit('game-state-update', { roomCode, gameState: state });
    }
}

function connectSocketSync() {
    if (typeof io === 'undefined') {
        console.warn('Socket.IO client library not loaded. Local offline mode only.');
        return;
    }
    
    socket = io(SOCKET_SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnectionDelay: 1000,
        reconnectionAttempts: 10
    });

    socket.on('connect', () => {
        console.log('[game] connected to sync server');
        if (isSpectator) {
            // Join as spectator
            socket.emit('join-room', { roomCode, playerName: 'Spectator_' + Math.floor(Math.random()*1000) });
        } else if (roomCode) {
            // Join as active player
            const myName = localStorage.getItem('empireClimbMyName') || 'Host';
            socket.emit('join-room', { roomCode, playerName: myName });

            // Only the HOST pushes the authoritative initial state.
            // Guests wait silently for the host's broadcast.
            if (isHost) {
                // Give a tiny delay so all guests have a moment to connect first
                setTimeout(() => syncGameState(), 500);
            }
        } else {
            // Local pass-and-play room creation
            const initialState = serializeGameState();
            socket.emit('create-local-room', { players, gameState: initialState });
        }
    });

    socket.on('local-room-created', ({ roomCode: newCode }) => {
        roomCode = newCode;
        localStorage.setItem('empireClimbRoomCode', roomCode);
        console.log('[game] local room created for spectating:', roomCode);
        
        // Show host room badge
        const badge = document.getElementById('host-room-badge');
        if (badge) {
            badge.style.display = 'flex';
            document.getElementById('host-room-code').textContent = roomCode;
            
            // Click to copy code
            badge.onclick = () => {
                navigator.clipboard.writeText(roomCode).then(() => {
                    const oldHtml = badge.innerHTML;
                    badge.innerHTML = '<span>✅ COPIED!</span>';
                    setTimeout(() => { badge.innerHTML = oldHtml; }, 1500);
                });
            };
        }
    });

    socket.on('room-joined', ({ roomCode: joinedCode, players: lobbyPlayers, isSpectator: joinedAsSpectator, gameState }) => {
        if (joinedAsSpectator) {
            console.log('[game] spectating room:', joinedCode);
            if (gameState) {
                applyGameState(gameState);
            }
        } else {
            console.log('[game] joined room:', joinedCode);
            if (gameState) {
                applyGameState(gameState);
            }
            // Display host room badge for active players
            const badge = document.getElementById('host-room-badge');
            if (badge) {
                badge.style.display = 'flex';
                document.getElementById('host-room-code').textContent = joinedCode;
                
                // Click to copy code
                badge.onclick = () => {
                    navigator.clipboard.writeText(joinedCode).then(() => {
                        const oldHtml = badge.innerHTML;
                        badge.innerHTML = '<span>✅ COPIED!</span>';
                        setTimeout(() => { badge.innerHTML = oldHtml; }, 1500);
                    });
                };
            }
        }
    });

    socket.on('game-state-update', (state) => {
        // Accept state updates when it's not our turn, OR when we're a guest
        // who hasn't loaded the real game yet (players array will be empty).
        const guestWaitingForInit = isMultiplayer && !isHost && players.length === 0;
        if (isSpectator || !isLocalTurn() || guestWaitingForInit) {
            console.log('[game] received state sync');
            applyGameState(state);

            // If we were waiting for initial state, now boot up the chat panel
            if (guestWaitingForInit && isMultiplayer) {
                const chatWidget = document.getElementById('chat-widget');
                if (chatWidget && chatWidget.style.display !== 'block') {
                    chatWidget.style.display = 'block';
                    initChatHandlers();
                }
            }
        }
    });

    socket.on('player-connection-status', ({ name, connected }) => {
        console.log(`[game] player connection status: ${name} -> ${connected}`);
        const p = players.find(x => x.name === name);
        if (p) {
            p.connected = connected;
            updateUI();
        }
    });

    socket.on('chat-msg-received', ({ sender, color, message, timestamp }) => {
        const msgContainer = document.getElementById('chat-messages');
        if (!msgContainer) return;

        const myName = localStorage.getItem('empireClimbMyName') || (isSpectator ? '' : 'Host');
        const isSelf = sender === myName;
        const bubble = document.createElement('div');
        bubble.className = `chat-msg-bubble ${isSelf ? 'self' : 'other'}`;

        bubble.innerHTML = `
            <div class="chat-msg-sender" style="color: ${color}">${sender}</div>
            <div class="chat-msg-text">${escapeHtml(message)}</div>
        `;

        msgContainer.appendChild(bubble);
        msgContainer.scrollTop = msgContainer.scrollHeight;

        // If panel is collapsed, update unread count badge
        const panel = document.getElementById('chat-panel');
        if (panel && panel.classList.contains('collapsed')) {
            chatUnreadCount++;
            const badge = document.getElementById('chat-badge');
            if (badge) {
                badge.style.display = 'block';
                badge.textContent = chatUnreadCount;
            }
        }
    });

    socket.on('error', ({ message }) => {
        console.error('[game] socket error:', message);
    });
}

let chatUnreadCount = 0;

function initChatHandlers() {
    const toggleBtn = document.getElementById('chat-toggle-btn');
    const closeBtn = document.getElementById('chat-close-btn');
    const panel = document.getElementById('chat-panel');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const badge = document.getElementById('chat-badge');

    if (!toggleBtn || !panel) return;

    toggleBtn.addEventListener('click', () => {
        panel.classList.remove('collapsed');
        chatUnreadCount = 0;
        badge.style.display = 'none';
        badge.textContent = '0';
        input.focus();
    });

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Avoid triggering toggleBtn click
        panel.classList.add('collapsed');
    });

    sendBtn.addEventListener('click', () => {
        sendChatMessage();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    if (socket && socket.connected) {
        socket.emit('send-chat-msg', { roomCode, message: text });
        input.value = '';
    }
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function logAction(msg) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = msg;
    actionLogEl.appendChild(entry);
    actionLogEl.scrollTop = actionLogEl.scrollHeight;
    syncGameState();
}

function isLocalTurn() {
    if (isSpectator) return false;
    if (!isMultiplayer) return true;
    const localPlayerName = localStorage.getItem('empireClimbMyName');
    const cp = players[currentPlayerIndex];
    return cp && cp.name === localPlayerName;
}

function updateUI() {
    // Roster
    rosterEl.innerHTML = '';
    players.forEach((p, i) => {
        const card = document.createElement('div');
        const isOffline = p.connected === false;
        card.className = `roster-card ${i === currentPlayerIndex ? 'active-turn' : ''} ${isOffline ? 'offline' : ''}`;
        card.style.borderColor = p.bankrupt ? '#333' : (isOffline ? '#ff2d2d' : (i === currentPlayerIndex ? p.color : ''));
        card.style.opacity = p.bankrupt || isOffline ? '0.5' : '1';
        
        // Opponent hand card backs markup
        let handMarkup = '';
        if (i !== currentPlayerIndex) {
            const handSize = p.hand ? p.hand.length : 0;
            handMarkup = `<div class="roster-hand">`;
            for (let c = 0; c < Math.min(handSize, 5); c++) {
                handMarkup += `<div class="mini-card-back"></div>`;
            }
            if (handSize > 5) {
                handMarkup += `<div class="hand-count-badge">+${handSize - 5}</div>`;
            } else {
                handMarkup += `<div class="hand-count-badge">${handSize}</div>`;
            }
            handMarkup += `</div>`;
        }
        
        card.innerHTML = `
            <div class="roster-header">
                <div class="roster-color" style="background:${p.bankrupt || isOffline ? '#555' : p.color}"></div>
                <div class="roster-name" style="${p.bankrupt ? 'text-decoration:line-through' : ''}" title="${p.name}">${p.name}${isOffline ? ' <span style="font-size:0.7em; color:#ff5555; font-weight:bold; letter-spacing:0.05em;">(OFFLINE)</span>' : ''}</div>
            </div>
            <div class="roster-stats">
                <div>Tokens: <span class="stat-val ${p.tokens <= 3 ? 'danger' : ''}">${p.tokens}</span></div>
                <div>Flags: <span class="stat-val">${p.flags}</span></div>
            </div>
            ${handMarkup}
        `;
        rosterEl.appendChild(card);
    });

    // Board
    document.querySelectorAll('.segment').forEach(seg => {
        const id = seg.getAttribute('data-id');
        const data = board[id];
        let ownerLabel = seg.querySelector('.segment-owner');
        if (data.owner !== null) {
            seg.classList.add('claimed');
            const owner = players.find(p => p.id === data.owner);
            if(owner) {
                seg.style.borderColor = owner.color;
                if (!ownerLabel) {
                    ownerLabel = document.createElement('div');
                    ownerLabel.className = 'segment-owner';
                    seg.appendChild(ownerLabel);
                }
                ownerLabel.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="${owner.color}" stroke="#000" stroke-width="1" style="filter: drop-shadow(0 0 5px ${owner.color});"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>`;
                if (data.power > 0) {
                    ownerLabel.innerHTML += `<div style="font-size: 0.85em; font-weight: bold; margin-top: 2px;">⚡${data.power}</div>`;
                }
            }
        } else {
            seg.classList.remove('claimed');
            seg.style.borderColor = '';
            if (ownerLabel) ownerLabel.remove();
        }
    });

    // Current Player
    const cp = players[currentPlayerIndex];
    const myTurn = isLocalTurn();
    if(cp) {
        currentPlayerNameEl.textContent = cp.name;
        currentPlayerNameEl.style.color = cp.color;
        btnBuyFlag.disabled = !myTurn || cp.tokens < 5 || cp.flags >= 12; // 3 min + 2 cost
        btnPass.disabled = !myTurn || cp.bankrupt;
    }

    // Enforce Turn Lock Body Class
    if (!myTurn) {
        document.body.classList.add('not-my-turn');
    } else {
        document.body.classList.remove('not-my-turn');
    }

    // Hand
    renderHand();

    // Broadcast state update
    syncGameState();
}

function renderHand() {
    handEl.innerHTML = '';
    const cp = players[currentPlayerIndex];
    if (!cp || cp.hand.length === 0) {
        handEl.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center;">Hand is empty</div>';
        return;
    }
    
    const showActions = isLocalTurn();
    const totalCards = cp.hand.length;
    
    cp.hand.forEach((card, idx) => {
        const cEl = document.createElement('div');
        
        let cardClass = '';
        if (card.type === 'attack') cardClass = 'card-attack';
        else if (card.type === 'defence') cardClass = 'card-defence';
        else if (card.type === 'claim') {
            cardClass = `card-claim-l${card.level}`;
        }
        
        cEl.className = `game-card ${cardClass}`;
        
        // Check selected/targeting state
        if (targetingMode && targetingMode.cardIdx === idx) {
            cEl.classList.add('selected-card');
        }
        
        // Check overlay/focus state
        if (overlayedCardIdx === idx) {
            cEl.classList.add('overlay-active');
        }
        
        // Draw card animation check
        if (card.isNew) {
            cEl.classList.add('draw-animation');
            // Remove after animation completes
            setTimeout(() => {
                card.isNew = false;
                cEl.classList.remove('draw-animation');
            }, 600);
        }
        
        // Fan alignment math
        const maxSweep = 30;
        const anglePerCard = totalCards > 1 ? maxSweep / (totalCards - 1) : 0;
        const cardAngle = totalCards > 1 ? -maxSweep / 2 + idx * anglePerCard : 0;
        
        const xSpacing = totalCards > 5 ? 50 : 65;
        const cardX = (idx - (totalCards - 1) / 2) * xSpacing;
        
        const distanceFromCenter = idx - (totalCards - 1) / 2;
        const cardY = Math.abs(distanceFromCenter) * Math.abs(distanceFromCenter) * 3;
        
        cEl.style.setProperty('--card-angle', `${cardAngle}deg`);
        cEl.style.setProperty('--card-x', `${cardX}px`);
        cEl.style.setProperty('--card-y', `${cardY}px`);
        cEl.style.zIndex = overlayedCardIdx === idx ? 9500 : idx + 10;
        
        cEl.innerHTML = `
            <div class="card-cost">${card.cost || 0}</div>
            <div class="card-title">${card.name}</div>
            <div class="card-desc">${card.desc}</div>
            ${showActions ? `
            <div class="card-actions">
                <button class="play-btn" style="flex:1; padding:4px; font-size:0.6rem; cursor:pointer; background:rgba(0,170,255,0.2); border:1px solid var(--blue-glow); color:var(--text); border-radius:3px; font-family:'Orbitron', monospace;">Play</button>
                <button class="waste-btn" style="flex:1; padding:4px; font-size:0.6rem; cursor:pointer; background:rgba(255,45,45,0.2); border:1px solid var(--red-glow); color:var(--text); border-radius:3px; font-family:'Orbitron', monospace;">Waste</button>
            </div>
            ` : ''}
        `;
        
        cEl.addEventListener('click', (e) => {
            if (e.target.closest('.card-actions')) return;
            const wasActive = cEl.classList.contains('active');
            document.querySelectorAll('.game-card').forEach(card => {
                card.classList.remove('active');
            });
            if (!wasActive) {
                cEl.classList.add('active');
            }
        });

        if (showActions) {
            cEl.querySelector('.play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                playCard(idx);
            });
            cEl.querySelector('.waste-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                wasteCard(idx);
            });
        }
        
        handEl.appendChild(cEl);
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.game-card')) {
        document.querySelectorAll('.game-card').forEach(card => {
            card.classList.remove('active');
        });
    }
});

function startTurn() {
    overlayedCardIdx = -1;
    const cp = players[currentPlayerIndex];
    if (cp.bankrupt) {
        endTurn();
        return;
    }
    
    // Turn Transition Overlay
    const overlay = document.getElementById('turn-transition-overlay');
    const title = document.getElementById('turn-transition-title');
    const subtitle = document.getElementById('turn-transition-subtitle');
    if (overlay && title && subtitle) {
        title.textContent = cp.name;
        title.style.color = cp.color;
        subtitle.textContent = "YOUR TURN BEGINS";
        overlay.classList.add('visible');
        setTimeout(() => {
            overlay.classList.remove('visible');
        }, 1500);
    }
    
    logAction(`<strong>${cp.name}</strong>'s turn begins.`);
    updateUI();
}

function endTurn() {
    overlayedCardIdx = -1;
    currentPlayerIndex++;
    if (currentPlayerIndex >= players.length) {
        // End of round
        currentPlayerIndex = 0;
        round++;
        if(roundCounterEl) roundCounterEl.textContent = round;
        processEndRound();
    }
    
    // Check win condition
    const activePlayers = players.filter(p => !p.bankrupt);
    if (activePlayers.length <= 1) {
        endGame();
        return;
    }
    
    startTurn();
}

function declareBankruptcy(player) {
    player.bankrupt = true;
    let segmentsFreed = 0;
    Object.keys(board).forEach(id => {
        if (board[id].owner === player.id) {
            board[id].owner = null;
            board[id].power = 0; // Power resets when segment is abandoned
            segmentsFreed++;
        }
    });
    if (segmentsFreed > 0) {
        logAction(`<span style="color:var(--red-glow)">All of ${player.name}'s segments (${segmentsFreed}) were abandoned and are now free!</span>`);
    }
}

function getHighestSegmentLevel(playerId) {
    let highest = 0;
    Object.values(board).forEach(seg => {
        if (seg.owner === playerId && seg.level > highest) highest = seg.level;
    });
    return highest;
}

function dropHighestSegment(playerId) {
    let highestLevel = getHighestSegmentLevel(playerId);
    if (highestLevel === 0) return;
    
    // Find all segments of this level owned by player
    let owned = Object.keys(board).filter(id => board[id].owner === playerId && board[id].level === highestLevel);
    if (owned.length > 0) {
        // Drop one randomly
        let targetId = owned[Math.floor(Math.random() * owned.length)];
        board[targetId].owner = null;
        const player = players.find(p => p.id === playerId);
        logAction(`<span style="color:var(--red-glow)">${player.name} lost a Level ${highestLevel} segment!</span>`);
    }
}

function applyImmediateEvent(ev) {
    // 1: Group Votes
    if (ev.id === 1) {
        let targets = players.filter(p => !p.bankrupt && getHighestSegmentLevel(p.id) >= 3);
        if (targets.length > 0) {
            let target = targets[Math.floor(Math.random() * targets.length)];
            dropHighestSegment(target.id);
        }
    }
    // 2, 15: Bounty (Highest player gains 5)
    else if (ev.id === 2 || ev.id === 15) {
        let maxLvl = -1;
        players.forEach(p => {
            if (!p.bankrupt) {
                let l = getHighestSegmentLevel(p.id);
                if (l > maxLvl) maxLvl = l;
            }
        });
        let targets = players.filter(p => !p.bankrupt && getHighestSegmentLevel(p.id) === maxLvl);
        targets.forEach(t => {
            t.tokens += 5;
            logAction(`${t.name} gained 5 tokens as a pyramid leader.`);
        });
    }
    // 4, 16: Underdog (Lowest player gains 4)
    else if (ev.id === 4 || ev.id === 16) {
        let minLvl = 99;
        players.forEach(p => {
            if (!p.bankrupt) {
                let l = getHighestSegmentLevel(p.id);
                if (l < minLvl) minLvl = l;
            }
        });
        let targets = players.filter(p => !p.bankrupt && getHighestSegmentLevel(p.id) === minLvl);
        targets.forEach(t => {
            t.tokens += 4;
            logAction(`${t.name} gained 4 tokens as an underdog.`);
        });
    }
    // 5, 12: Economic Boom (Double revenue)
    else if (ev.id === 5 || ev.id === 12) {
        eventModifiers.revenueMultiplier = 2;
    }
    // 6: Targeted Growth (L3 triple)
    else if (ev.id === 6) {
        eventModifiers.l3RevenueMultiplier = 3;
    }
    // 7: Cheap Warfare (Attack cards cost 0)
    else if (ev.id === 7) {
        // Will be checked in handleSegmentClick
    }
    // 8: Ascension (L1 players attempt L2 free)
    else if (ev.id === 8) {
        eventModifiers.l1PlayersFreeL2 = true;
    }
    // 9: Market Crash (Lose 3)
    else if (ev.id === 9) {
        players.forEach(p => {
            if (p.bankrupt) return;
            p.tokens -= 3;
            if (p.tokens < 3) {
                declareBankruptcy(p);
                logAction(`${p.name} went bankrupt from the Market Crash!`);
            }
        });
    }
    // 10: Open Throne (L4 without Golden card)
    else if (ev.id === 10) {
        eventModifiers.l4NoCard = true;
    }
    // 11: Hard Times (Drop 2 tokens or drop level)
    else if (ev.id === 11) {
        players.forEach(p => {
            if (p.bankrupt) return;
            if (p.tokens - 2 >= 3) {
                p.tokens -= 2;
                logAction(`${p.name} paid 2 tokens for Hard Times.`);
            } else {
                dropHighestSegment(p.id);
            }
        });
    }
    // 13: Peace Treaty (No attacks)
    else if (ev.id === 13) {
        eventModifiers.attacksAllowed = false;
    }
    // 14: Land Grab (L1 free, no card)
    else if (ev.id === 14) {
        eventModifiers.l1FreeNoCard = true;
    }
    // 3: Opportunity (First L2 free)
    else if (ev.id === 3) {
        eventModifiers.l2FirstFree = true;
    }
}

function processEndRound() {
    logAction(`<br><strong>--- Round ${round} Begins ---</strong>`);
    
    // Reset Modifiers
    eventModifiers = {
        revenueMultiplier: 1,
        l3RevenueMultiplier: 1,
        attacksAllowed: true,
        l1FreeNoCard: false,
        l2FirstFree: false,
        l4NoCard: false,
        l1PlayersFreeL2: false
    };

    // Draw Event
    const ev = eventDeck[Math.floor(Math.random() * eventDeck.length)];
    activeEvent = ev;
    
    // UI Update
    const eventBox = document.getElementById('active-event-box');
    const eventText = document.getElementById('active-event-text');
    if (eventBox && eventText) {
        eventBox.style.display = 'block';
        eventText.innerHTML = `<strong>${ev.name}</strong><br>${ev.desc}`;
    }
    
    logAction(`<strong style="color:var(--purple-glow);">EVENT: ${ev.name}</strong> - ${ev.desc}`);

    // Apply Immediate Effects
    applyImmediateEvent(ev);

    // 1. Revenue
    players.forEach(p => {
        if (p.bankrupt) return;
        
        let revenue = 0;
        Object.values(board).forEach(seg => {
            if (seg.owner === p.id) {
                let base = 0;
                if (seg.level === 1) base = 1;
                else if (seg.level === 2) base = 2;
                else if (seg.level === 3) base = 3;
                else if (seg.level === 4) base = 5;
                
                let mult = eventModifiers.revenueMultiplier;
                if (seg.level === 3 && eventModifiers.l3RevenueMultiplier > 1) {
                    mult = eventModifiers.l3RevenueMultiplier; // L3 targeted growth overrides generic mult
                }
                revenue += base * mult;
            }
        });
        
        if (revenue > 0) {
            p.tokens += revenue;
            logAction(`<span style="color:${p.color}">${p.name}</span> gained ${revenue} tokens from segments.`);
        }
        
        // 2. Auto-draw up to 5 cards
        let drawn = 0;
        while (p.hand.length < 5) {
            const card = drawRandomCard();
            card.isNew = true;
            p.hand.push(card);
            drawn++;
        }
        if (drawn > 0) {
            logAction(`<span style="color:${p.color}">${p.name}</span> drew ${drawn} cards.`);
        }
    });
    logAction(`<br>`);
    updateUI(); // Important to reflect drops or bankruptcy immediately
}

function buildMasterDeck() {
    masterDeck = [];
    
    // --- COMBAT CARDS ---
    const addAttack = (name, power, count, desc) => {
        for(let i=0; i<count; i++) masterDeck.push({type: 'attack', name: name, power: power, desc: `Power: ${power} | ${desc}`, cost: 2});
    };
    const addDefence = (power, count, desc) => {
        for(let i=0; i<count; i++) masterDeck.push({type: 'defence', name: `Defense Card`, power: power, desc: `Power: ${power} | ${desc}`, cost: 0});
    };

    addAttack('COPYCAT', 2, 3, "Mirrors the exact action played by the previous player.");
    addAttack('ATTACK', 4, 3, "Target opponent segment. They pay 3 extra tokens to hold.");
    addAttack('SEGMENT STEAL', 5, 2, "Instantly seize one UNCAPTURED segment on your level or +1 level.");
    addAttack('DISRUPT', 7, 2, "Knock opponent off their highest level. All flags there removed.");
    addAttack('BID', 3, 3, "Challenge opponent to a blind bid on any segment.");
    addAttack('BLITZ ATTACK', 6, 2, "Hit 2 opponent segments anywhere. Knocks both flags off instantly.");
    addAttack('COMPETITIVE STRIKE', 3, 3, "Challenge Level 1 or Level 2 opponent on their segment. Blind bid.");

    addDefence(2, 1, "Defends against: COPYCAT (power 2) only");
    addDefence(3, 3, "Defends against: COPYCAT, BID, COMPETITIVE STRIKE (power 2-3)");
    addDefence(4, 3, "Defends against: All power 2-4 attack cards");
    addDefence(5, 3, "Defends against: All power 2-5 attack cards");
    addDefence(6, 3, "Defends against: All power 2-6 attack cards");
    addDefence(7, 3, "Defends against: ALL attack cards including DISRUPT (power 7)");

    // --- CLAIM CARDS ---
    function createArch(lvl, cName, t, cost, minP, maxP) {
        let isWild = t[0] === 'Any';
        let name = `${cName} Card (${t.join('+')})`;
        if(isWild) name = `${cName} Wild Card`;
        if(lvl === 4) name = `Golden Card`;
        let pwr = Math.floor(Math.random() * (maxP - minP + 1)) + minP;
        return {
            name: name, desc: `Captures: ${t.join(' + ')} | Power: ${pwr}`,
            type: 'claim', level: lvl, targets: t, cost: cost, power: pwr
        };
    }
    
    // Blue (L1, cost 0)
    const bS = [['A'],['B'],['C'],['D'],['E'],['F']];
    const bD = [['A','B'], ['B','C'], ['C','D'], ['D','E'], ['E','F']];
    const bT = [['A','B','C'], ['C','D','E'], ['D','E','F']];
    const bW = [['Any']];
    [...bS, ...bD, ...bT, ...bW].forEach(t => masterDeck.push(createArch(1, 'Blue', t, 0, 2, 4)));

    // Yellow (L2, cost 3)
    const yS = [['A'],['B'],['C'],['D'],['E']];
    const yD = [['A','B'], ['B','C'], ['C','D'], ['D','E']];
    const yT = [['A','B','C'], ['C','D','E']];
    const yW = [['Any'], ['Any']];
    [...yS, ...yD, ...yT, ...yW].forEach(t => masterDeck.push(createArch(2, 'Yellow', t, 3, 3, 4)));

    // Red (L3, cost 5)
    const rS = [['A'],['B'],['C'],['D']];
    const rD = [['A','B'], ['B','C'], ['C','D']];
    const rT = [['A','B','C'], ['B','C','D']];
    const rW = [['Any'], ['Any']];
    [...rS, ...rD, ...rT, ...rW].forEach(t => masterDeck.push(createArch(3, 'Red', t, 5, 5, 7)));

    // Gold (L4, cost 8)
    masterDeck.push(createArch(4, 'Gold', ['1'], 8, 10, 10));
}

function drawRandomCard() {
    if (masterDeck.length === 0) buildMasterDeck();
    return masterDeck[Math.floor(Math.random() * masterDeck.length)];
}

// Actions
const cardBackdrop = document.getElementById('card-backdrop');
if (cardBackdrop) {
    cardBackdrop.addEventListener('click', () => {
        overlayedCardIdx = -1;
        document.body.classList.remove('card-overlay-open');
        document.querySelectorAll('.game-card').forEach((el, index) => {
            el.classList.remove('overlay-active');
            el.style.zIndex = index + 10;
        });
        cardBackdrop.classList.remove('visible');
        setTimeout(() => {
            if (overlayedCardIdx === -1) {
                cardBackdrop.style.display = 'none';
            }
        }, 300);
    });
}

if(btnBuyFlag) {
    btnBuyFlag.addEventListener('click', () => {
        const cp = players[currentPlayerIndex];
        if (cp.tokens >= 5 && cp.flags < 12) { // must leave 3 tokens
            cp.tokens -= 2;
            cp.flags += 1;
            logAction(`<strong>${cp.name}</strong> purchased a flag.`);
            updateUI();
        }
    });
}

if(btnPass) {
    btnPass.addEventListener('click', () => {
        const cp = players[currentPlayerIndex];
        cp.tokens -= 2;
        if (cp.tokens < 3) {
            declareBankruptcy(cp);
            logAction(`<strong>${cp.name}</strong> passed and went bankrupt due to lack of tokens!`);
        } else {
            logAction(`<strong>${cp.name}</strong> paid 2 tokens to pass.`);
        }
        endTurn();
    });
}

if(btnEndGame) {
    btnEndGame.addEventListener('click', endGame);
}

function promptBuyFlagIfNeeded(player) {
    return new Promise((resolve) => {
        if (player.flags > 0) {
            resolve(true);
            return;
        }

        if (player.tokens < 5) {
            showToast('info', 'No Flags', `${player.name} has no flags left and cannot afford a new flag (must keep at least 3 tokens).`);
            resolve(false);
            return;
        }

        const modal = document.getElementById('buy-flag-modal');
        const desc = document.getElementById('buy-flag-desc');
        const confirmBtn = document.getElementById('btn-buy-flag-modal-confirm');
        const cancelBtn = document.getElementById('btn-buy-flag-modal-cancel');

        desc.innerHTML = `<strong>${player.name}</strong> has no flags left in reserve.<br>Would you like to buy a flag now for <strong>2 tokens</strong>?<br><br>Current budget: <span style="color:var(--gold); font-weight:bold;">${player.tokens} Tokens</span>`;
        
        modal.classList.add('visible');

        const onConfirm = () => {
            player.tokens -= 2;
            player.flags += 1;
            logAction(`<strong>${player.name}</strong> purchased a flag for 2 tokens.`);
            updateUI();
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            modal.classList.remove('visible');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

async function executeAttackSteal(attacker, defender, segment, id) {
    if (attacker.flags <= 0) {
        const bought = await promptBuyFlagIfNeeded(attacker);
        if (!bought) {
            segment.owner = null;
            segment.power = 0;
            if (defender) {
                logAction(`<strong>${attacker.name}</strong> defeated ${defender.name} but had no flags left to occupy ${document.querySelector(`[data-id="${id}"]`).innerText.split('\n')[0].trim()}! The segment becomes neutral.`);
            }
            updateUI();
            return;
        }
    }
    attacker.flags -= 1;
    segment.owner = attacker.id;
    segment.power = 0; // Wiped power on steal unless specified otherwise
    if(defender) {
        logAction(`<strong>${attacker.name}</strong> stole ${document.querySelector(`[data-id="${id}"]`).innerText.split('\n')[0].trim()}! <span style="color:${defender.color}">${defender.name}</span> lost a flag to the bank.`);
    } else {
        logAction(`<strong>${attacker.name}</strong> seized the uncaptured segment ${document.querySelector(`[data-id="${id}"]`).innerText.split('\n')[0].trim()}!`);
    }
    updateUI();
}

// -- Toast / Chronicle notification helper ----------------------
function showToast(type, title, msg, duration = 4000) {
    // INFO messages go into the CHRONICLE log � not a floating popup
    if (type === 'info') {
        logAction(`<span style="display:inline-flex;align-items:center;gap:6px;color:var(--blue-glow);"><span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--blue-glow);color:#000;font-size:0.65rem;font-weight:900;font-family:serif;flex-shrink:0;">i</span> <strong>${title}:</strong></span> <span style="color:#bbb;">${msg}</span>`);
        return;
    }
    // attack / defense / bid / win ? floating toast
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { attack:'<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--red-glow);color:#fff;font-size:0.65rem;font-weight:900;flex-shrink:0;font-family:sans-serif;">!</span>', defense:'<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#00FF88;color:#000;font-size:0.65rem;font-weight:900;flex-shrink:0;font-family:sans-serif;">S</span>', bid:'<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--gold);color:#000;font-size:0.65rem;font-weight:900;flex-shrink:0;font-family:sans-serif;">B</span>', win:'<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--gold);color:#000;font-size:0.65rem;font-weight:900;flex-shrink:0;font-family:sans-serif;">W</span>' };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span class="toast-icon">${icons[type]||'<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#555;color:#fff;font-size:0.65rem;font-weight:900;flex-shrink:0;font-family:sans-serif;">?</span>'}</span><div class="toast-body"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>`;
    container.appendChild(t);
    setTimeout(() => {
        t.classList.add('toast-exit');
        setTimeout(() => t.remove(), 320);
    }, duration);
}

// ── Defense Selection Modal ─────────────────────────────────────
function openDefenseModal(attackerId, defender, attackPower, attackCardName, attackCardDesc) {
    return new Promise(resolve => {
        const modal   = document.getElementById('defense-modal');
        const cardsEl = document.getElementById('dmod-cards');
        const skipBtn = document.getElementById('btn-dmod-skip');
        const attacker = players.find(p => p.id === attackerId);

        // Populate header
        document.getElementById('dmod-attacker-name').textContent   = attacker ? attacker.name : 'Attacker';
        document.getElementById('dmod-attack-card-name').textContent = attackCardName;
        document.getElementById('dmod-attack-card-power').textContent= `Power: ${attackPower}`;
        document.getElementById('dmod-attack-card-desc').textContent = attackCardDesc || '';

        // Find valid defenses
        const validDefenses = defender.hand
            .map((c, idx) => ({ card: c, idx }))
            .filter(({ card }) => card.type === 'defence' && card.power >= attackPower);

        cardsEl.innerHTML = '';

        if (validDefenses.length === 0) {
            document.getElementById('dmod-title').textContent    = 'No Defense Available';
            document.getElementById('dmod-subtitle').textContent = `${defender.name} has no cards strong enough to block this attack.`;
            cardsEl.innerHTML = `<div class="dmod-no-defense"><span class="dmod-no-def-icon">💀</span>Hand has no defense cards with Power ≥ ${attackPower}.</div>`;
        } else {
            document.getElementById('dmod-title').textContent    = `${defender.name} — Choose Your Defense`;
            document.getElementById('dmod-subtitle').textContent = `Select a defense card to block the ${attackCardName} (Power ${attackPower})`;
            validDefenses.forEach(({ card, idx }) => {
                const el = document.createElement('div');
                el.className = 'dmod-card-option';
                el.innerHTML = `<div class="dmod-card-shield">🛡️</div><div class="dmod-card-name">${card.name}</div><div class="dmod-card-power-badge">${card.power}</div><div class="dmod-card-desc">${card.desc}</div>`;
                el.addEventListener('click', () => {
                    defender.hand.splice(idx, 1);
                    lastPlayedCard = card;
                    const attackerName = attacker ? attacker.name : 'attacker';
                    logAction(`<strong>${defender.name}</strong> played a Defense Card (Power ${card.power}) and blocked the ${attackCardName} from ${attackerName}!`);
                    showToast('defense', 'Attack Blocked!', `${defender.name} used a Defense Card (Power ${card.power}).`);
                    cleanup();
                    resolve(true); // blocked
                });
                cardsEl.appendChild(el);
            });
        }

        const handleSkip = () => { cleanup(); resolve(false); };
        skipBtn.addEventListener('click', handleSkip);

        function cleanup() {
            skipBtn.removeEventListener('click', handleSkip);
            modal.classList.remove('visible');
        }

        modal.classList.add('visible');
    });
}

async function attemptAttackAsync(attackerId, defenderId, attackPower, attackCardName, attackCardDesc) {
    const defender = players.find(p => p.id === defenderId);
    if (!defender) return false; // not blocked
    const attacker = players.find(p => p.id === attackerId);
    showToast('attack', 'Incoming Attack!', `${attacker ? attacker.name : '?'} used ${attackCardName} (Power ${attackPower}) on ${defender.name}!`);
    const blocked = await openDefenseModal(attackerId, defender, attackPower, attackCardName, attackCardDesc);
    return blocked;
}

// ── Enhanced Bid War (split-screen overlay) ─────────────────────
let bidTimerInterval = null;

function stopBidTimer() {
    if (bidTimerInterval) { clearInterval(bidTimerInterval); bidTimerInterval = null; }
}

function startBidTimer(seconds, onExpire) {
    stopBidTimer();
    const numEl    = document.getElementById('bid-timer-num');
    const fillEl   = document.getElementById('bid-timer-circle');
    const circumf  = 213.6;
    let remaining  = seconds;

    function tick() {
        if (numEl)  numEl.textContent = remaining;
        if (fillEl) {
            fillEl.style.strokeDashoffset = circumf * (1 - remaining / seconds);
            fillEl.classList.toggle('urgent', remaining <= 8);
        }
        if (remaining <= 0) { stopBidTimer(); onExpire(); return; }
        remaining--;
    }
    tick();
    bidTimerInterval = setInterval(tick, 1000);
}

function updateBidHighest(amount, leaderName) {
    const valEl    = document.getElementById('bid-highest-value');
    const leaderEl = document.getElementById('bid-highest-leader');
    if (valEl)    { valEl.textContent = amount; valEl.classList.remove('bump'); void valEl.offsetWidth; valEl.classList.add('bump'); }
    if (leaderEl)  leaderEl.textContent = leaderName ? `— ${leaderName}` : '—';
}

function setBidTurnSide(activeSide) {
    // activeSide: 'left' | 'right' | null
    const leftH  = document.getElementById('bid-left-side');
    const rightH = document.getElementById('bid-right-side');
    const leftI  = document.getElementById('bid-left-active-indicator');
    const rightI = document.getElementById('bid-right-active-indicator');
    if (!leftH || !rightH) return;
    leftH.classList.toggle('turn-inactive',  activeSide !== 'left');
    rightH.classList.toggle('turn-inactive', activeSide !== 'right');
    if (leftI)  leftI.classList.toggle('active',  activeSide === 'left');
    if (rightI) rightI.classList.toggle('active', activeSide === 'right');
}

function openSplitBidOverlay(leftPlayer, rightPlayer, segmentName, segmentStatus) {
    const overlay = document.getElementById('split-bid-overlay');
    // Segment info
    const snEl = document.getElementById('bid-segment-name');
    const ssEl = document.getElementById('bid-segment-status');
    if (snEl) snEl.textContent = segmentName;
    if (ssEl) ssEl.textContent = segmentStatus || '';
    // Left player
    const laEl = document.getElementById('bid-left-avatar');
    const lnEl = document.getElementById('bid-left-name');
    const ltEl = document.getElementById('bid-left-tokens-live');
    if (laEl) { laEl.textContent = leftPlayer.name.charAt(0); laEl.style.background = leftPlayer.color; laEl.style.borderColor = leftPlayer.color; }
    if (lnEl) lnEl.textContent = leftPlayer.name;
    if (ltEl) ltEl.textContent = `Tokens: ${leftPlayer.tokens}`;
    // Right player
    const raEl = document.getElementById('bid-right-avatar');
    const rnEl = document.getElementById('bid-right-name');
    const rtEl = document.getElementById('bid-right-tokens-live');
    if (raEl) { raEl.textContent = rightPlayer.name.charAt(0); raEl.style.background = rightPlayer.color; raEl.style.borderColor = rightPlayer.color; }
    if (rnEl) rnEl.textContent = rightPlayer.name;
    if (rtEl) rtEl.textContent = `Tokens: ${rightPlayer.tokens}`;
    // Reset totals & bid displays
    ['bid-left-total','bid-right-total'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='0'; });
    updateBidHighest(0, null);
    // Hide result/continue
    const resultEl = document.getElementById('bid-result-text');
    const contBtn  = document.getElementById('btn-bid-continue');
    if (resultEl) { resultEl.style.display='none'; resultEl.className='bid-result-text'; }
    if (contBtn)  contBtn.style.display = 'none';
    // Lock flippers
    ['bid-left-flipper','bid-right-flipper'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.remove('flipped'); });
    // Lock board
    document.querySelector('.game-container')?.classList.add('board-locked');
    overlay.style.display = 'flex';
    showToast('bid', 'Bidding War!', `${leftPlayer.name} vs ${rightPlayer.name} for ${segmentName}`);
}

function closeSplitBidOverlay() {
    stopBidTimer();
    const overlay = document.getElementById('split-bid-overlay');
    if (overlay) overlay.style.display = 'none';
    document.querySelector('.game-container')?.classList.remove('board-locked');
    setBidTurnSide(null);
}

async function executeBiddingWar(challenger, defender, segment, segEl, onComplete) {
    const segName   = segEl.innerText.split('\n')[0].trim();
    const segStatus = `Challenger: ${challenger.name}`;

    // Challenger = left, defender = right
    openSplitBidOverlay(challenger, defender, segName, segStatus);

    let currentBid   = 0;
    let highestBidder = null;
    let activeBidder  = challenger;   // challenger goes first
    let inactiveBidder= defender;
    let activeSide    = 'left';
    let resolved      = false;

    // Wire add-buttons for both sides
    let leftBid  = 0;
    let rightBid = 0;

    const leftTotalEl  = document.getElementById('bid-left-total');
    const rightTotalEl = document.getElementById('bid-right-total');
    const leftTokenEl  = document.getElementById('bid-left-tokens-live');
    const rightTokenEl = document.getElementById('bid-right-tokens-live');

    function refreshAddButtons(side, bidder, myBid) {
        document.querySelectorAll(`.${side}-add`).forEach(btn => {
            const v = parseInt(btn.getAttribute('data-val'), 10);
            btn.disabled = (v < 0 && myBid + v < 0) || (bidder.tokens - (myBid + v) < 3);
        });
        const confirmBtn = document.getElementById(`btn-${side}-confirm`);
        if (confirmBtn) confirmBtn.disabled = myBid <= currentBid;
    }

    function addBidAmount(side, val) {
        if (side === 'left') {
            leftBid  = Math.max(0, leftBid + val);
            if (leftTotalEl) leftTotalEl.textContent = leftBid;
            refreshAddButtons('left', challenger, leftBid);
        } else {
            rightBid = Math.max(0, rightBid + val);
            if (rightTotalEl) rightTotalEl.textContent = rightBid;
            refreshAddButtons('right', defender, rightBid);
        }
    }

    // Add-btn handlers
    const leftAddBtns  = document.querySelectorAll('.left-add');
    const rightAddBtns = document.querySelectorAll('.right-add');
    const leftAddH  = e => addBidAmount('left',  parseInt(e.target.getAttribute('data-val'),10));
    const rightAddH = e => addBidAmount('right', parseInt(e.target.getAttribute('data-val'),10));
    leftAddBtns.forEach(b  => b.addEventListener('click', leftAddH));
    rightAddBtns.forEach(b => b.addEventListener('click', rightAddH));

    function cleanup() {
        leftAddBtns.forEach(b  => b.removeEventListener('click', leftAddH));
        rightAddBtns.forEach(b => b.removeEventListener('click', rightAddH));
    }

    function setActiveSideUI() {
        setBidTurnSide(activeSide);
        // Reset that side's local bid to just above current
        if (activeSide === 'left') {
            leftBid = currentBid;
            if (leftTotalEl) leftTotalEl.textContent = leftBid;
            if (leftTokenEl)  leftTokenEl.textContent = `Tokens: ${challenger.tokens}`;
            refreshAddButtons('left', challenger, leftBid);
        } else {
            rightBid = currentBid;
            if (rightTotalEl) rightTotalEl.textContent = rightBid;
            if (rightTokenEl)  rightTokenEl.textContent = `Tokens: ${defender.tokens}`;
            refreshAddButtons('right', defender, rightBid);
        }
    }

    async function doResolve(winner, loser, winBid, winSide, defWin) {
        if (resolved) return;
        resolved = true;
        cleanup();
        stopBidTimer();

        if (winner === challenger) {
            challenger.tokens -= winBid;
            logAction(`<strong>${challenger.name}</strong> won the bid war with ${winBid} tokens and stole ${segName}!`);
            showToast('win', 'Bid War Won!', `${challenger.name} stole ${segName} for ${winBid} tokens.`);
            await executeAttackSteal(challenger, defender, segment, segEl.getAttribute('data-id'));
        } else {
            defender.tokens -= winBid;
            logAction(`<strong>${defender.name}</strong> won the bid war with ${winBid} tokens and defended ${segName}!`);
            showToast('win', 'Defense Successful!', `${defender.name} defended ${segName} for ${winBid} tokens.`);
        }
        // Update token displays
        if (leftTokenEl)  leftTokenEl.textContent  = `Tokens: ${challenger.tokens}`;
        if (rightTokenEl) rightTokenEl.textContent = `Tokens: ${defender.tokens}`;

        // Flip winner's card
        const winFlipper = document.getElementById(winSide === 'left' ? 'bid-left-flipper' : 'bid-right-flipper');
        const winReveal  = document.getElementById(winSide === 'left' ? 'bid-left-reveal' : 'bid-right-reveal');
        if (winReveal)  winReveal.textContent = winBid;
        if (winFlipper) winFlipper.classList.add('flipped');

        const resultEl = document.getElementById('bid-result-text');
        const contBtn  = document.getElementById('btn-bid-continue');
        if (resultEl) {
            resultEl.textContent = defWin ? 'SEGMENT DEFENDED' : 'SEGMENT CAPTURED';
            resultEl.className   = `bid-result-text ${defWin ? 'defended' : 'win'}`;
            resultEl.style.display = 'block';
        }
        if (contBtn) {
            contBtn.style.display = 'block';
            const contH = () => { contBtn.style.display='none'; contBtn.removeEventListener('click',contH); closeSplitBidOverlay(); onComplete(); };
            contBtn.addEventListener('click', contH);
        } else {
            setTimeout(() => { closeSplitBidOverlay(); onComplete(); }, 2500);
        }
    }

    function onTimerExpire() {
        if (resolved) return;
        // Current active bidder auto-folds
        logAction(`⏱️ Time expired! <strong>${activeBidder.name}</strong> auto-folded.`);
        showToast('info', 'Time Up!', `${activeBidder.name} ran out of time and folded.`);
        const winner    = inactiveBidder;
        const winSide   = activeSide === 'left' ? 'right' : 'left';
        doResolve(winner, activeBidder, currentBid, winSide, winner === defender);
    }

    // Confirm handlers
    const leftConfirmBtn  = document.getElementById('btn-left-confirm');
    const rightConfirmBtn = document.getElementById('btn-right-confirm');
    const leftFoldBtn     = document.getElementById('btn-left-fold');
    const rightFoldBtn    = document.getElementById('btn-right-fold');

    const leftConfirmH = () => {
        if (activeSide !== 'left' || resolved) return;
        if (leftBid <= currentBid) return;
        currentBid = leftBid;
        updateBidHighest(currentBid, challenger.name);
        logAction(`<strong>${challenger.name}</strong> bids ${currentBid} tokens.`);
        showToast('bid', 'New Bid!', `${challenger.name} bids ${currentBid} tokens.`);
        activeBidder   = defender;   inactiveBidder = challenger;
        activeSide     = 'right';
        setActiveSideUI();
        startBidTimer(30, onTimerExpire);
    };
    const rightConfirmH = () => {
        if (activeSide !== 'right' || resolved) return;
        if (rightBid <= currentBid) return;
        currentBid = rightBid;
        updateBidHighest(currentBid, defender.name);
        logAction(`<strong>${defender.name}</strong> bids ${currentBid} tokens.`);
        showToast('bid', 'New Bid!', `${defender.name} bids ${currentBid} tokens.`);
        activeBidder   = challenger; inactiveBidder = defender;
        activeSide     = 'left';
        setActiveSideUI();
        startBidTimer(30, onTimerExpire);
    };
    const leftFoldH = () => {
        if (activeSide !== 'left' || resolved) return;
        logAction(`<strong>${challenger.name}</strong> folded the bid.`);
        doResolve(defender, challenger, currentBid, 'right', true);
    };
    const rightFoldH = () => {
        if (activeSide !== 'right' || resolved) return;
        logAction(`<strong>${defender.name}</strong> folded the bid.`);
        doResolve(challenger, defender, currentBid, 'left', false);
    };

    if (leftConfirmBtn)  leftConfirmBtn.addEventListener('click',  leftConfirmH);
    if (rightConfirmBtn) rightConfirmBtn.addEventListener('click', rightConfirmH);
    if (leftFoldBtn)     leftFoldBtn.addEventListener('click',     leftFoldH);
    if (rightFoldBtn)    rightFoldBtn.addEventListener('click',    rightFoldH);

    // Start — challenger goes first
    setActiveSideUI();
    startBidTimer(30, onTimerExpire);
}

function playCard(handIdx) {
    overlayedCardIdx = -1;
    document.body.classList.remove('card-overlay-open');
    const backdrop = document.getElementById('card-backdrop');
    if (backdrop) {
        backdrop.classList.remove('visible');
        backdrop.style.display = 'none';
    }
    const cp = players[currentPlayerIndex];
    const card = cp.hand[handIdx];
    
    if (card.type === 'claim') {
        showToast('info', 'Claim Card', `Click a Level ${card.level || '?'} segment on the board to use ${card.name}.`);
        return;
    }
    if (card.type === 'defence') {
        showToast('info', 'Defense Card', 'Defense cards activate automatically when you are attacked.');
        return;
    }
    if (card.type === 'attack') {
        if (card.name === 'COPYCAT') {
            resolveCopycat(handIdx);
            return;
        }
        // Enter targeting mode
        targetingMode = { cardIdx: handIdx, card: card, targets: [] };
        document.body.classList.add('targeting-active');
        logAction(`<em>${cp.name} is targeting with ${card.name}...</em>`);
        showToast('attack', 'Targeting Mode', `Select a segment on the board for ${card.name}.`);
        return;
    }
}

function cancelTargeting() {
    targetingMode = null;
    document.body.classList.remove('targeting-active');
}

function wasteCard(handIdx) {
    overlayedCardIdx = -1;
    document.body.classList.remove('card-overlay-open');
    const backdrop = document.getElementById('card-backdrop');
    if (backdrop) {
        backdrop.classList.remove('visible');
        backdrop.style.display = 'none';
    }
    const cp = players[currentPlayerIndex];
    const card = cp.hand[handIdx];
    
    const cardEls = handEl.querySelectorAll('.game-card');
    const cardEl = cardEls[handIdx];
    if (cardEl) {
        cardEl.classList.add('waste-animation');
    }
    
    setTimeout(() => {
        cp.hand.splice(handIdx, 1);
        lastWastedCard = card;
        
        const cost = card.cost || 0;
        if (cost > 0) {
            cp.tokens -= cost;
            logAction(`<strong>${cp.name}</strong> wasted ${card.name} and paid ${cost} tokens.`);
            if (cp.tokens < 3) {
                declareBankruptcy(cp);
                logAction(`<strong>${cp.name}</strong> went bankrupt from wasting a card!`);
            }
        } else {
            logAction(`<strong>${cp.name}</strong> wasted ${card.name}.`);
        }
        endTurn();
    }, 400);
}

async function resolveCopycat(handIdx) {
    const cp = players[currentPlayerIndex];
    if (!lastAction) {
        showToast('info', 'No Action', 'No previous action to copy!');
        return;
    }
    let power = 2;
    cp.hand.splice(handIdx, 1);
    logAction(`<strong>${cp.name}</strong> played COPYCAT! Mirroring the last action...`);
    
    if (lastAction.type === 'claim') {
        const targetSeg = board[lastAction.segmentId];
        if (targetSeg && targetSeg.owner !== null) {
            const blocked = await attemptAttackAsync(cp.id, targetSeg.owner, power, 'COPYCAT', 'Mirrors the previous action.');
            if (!blocked) executeAttackSteal(cp, players.find(p => p.id === targetSeg.owner), targetSeg, lastAction.segmentId);
        }
    } else if (lastAction.type === 'attack') {
        if (lastAction.targetId) {
            const targetSeg = board[lastAction.targetId];
            if (targetSeg && targetSeg.owner !== null) {
                const blocked = await attemptAttackAsync(cp.id, targetSeg.owner, power, 'COPYCAT', 'Mirrors the previous action.');
                if (!blocked) executeAttackSteal(cp, players.find(p => p.id === targetSeg.owner), targetSeg, lastAction.targetId);
            } else {
                logAction('Target segment is already empty. Copycat fails.');
            }
        }
    }
    updateUI();
    endTurn();
}

// Pay-or-lose modal for ATTACK card defense
function openPayOrLoseModal(defender, cost, segmentName, onPay, onLose) {
    return new Promise(resolve => {
        const modal = document.getElementById('defense-modal');
        const cardsEl = document.getElementById('dmod-cards');
        const skipBtn = document.getElementById('btn-dmod-skip');

        document.getElementById('dmod-attacker-name').textContent    = 'ATTACK';
        document.getElementById('dmod-attack-card-name').textContent  = 'Segment Under Attack';
        document.getElementById('dmod-attack-card-power').textContent = `Cost to Hold: ${cost} tokens`;
        document.getElementById('dmod-attack-card-desc').textContent  = segmentName;
        document.getElementById('dmod-title').textContent    = `${defender.name} — Pay or Surrender?`;
        document.getElementById('dmod-subtitle').textContent = `Pay ${cost} tokens to keep ${segmentName}, or surrender it.`;

        cardsEl.innerHTML = '';
        const canPay = defender.tokens - cost >= 3;
        if (canPay) {
            const payEl = document.createElement('div');
            payEl.className = 'dmod-card-option';
            payEl.innerHTML = `<div class="dmod-card-shield">💰</div><div class="dmod-card-name">Pay to Hold</div><div class="dmod-card-power-badge">${cost}</div><div class="dmod-card-desc">Spend ${cost} tokens to keep the segment.</div>`;
            payEl.addEventListener('click', () => { cleanup(); onPay(); resolve(); });
            cardsEl.appendChild(payEl);
        }
        skipBtn.textContent = '🏳️ Surrender — Give up the segment';
        const handleSkip = () => { cleanup(); onLose(); resolve(); };
        skipBtn.addEventListener('click', handleSkip);

        function cleanup() {
            skipBtn.removeEventListener('click', handleSkip);
            skipBtn.textContent = '🛡️ No Defense — Take the Hit';
            modal.classList.remove('visible');
        }
        modal.classList.add('visible');
    });
}

async function handleTargetingClick(id, segment, segEl) {
    const cp = players[currentPlayerIndex];
    const card = targetingMode.card;
    const handIdx = targetingMode.cardIdx;
    
    const finish = () => {
        const cardEls = handEl.querySelectorAll('.game-card');
        const cardEl = cardEls[handIdx];
        if (cardEl) {
            cardEl.classList.add('play-animation');
        }
        setTimeout(() => {
            cp.hand.splice(handIdx, 1);
            lastPlayedCard = card;
            lastAction = { type: 'attack', targetId: id };
            cancelTargeting();
            updateUI();
            endTurn();
        }, 400);
    };

    if (card.name === 'ATTACK') {
        if (segment.owner === null || segment.owner === cp.id) { showToast('info','Invalid Target',"Must target an opponent's segment."); return; }
        const defender = players.find(p => p.id === segment.owner);
        const blocked = await attemptAttackAsync(cp.id, defender.id, card.power, card.name, card.desc);
        if (!blocked) {
            // Defender must pay 3 tokens or lose segment
            if (defender.tokens - 3 >= 3) {
                // Show a confirm-style choice via a mini toast + prompt handled inline
                // We'll auto-resolve: defender pays if they can afford it, otherwise loses segment
                // For pass-and-play, show defense-payment modal inline
                await new Promise(resolvePay => {
                    openPayOrLoseModal(defender, 3, segEl.innerText.split('\n')[0].trim(), () => {
                        defender.tokens -= 3;
                        logAction(`${defender.name} paid 3 tokens to hold their ground against ATTACK!`);
                        showToast('defense','Segment Held!',`${defender.name} paid 3 tokens to hold the segment.`);
                        resolvePay();
                    }, async () => {
                        await executeAttackSteal(cp, defender, segment, id);
                        resolvePay();
                    });
                });
            } else {
                await executeAttackSteal(cp, defender, segment, id);
            }
        }
        finish();
    }
    
    else if (card.name === 'SEGMENT STEAL') {
        if (segment.owner !== null) { showToast('info','Invalid Target','Must target an UNCAPTURED segment.'); return; }
        let cpLvl = getHighestSegmentLevel(cp.id);
        if (cpLvl === 0) cpLvl = 1;
        if (segment.level !== cpLvl && segment.level !== cpLvl + 1) {
            showToast('info','Invalid Target',`Must target Level ${cpLvl} or Level ${cpLvl+1}.`);
            return;
        }
        await executeAttackSteal(cp, null, segment, id);
        finish();
    }
    
    else if (card.name === 'DISRUPT') {
        if (segment.owner === null || segment.owner === cp.id) { showToast('info','Invalid Target',"Must target an opponent's segment."); return; }
        const defender = players.find(p => p.id === segment.owner);
        const blocked = await attemptAttackAsync(cp.id, defender.id, card.power, card.name, card.desc);
        if (!blocked) {
            let maxLvl = getHighestSegmentLevel(defender.id);
            let dropped = 0;
            Object.keys(board).forEach(sid => {
                if (board[sid].owner === defender.id && board[sid].level === maxLvl) {
                    board[sid].owner = null; board[sid].power = 0; dropped++;
                }
            });
            logAction(`<strong>${cp.name}</strong> used DISRUPT! ${defender.name} lost all ${dropped} segments on Level ${maxLvl}!`);
            showToast('attack','DISRUPT!',`${defender.name} lost ${dropped} Level ${maxLvl} segment(s)!`);
        }
        finish();
    }
    
    else if (card.name === 'BID') {
        if (segment.owner === null || segment.owner === cp.id) { showToast('info','Invalid Target',"Must target an opponent's segment."); return; }
        const defender = players.find(p => p.id === segment.owner);
        const blocked = await attemptAttackAsync(cp.id, defender.id, card.power, card.name, card.desc);
        if (!blocked) {
            await new Promise(res => executeBiddingWar(cp, defender, segment, segEl, res));
        }
        finish();
    }
    
    else if (card.name === 'COMPETITIVE STRIKE') {
        if (segment.owner === null || segment.owner === cp.id) { showToast('info','Invalid Target',"Must target an opponent's segment."); return; }
        if (segment.level > 2) { showToast('info','Invalid Target','COMPETITIVE STRIKE only works on Level 1 or Level 2 segments.'); return; }
        const defender = players.find(p => p.id === segment.owner);
        const blocked = await attemptAttackAsync(cp.id, defender.id, card.power, card.name, card.desc);
        if (!blocked) {
            await new Promise(res => executeBiddingWar(cp, defender, segment, segEl, res));
        }
        finish();
    }
    
    else if (card.name === 'BLITZ ATTACK') {
        if (segment.owner === null || segment.owner === cp.id) { showToast('info','Invalid Target',"Must target an opponent's segment."); return; }
        if (targetingMode.targets.includes(id)) { showToast('info','Already Targeted','Already targeted this segment.'); return; }
        
        targetingMode.targets.push(id);
        segEl.style.boxShadow = '0 0 10px red';
        
        if (targetingMode.targets.length === 2) {
            let t1 = board[targetingMode.targets[0]];
            let t2 = board[targetingMode.targets[1]];
            let d1 = players.find(p => p.id === t1.owner);
            let d2 = players.find(p => p.id === t2.owner);

            const b1 = await attemptAttackAsync(cp.id, d1.id, card.power, card.name, card.desc);
            if (!b1) { t1.owner = null; t1.power = 0; logAction(`BLITZ hit! ${d1.name} lost a segment.`); showToast('attack','BLITZ!',`${d1.name} lost a segment.`); }
            const b2 = d2 ? await attemptAttackAsync(cp.id, d2.id, card.power, card.name, card.desc) : true;
            if (!b2 && t2.owner !== null) { t2.owner = null; t2.power = 0; logAction(`BLITZ hit! ${d2.name} lost a segment.`); showToast('attack','BLITZ!',`${d2.name} lost a segment.`); }

            document.querySelectorAll('.segment').forEach(s => s.style.boxShadow='');
            finish();
        } else {
            showToast('attack','BLITZ','Select the second target for BLITZ ATTACK.');
        }
    }
}

async function handleSegmentClick(id, segEl) {
    const cp = players[currentPlayerIndex];
    const segment = board[id];
    
    if (targetingMode) {
        handleTargetingClick(id, segment, segEl);
        return;
    }
    
    // Claiming empty segment
    if (segment.owner === null) {
        let cost = segmentCosts[segment.level];
        let needsCard = true;
        
        if (segment.level === 1 && eventModifiers.l1FreeNoCard) { cost = 0; needsCard = false; }
        if (segment.level === 2 && eventModifiers.l2FirstFree)   { cost = 0; }
        if (segment.level === 2 && eventModifiers.l1PlayersFreeL2 && getHighestSegmentLevel(cp.id) === 1) { cost = 0; }
        if (segment.level === 4 && eventModifiers.l4NoCard)       { needsCard = false; }
        
        let cardToUseIdx = -1;
        let cardUsed = null;
        if (needsCard) {
            let validCards = [];
            const segLetter = id.split('-')[1];
            cp.hand.forEach((c, idx) => {
                if (c.type === 'claim' && c.level === segment.level) {
                    if (c.targets.includes('Any') || c.targets.includes('Top') || c.targets.includes(segLetter)) {
                        validCards.push({card: c, idx: idx});
                    }
                }
            });
            if (validCards.length === 0) {
                showToast('info','No Card','You need a matching Dot Card in your hand to claim this segment!');
                return;
            }
            validCards.sort((a, b) => {
                const aWild = a.card.targets.includes('Any') || a.card.targets.includes('Top');
                const bWild = b.card.targets.includes('Any') || b.card.targets.includes('Top');
                if (aWild && !bWild) return 1;
                if (!aWild && bWild) return -1;
                return a.card.power - b.card.power;
            });
            cardToUseIdx = validCards[0].idx;
            cardUsed     = validCards[0].card;
        }

        if (segment.level > 1) {
            const requiredLevel = segment.level - 1;
            const ownsRequired  = Object.values(board).some(s => s.owner === cp.id && s.level === requiredLevel);
            if (!ownsRequired) {
                showToast('info','Prerequisite Missing',`You must own at least one Level ${requiredLevel} segment first!`);
                return;
            }
        }
        
        if (cp.tokens - cost >= 3) {
            if (cp.flags <= 0) {
                const bought = await promptBuyFlagIfNeeded(cp);
                if (!bought) return;
            }
            
            const cardEls = handEl.querySelectorAll('.game-card');
            const cardEl = cardToUseIdx !== -1 ? cardEls[cardToUseIdx] : null;
            if (cardEl) {
                cardEl.classList.add('play-animation');
            }
            
            setTimeout(() => {
                cp.tokens -= cost;
                cp.flags  -= 1;
                if (cardToUseIdx !== -1) {
                    cp.hand.splice(cardToUseIdx, 1);
                    segment.power = cardUsed.power;
                    lastPlayedCard = cardUsed;
                }
                segment.owner = cp.id;
                lastAction = { type: 'claim', segmentId: id };
                if (segment.level === 2 && eventModifiers.l2FirstFree) {
                    eventModifiers.l2FirstFree = false;
                    logAction(`<strong>${cp.name}</strong> claimed the first Level 2 segment for FREE!`);
                }
                const segmentName = segEl.innerText.split('\n')[0].trim();
                logAction(`<strong>${cp.name}</strong> played a Dot Card and conquered ${segmentName} for ${cost} tokens.`);
                showToast('info','Segment Claimed!',`${cp.name} conquered ${segmentName}.`);
                updateUI();
                endTurn();
            }, cardEl ? 400 : 0);
        } else {
            showToast('info','Not Enough Tokens',`Cost is ${cost} tokens and you must keep at least 3.`);
        }
    } else {
        // Belong to someone else
        if (segment.owner !== cp.id) {
            if (!eventModifiers.attacksAllowed) {
                showToast('info','Peace Treaty','No attacks allowed this round.');
                return;
            }
            
            let cardToUseIdx = -1;
            let cardUsed = null;
            let validCards = [];
            const segLetter = id.split('-')[1];
            
            cp.hand.forEach((c, idx) => {
                if (c.type === 'claim' && c.level === segment.level) {
                    if (c.targets.includes('Any') || c.targets.includes('Top') || c.targets.includes(segLetter)) {
                        validCards.push({card: c, idx: idx});
                    }
                }
            });

            if (validCards.length > 0) {
                validCards.sort((a, b) => {
                    const aWild = a.card.targets.includes('Any') || a.card.targets.includes('Top');
                    const bWild = b.card.targets.includes('Any') || b.card.targets.includes('Top');
                    if (aWild && !bWild) return 1;
                    if (!aWild && bWild) return -1;
                    return a.card.power - b.card.power;
                });
                cardToUseIdx = validCards[0].idx;
                cardUsed     = validCards[0].card;

                const prevOwner = players.find(p => p.id === segment.owner);
                if (cp.flags <= 0) {
                    const bought = await promptBuyFlagIfNeeded(cp);
                    if (!bought) return;
                }

                showToast('bid','Bidding War!',`${cp.name} challenges ${prevOwner.name} for ${segEl.innerText.split('\n')[0].trim()}!`);

                let currentBid    = 0;
                let activeBidder  = cp;
                let inactiveBidder= prevOwner;
                let folded        = false;
                let highestBidder = null;

                const segName = segEl.innerText.split('\n')[0].trim();
                openSplitBidOverlay(cp, prevOwner, segName, `Card: ${cardUsed.name}`);

                await new Promise(res => executeBiddingWar(cp, prevOwner, segment, segEl, res));

                if (segment.owner === cp.id) {
                    // challenger won (executeAttackSteal already ran inside executeBiddingWar)
                    let powerFee = Math.ceil(cardUsed.power / 2);
                    cp.tokens -= powerFee;
                    cp.flags  -= 1;
                    cp.hand.splice(cardToUseIdx, 1);
                    segment.power = cardUsed.power;
                    lastPlayedCard = cardUsed;
                    lastAction = { type: 'claim', segmentId: id };
                } else {
                    cp.hand.splice(cardToUseIdx, 1);
                    lastWastedCard = cardUsed;
                    logAction(`<span style="color:${cp.color}">${cp.name}</span> lost the bidding war and their card.`);
                }
                updateUI();
                endTurn();
                return;
            }
            showToast('info','Need a Dot Card','You need a matching Dot Card to start a bidding war. Use an Attack card from your hand to attack directly.');
        }
    }
}

function endGame() {
    // Calculate power points strictly from owned segments
    players.forEach(p => {
        p.powerPoints = 0; // Base points are 0
        Object.values(board).forEach(seg => {
            if (seg.owner === p.id) {
                p.powerPoints += (seg.power || 0);
            }
        });
    });
    
    // Sort by power points (alive only, for standard game outcome message)
    const sorted = [...players].filter(p => !p.bankrupt).sort((a,b) => b.powerPoints - a.powerPoints);
    
    let winnerMsg = "<h3>GAME OVER - FINAL SCORES</h3><ul style='list-style:none; padding:0;'>";
    sorted.forEach(p => {
        winnerMsg += `<li style="color:${p.color}; margin-bottom:5px;"><strong>${p.name}</strong>: ${p.powerPoints} Power Points</li>`;
    });
    winnerMsg += "</ul>";
    
    if (sorted.length > 0) {
        winnerMsg += `<h2 style="color:var(--gold); margin-top:15px;">WINNER: ${sorted[0].name}!</h2>`;
    } else {
        winnerMsg += `<h2 style="color:var(--red-glow); margin-top:15px;">NO WINNERS! (All bankrupt)</h2>`;
    }
    
    logAction(winnerMsg);
    
    if(btnBuyFlag) btnBuyFlag.disabled = true;
    if(btnPass) btnPass.disabled = true;
    if(btnEndGame) btnEndGame.disabled = true;
    handEl.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center;">Game Over</div>';

    // Populate and show the visual Win Screen modal
    const winScreen = document.getElementById('win-screen');
    const winnerNameEl = document.getElementById('winner-name');
    const winnerAvatarEl = document.getElementById('winner-avatar');
    const winnerScoreEl = document.getElementById('winner-score');
    const leaderboardEl = document.getElementById('leaderboard-list');

    if (sorted.length > 0) {
        const winner = sorted[0];
        winnerNameEl.textContent = winner.name;
        winnerNameEl.style.color = winner.color;
        winnerAvatarEl.textContent = winner.name.slice(0, 2).toUpperCase();
        winnerAvatarEl.style.color = winner.color;
        winnerAvatarEl.style.borderColor = winner.color;
        winnerScoreEl.textContent = `${winner.powerPoints} Power Points`;
    } else {
        winnerNameEl.textContent = "NO WINNERS";
        winnerNameEl.style.color = "var(--red-glow)";
        winnerAvatarEl.textContent = "💀";
        winnerAvatarEl.style.color = "var(--red-glow)";
        winnerAvatarEl.style.borderColor = "var(--red-glow)";
        winnerScoreEl.textContent = "All Empires Have Fallen";
    }

    // Rank all players (including bankrupt, but alive rank higher)
    const rankedPlayers = [...players].sort((a, b) => {
        if (a.bankrupt !== b.bankrupt) {
            return a.bankrupt ? 1 : -1;
        }
        return b.powerPoints - a.powerPoints;
    });

    leaderboardEl.innerHTML = '';
    rankedPlayers.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        
        const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));
        const statusClass = p.bankrupt ? 'status-bankrupt' : 'status-alive';
        const statusText = p.bankrupt ? 'Bankrupt' : 'Active';
        
        row.innerHTML = `
            <div class="leaderboard-rank ${rankClass}">#${idx + 1}</div>
            <div class="leaderboard-pcolor" style="color: ${p.color}; background-color: ${p.color}"></div>
            <div class="leaderboard-pname" style="color: ${p.color}">${p.name}</div>
            <div class="leaderboard-status ${statusClass}">${statusText}</div>
            <div class="leaderboard-pscore">${p.powerPoints} pts</div>
        `;
        leaderboardEl.appendChild(row);
    });

    if (winScreen) {
        winScreen.classList.add('visible');
    }
}

function resetGame() {
    // 1. Reset player stats
    players.forEach(p => {
        p.tokens = 15;
        p.flags = 5;
        p.bankrupt = false;
        p.hand = [];
        for (let i = 0; i < 5; i++) {
            const card = drawRandomCard();
            card.isNew = true;
            p.hand.push(card);
        }
    });
    lastPlayedCard = null;
    lastWastedCard = null;

    // 2. Reset board state
    Object.keys(board).forEach(id => {
        board[id].owner = null;
        board[id].power = 0;
    });

    // 3. Reset segment elements in DOM
    document.querySelectorAll('.segment').forEach(seg => {
        seg.classList.remove('claimed');
        seg.style.borderColor = '';
        seg.style.boxShadow = '';
        const ownerLabel = seg.querySelector('.segment-owner');
        if (ownerLabel) ownerLabel.remove();
    });

    // 4. Reset engine parameters
    currentPlayerIndex = 0;
    round = 1;
    activeEvent = null;
    lastAction = null;
    targetingMode = null;
    eventModifiers = {
        revenueMultiplier: 1,
        l3RevenueMultiplier: 1,
        attacksAllowed: true,
        l1FreeNoCard: false,
        l2FirstFree: false,
        l4NoCard: false,
        l1PlayersFreeL2: false
    };

    // 5. Reset UI components
    const eventBox = document.getElementById('active-event-box');
    if (eventBox) eventBox.style.display = 'none';
    if (roundCounterEl) roundCounterEl.textContent = round;
    
    // Clear and log fresh start
    actionLogEl.innerHTML = '';
    logAction('A new battle begins. The Empire Wars have restarted!');

    // 6. Enable buttons
    if (btnBuyFlag) btnBuyFlag.disabled = false;
    if (btnPass) btnPass.disabled = false;
    if (btnEndGame) btnEndGame.disabled = false;

    // 7. Hide Win Screen
    const winScreen = document.getElementById('win-screen');
    if (winScreen) {
        winScreen.classList.remove('visible');
    }

    // 8. Re-init turn
    updateUI();
    startTurn();
}

// Particle system
const particlesEl = document.getElementById('particles');
if (particlesEl) {
    const particleColors = ['rgba(255,215,0,0.7)','rgba(0,170,255,0.6)','rgba(255,45,45,0.5)','rgba(255,204,0,0.6)'];
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 3 + 1;
        const color = particleColors[Math.floor(Math.random() * particleColors.length)];
        p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random() * 100}%;background:${color};animation-duration:${Math.random() * 15 + 10}s;animation-delay:${Math.random() * 10}s;box-shadow:0 0 ${size * 4}px ${color};position:absolute;border-radius:50%;animation:floatUp linear infinite;`;
        particlesEl.appendChild(p);
    }
}

// Wire up Win Screen buttons
const rematchBtn = document.getElementById('btn-rematch');
const lobbyBtn = document.getElementById('btn-lobby');

if (rematchBtn) rematchBtn.addEventListener('click', resetGame);
if (lobbyBtn) lobbyBtn.addEventListener('click', () => { window.location.href = 'players.html'; });

// Boot
initGame();
