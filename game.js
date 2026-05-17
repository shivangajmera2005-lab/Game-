// Game Engine

const segmentCosts = { 1: 0, 2: 3, 3: 5, 4: 8 };
let players = [];
let board = {};
let currentPlayerIndex = 0;
let round = 1;

// State variables for events
let activeEvent = null;
let lastAction = null;
let targetingMode = null;
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
    const data = localStorage.getItem('empireClimbPlayers');
    if (!data) {
        window.location.href = 'players.html';
        return;
    }
    players = JSON.parse(data);
    
    // Add hand to players (5 starting cards each)
    players.forEach(p => {
        p.hand = [];
        for (let i = 0; i < 5; i++) {
            p.hand.push(drawRandomCard());
        }
    });

    // Init board
    document.querySelectorAll('.segment').forEach(seg => {
        const id = seg.getAttribute('data-id');
        board[id] = { owner: null, level: parseInt(seg.getAttribute('data-level')), power: 0 };
        
        seg.addEventListener('click', () => handleSegmentClick(id, seg));
    });

    logAction('The Empire Wars have begun.');
    updateUI();
    startTurn();
}

function logAction(msg) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = msg;
    actionLogEl.appendChild(entry);
    actionLogEl.scrollTop = actionLogEl.scrollHeight;
}

function updateUI() {
    // Roster
    rosterEl.innerHTML = '';
    players.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = `roster-card ${i === currentPlayerIndex ? 'active-turn' : ''}`;
        card.style.borderColor = p.bankrupt ? '#333' : (i === currentPlayerIndex ? p.color : '');
        card.style.opacity = p.bankrupt ? '0.5' : '1';
        
        card.innerHTML = `
            <div class="roster-header">
                <div class="roster-color" style="background:${p.bankrupt ? '#555' : p.color}"></div>
                <div class="roster-name" style="${p.bankrupt ? 'text-decoration:line-through' : ''}">${p.name}</div>
            </div>
            <div class="roster-stats">
                <div>Tokens: <span class="stat-val ${p.tokens <= 3 ? 'danger' : ''}">${p.tokens}</span></div>
                <div>Flags: <span class="stat-val">${p.flags}</span></div>
            </div>
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
                if (data.justClaimed) {
                    // Trigger reflow and add animation class
                    ownerLabel.classList.remove('just-planted');
                    void ownerLabel.offsetWidth; 
                    ownerLabel.classList.add('just-planted');
                    data.justClaimed = false;
                }
            }
        } else {
            seg.classList.remove('claimed');
            seg.style.borderColor = '';
            if (ownerLabel) ownerLabel.remove();
        }
        
        // Handle Event Badges & Glows
        let badge = seg.querySelector('.event-badge');
        if (badge) badge.remove();
        seg.style.boxShadow = seg.classList.contains('claimed') ? 'inset 0 0 20px rgba(0,0,0,0.5)' : '';

        if (activeEvent) {
            if (activeEvent.name === "DOUBLE REVENUE" || activeEvent.name === "DOUBLE REVENUE II") {
                seg.insertAdjacentHTML('beforeend', `<div class="event-badge">x2</div>`);
            } else if (activeEvent.name === "TRIPLE THREAT" && data.level === 3) {
                seg.insertAdjacentHTML('beforeend', `<div class="event-badge">x3</div>`);
            } else if (activeEvent.name === "OPEN SEASON" && data.level === 1 && data.owner === null) {
                seg.insertAdjacentHTML('beforeend', `<div class="event-badge green">FREE</div>`);
                seg.style.boxShadow = "inset 0 0 15px rgba(255, 107, 0, 0.5), 0 0 15px rgba(255, 107, 0, 0.5)";
            } else if (activeEvent.name === "APEX OPEN" && data.level === 4) {
                seg.insertAdjacentHTML('beforeend', `<div class="event-badge green">OPEN</div>`);
                seg.style.boxShadow = "inset 0 0 15px rgba(255, 107, 0, 0.5), 0 0 15px rgba(255, 107, 0, 0.5)";
            } else if (activeEvent.name === "FREE CLIMB" && data.level === 2 && data.owner === null) {
                let cpLvl = getHighestSegmentLevel(players[currentPlayerIndex].id);
                if (cpLvl === 1) {
                    seg.insertAdjacentHTML('beforeend', `<div class="event-badge green">FREE</div>`);
                }
            }
        }
    });

    // Current Player
    const cp = players[currentPlayerIndex];
    if(cp) {
        currentPlayerNameEl.textContent = cp.name;
        currentPlayerNameEl.style.color = cp.color;
        btnBuyFlag.disabled = cp.tokens < 5 || cp.flags >= 12; // 3 min + 2 cost
        btnPass.disabled = cp.bankrupt;
        
        // Mobile Top Bar Updates
        const mobName = document.getElementById('mobile-player-name');
        const mobTokens = document.getElementById('mobile-player-tokens');
        if (mobName && mobTokens) {
            mobName.textContent = cp.name;
            mobName.style.color = cp.color;
            mobTokens.textContent = cp.tokens;
            mobTokens.className = `stat-val ${cp.tokens <= 3 ? 'danger' : ''}`;
        }
    }

    // Hand
    renderHand();
}

function getMiniBoardSVG(level, targets) {
    if (level === 4) {
        return `<svg viewBox="0 0 100 100" class="mini-board-svg" style="width: 60px;">
            <polygon points="50,10 90,90 10,90" class="mini-seg active" fill="url(#goldGrad)" />
            <defs>
                <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#FFD700" />
                    <stop offset="100%" stop-color="#B8860B" />
                </linearGradient>
            </defs>
        </svg>`;
    }
    
    let html = `<svg viewBox="0 0 100 40" class="mini-board-svg" style="width: 80%;">`;
    const segments = { 1: ['A','B','C','D','E','F'], 2: ['A','B','C','D','E'], 3: ['A','B','C','D'] }[level];
    if (!segments) return '';
    
    const w = 100 / segments.length;
    
    segments.forEach((seg, i) => {
        let isActive = targets.includes('Any') || targets.includes(seg) || targets.includes(`L${level}-${seg}`);
        let x = i * w;
        html += `<rect x="${x+1}" y="10" width="${w-2}" height="20" rx="3" class="mini-seg ${isActive ? 'active' : ''}" />`;
        if (isActive) {
            html += `<text x="${x + w/2}" y="24" font-size="12" font-weight="bold" fill="white" text-anchor="middle" font-family="'Orbitron', monospace">${seg}</text>`;
        }
    });
    
    html += `</svg>`;
    return html;
}

function renderHand() {
    handEl.innerHTML = '';
    const cp = players[currentPlayerIndex];
    if (!cp || cp.hand.length === 0) {
        handEl.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center;">Hand is empty</div>';
        return;
    }
    
    const totalCards = cp.hand.length;
    const maxRot = 20; 
    const rotStep = totalCards > 1 ? (maxRot * 2) / (totalCards - 1) : 0;
    
    cp.hand.forEach((card, idx) => {
        const cEl = document.createElement('div');
        
        let typeClass = '';
        let typeLabel = '';
        
        if (card.type === 'attack') {
            typeClass = 'card-attack';
            typeLabel = 'ATTACK';
        } else if (card.type === 'defence') {
            typeClass = 'card-defense';
            typeLabel = 'DEFENSE';
        } else if (card.type === 'claim') {
            if (card.level === 1) { typeClass = 'card-blue'; typeLabel = 'BLUE SEGMENT'; }
            else if (card.level === 2) { typeClass = 'card-yellow'; typeLabel = 'YELLOW SEGMENT'; }
            else if (card.level === 3) { typeClass = 'card-red'; typeLabel = 'RED SEGMENT'; }
            else if (card.level === 4) { typeClass = 'card-gold'; typeLabel = 'GOLDEN SEGMENT'; }
        }
        
        cEl.className = `game-card ${typeClass}`;
        
        // Event Modifiers on Hand Cards
        let discountHtml = '';
        if (card.type === 'attack') {
            if (activeEvent && activeEvent.name === "CHEAP ATTACKS") {
                discountHtml = `<div class="event-badge green" style="top: -5px; right: -5px;">-2 TKN</div>`;
            }
            if (activeEvent && activeEvent.name === "PEACE TREATY") {
                cEl.classList.add('card-disabled');
                discountHtml = `<div class="event-badge" style="top: 50%; right: 50%; transform: translate(50%, -50%); background: #FF2D2D;">🔒 BLOCKED</div>`;
            }
        }
        
        const rot = totalCards > 1 ? -maxRot + (idx * rotStep) : 0;
        const xNorm = totalCards > 1 ? (idx / (totalCards - 1)) * 2 - 1 : 0; 
        const yOffset = Math.abs(xNorm * xNorm) * 20; 
        
        cEl.style.transform = `translateY(${yOffset}px) rotate(${rot}deg)`;
        
        let miniBoardHtml = '';
        if (card.type === 'claim') {
            miniBoardHtml = `<div class="card-mini-board">
                ${getMiniBoardSVG(card.level, card.targets)}
            </div>`;
        } else {
            miniBoardHtml = `<div style="flex:1"></div>`; // spacer
        }
        
        cEl.innerHTML = `
            ${discountHtml}
            <button class="mobile-close-card-btn action-btn" style="display:none; position:absolute; top: 10px; right: 10px; z-index: 100; border-radius: 50px; padding: 5px 15px; font-size: 0.8rem;">Cancel</button>
            <div class="card-type-label">${typeLabel}</div>
            ${card.power ? `<div class="card-power-badge top-left">${card.power}</div>` : ''}
            <div class="card-title">${card.name}</div>
            
            ${miniBoardHtml}
            
            <div class="card-desc">${card.desc}</div>
            ${card.power ? `<div class="card-power-badge bottom-right">${card.power}</div>` : ''}
            
            <div class="card-actions-overlay">
                <button class="play-btn">Play</button>
                <button class="waste-btn">Waste</button>
            </div>
        `;
        
        // Save transforms so mobile CSS can override and restore
        cEl.style.setProperty('--desktop-transform', `translateY(${yOffset}px) rotate(${rot}deg)`);
        
        // Mobile expansion logic
        cEl.addEventListener('click', (e) => {
            if (document.body.classList.contains('layout-mobile')) {
                // Ignore clicks if it's the action buttons
                if (e.target.classList.contains('play-btn') || e.target.classList.contains('waste-btn')) {
                    return;
                }
                
                // If it's the close button, close it
                if (e.target.classList.contains('mobile-close-card-btn')) {
                    e.stopPropagation();
                    cEl.classList.remove('expanded-mobile');
                    return;
                }
                
                // If not already expanded, expand this one and collapse others
                if (!cEl.classList.contains('expanded-mobile')) {
                    document.querySelectorAll('.game-card.expanded-mobile').forEach(c => c.classList.remove('expanded-mobile'));
                    cEl.classList.add('expanded-mobile');
                }
            }
        });
        
        cEl.querySelector('.play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            cEl.classList.add('card-fly-out');
            setTimeout(() => playCard(idx), 500); // Wait for animation
        });
        
        cEl.querySelector('.waste-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            cEl.classList.add('card-fly-out');
            setTimeout(() => wasteCard(idx), 500);
        });
        
        // Highlighting Logic
        cEl.addEventListener('mouseenter', () => {
            if (card.type === 'claim') {
                document.getElementById('empire-board').classList.add('board-dimmed');
                document.querySelectorAll('.segment').forEach(seg => {
                    const id = seg.getAttribute('data-id');
                    const segLevel = parseInt(seg.getAttribute('data-level'));
                    const segLetter = id.split('-')[1];
                    
                    if (card.level === segLevel) {
                        if (card.targets.includes('Any') || card.targets.includes('Top') || card.targets.includes(segLetter) || card.targets.includes(id)) {
                            seg.classList.add('highlight-active');
                        }
                    }
                });
            }
        });
        
        cEl.addEventListener('mouseleave', () => {
            if (card.type === 'claim') {
                document.getElementById('empire-board').classList.remove('board-dimmed');
                document.querySelectorAll('.segment').forEach(seg => {
                    seg.classList.remove('highlight-active');
                });
            }
        });
        
        handEl.appendChild(cEl);
    });
}

// Turn Logic
function startTurn() {
    const cp = players[currentPlayerIndex];
    if (cp.bankrupt) {
        endTurn();
        return;
    }
    logAction(`<strong>${cp.name}</strong>'s turn begins.`);
    updateUI();
}

async function endTurn() {
    currentPlayerIndex++;
    if (currentPlayerIndex >= players.length) {
        // End of round
        currentPlayerIndex = 0;
        round++;
        if(roundCounterEl) roundCounterEl.textContent = round;
        await processEndRound();
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

async function applyImmediateEvent(ev) {
    if (ev.name === "GROUP VOTES") {
        let targets = players.filter(p => !p.bankrupt && getHighestSegmentLevel(p.id) >= 3);
        if (targets.length > 0) {
            await showGroupVotesModal(targets);
        } else {
            logAction(`No players high enough for GROUP VOTES.`);
        }
    }
    else if (ev.name === "SUMMIT BONUS" || ev.name === "SUMMIT BONUS II") {
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
            showFloatingToken(t.id, 5, 'green');
        });
    }
    else if (ev.name === "UNDERDOG BONUS" || ev.name === "UNDERDOG BONUS II") {
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
            showFloatingToken(t.id, 4, 'green');
        });
    }
    else if (ev.name === "DOUBLE REVENUE" || ev.name === "DOUBLE REVENUE II") {
        eventModifiers.revenueMultiplier = 2;
    }
    else if (ev.name === "TRIPLE THREAT") {
        eventModifiers.l3RevenueMultiplier = 3;
    }
    else if (ev.name === "CHEAP ATTACKS") {
        // Checked in UI/logic
    }
    else if (ev.name === "FREE CLIMB") {
        eventModifiers.l1PlayersFreeL2 = true;
    }
    else if (ev.name === "TOKEN TAX") {
        players.forEach(p => {
            if (p.bankrupt) return;
            p.tokens -= 3;
            showFloatingToken(p.id, -3, 'red');
            if (p.tokens < 3) {
                declareBankruptcy(p);
                logAction(`${p.name} went bankrupt from the Token Tax!`);
            }
        });
    }
    else if (ev.name === "APEX OPEN") {
        eventModifiers.l4NoCard = true;
    }
    else if (ev.name === "SINK OR SWIM") {
        await showSinkOrSwimModal();
    }
    else if (ev.name === "PEACE TREATY") {
        eventModifiers.attacksAllowed = false;
    }
    else if (ev.name === "OPEN SEASON") {
        eventModifiers.l1FreeNoCard = true;
    }
    else if (ev.name === "FREE TILE") {
        eventModifiers.l2FirstFree = true;
    }
}

function showFloatingToken(playerId, amount, type) {
    const rosterCards = document.querySelectorAll('.roster-card');
    if (!rosterCards || rosterCards.length <= playerId) return;
    
    const targetCard = rosterCards[playerId]; // Assuming order matches players array
    if (!targetCard) return;

    const token = document.createElement('div');
    token.className = 'floating-token';
    token.innerText = amount > 0 ? `+${amount}` : `${amount}`;
    token.style.color = type === 'green' ? '#00FF88' : '#FF2D2D';
    
    // Position over the roster card
    const rect = targetCard.getBoundingClientRect();
    token.style.left = `${rect.left + rect.width/2}px`;
    token.style.top = `${rect.top}px`;
    
    document.body.appendChild(token);
    
    setTimeout(() => {
        token.remove();
    }, 1500);
}

function playEventRevealAnimation(ev) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('event-reveal-overlay');
        const cardLarge = document.getElementById('event-card-large');
        const nameEl = document.getElementById('event-large-name');
        const descEl = document.getElementById('event-large-desc');
        const pinned = document.getElementById('pinned-event');
        const pinnedName = document.getElementById('pinned-event-name');
        
        nameEl.innerText = `📢 ${ev.name}`;
        descEl.innerText = ev.desc;
        
        // Hide pinned temporarily
        pinned.style.display = 'none';
        
        overlay.style.display = 'flex';
        cardLarge.className = 'event-card-large event-drop-anim';
        
        // Play horn sound (conceptual)
        console.log("Playing deep horn sound for event reveal...");
        
        // Hold for 5 seconds, then shrink
        setTimeout(() => {
            cardLarge.className = 'event-card-large event-shrink-anim';
            
            setTimeout(() => {
                overlay.style.display = 'none';
                pinnedName.innerText = ev.name;
                pinned.style.display = 'block';
                resolve();
            }, 1000); // Wait for shrink animation to finish
            
        }, 5000); // 5 second hold
    });
}

function showGroupVotesModal(targets) {
    return new Promise((resolve) => {
        const modal = document.getElementById('vote-modal');
        const container = document.getElementById('vote-options-container');
        container.innerHTML = '';
        
        // Count votes per target
        let votes = {};
        targets.forEach(t => votes[t.id] = 0);
        
        let totalVotesExpected = players.filter(p => !p.bankrupt).length;
        let votesCast = 0;
        
        targets.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.style.borderColor = t.color;
            btn.innerText = `Vote: ${t.name}`;
            
            btn.addEventListener('click', () => {
                votes[t.id]++;
                votesCast++;
                
                if (votesCast >= totalVotesExpected) {
                    modal.style.display = 'none';
                    
                    // Find max votes
                    let maxId = null;
                    let maxV = -1;
                    Object.keys(votes).forEach(id => {
                        if (votes[id] > maxV) { maxV = votes[id]; maxId = parseInt(id); }
                    });
                    
                    if (maxId !== null) {
                        logAction(`The group voted out ${players.find(p=>p.id===maxId).name}!`);
                        dropHighestSegment(maxId);
                    }
                    resolve();
                }
            });
            container.appendChild(btn);
        });
        
        modal.style.display = 'flex';
    });
}

function showSinkOrSwimModal() {
    return new Promise((resolve) => {
        // For shared screen, we apply it to ALL players sequentially or just make it an automatic action for now? 
        // The prompt says "each player gets a popup... they must choose". Let's do it for current player, or cycle through players.
        // Actually, to keep it simple, let's just cycle through players one by one.
        
        const modal = document.getElementById('sink-modal');
        const btnPay = document.getElementById('btn-sink-pay');
        const btnDrop = document.getElementById('btn-sink-drop');
        const timerText = document.getElementById('sink-timer-text');
        const title = modal.querySelector('h2');
        
        let activePlayers = players.filter(p => !p.bankrupt);
        let pIndex = 0;
        
        let timerInt;
        
        function promptNextPlayer() {
            if (pIndex >= activePlayers.length) {
                modal.style.display = 'none';
                resolve();
                return;
            }
            
            let p = activePlayers[pIndex];
            title.innerHTML = `<span style="color:${p.color}">${p.name}</span>, SINK OR SWIM!`;
            modal.style.display = 'flex';
            
            let timeLeft = 20;
            timerText.innerText = timeLeft;
            
            btnPay.onclick = () => {
                clearInterval(timerInt);
                if (p.tokens >= 2) {
                    p.tokens -= 2;
                    logAction(`${p.name} paid 2 tokens to swim.`);
                    showFloatingToken(p.id, -2, 'red');
                } else {
                    dropHighestSegment(p.id);
                }
                pIndex++;
                promptNextPlayer();
            };
            
            btnDrop.onclick = () => {
                clearInterval(timerInt);
                dropHighestSegment(p.id);
                pIndex++;
                promptNextPlayer();
            };
            
            timerInt = setInterval(() => {
                timeLeft--;
                timerText.innerText = timeLeft;
                if (timeLeft <= 0) {
                    clearInterval(timerInt);
                    dropHighestSegment(p.id); // Auto penalty
                    pIndex++;
                    promptNextPlayer();
                }
            }, 1000);
        }
        
        promptNextPlayer();
    });
}

async function processEndRound() {
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

    // Remove old pinned event
    document.getElementById('pinned-event').style.display = 'none';

    // Draw Event
    const ev = eventDeck[Math.floor(Math.random() * eventDeck.length)];
    activeEvent = ev;
    
    logAction(`<strong style="color:var(--orange-glow);">EVENT: ${ev.name}</strong> - ${ev.desc}`);

    // Wait for the full screen reveal animation (5 seconds)
    await playEventRevealAnimation(ev);

    // Apply Immediate Effects (await for any voting modals)
    await applyImmediateEvent(ev);

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
                    mult = eventModifiers.l3RevenueMultiplier;
                }
                revenue += base * mult;
            }
        });
        
        if (revenue > 0) {
            p.tokens += revenue;
            logAction(`<span style="color:${p.color}">${p.name}</span> gained ${revenue} tokens from segments.`);
            // showFloatingToken(p.id, revenue, 'green'); // Optional token float for revenue
        }
        
        // 2. Auto-draw up to 5 cards
        let drawn = 0;
        while (p.hand.length < 5) {
            p.hand.push(drawRandomCard());
            drawn++;
        }
        if (drawn > 0) {
            logAction(`<span style="color:${p.color}">${p.name}</span> drew ${drawn} cards.`);
        }
    });
    logAction(`<br>`);
    updateUI(); 
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

function executeAttackSteal(attacker, defender, segment, id) {
    if (attacker.flags <= 0) {
        alert("You don't have enough flags to hold more territory.");
        return;
    }
    attacker.flags -= 1;
    segment.owner = attacker.id;
    segment.justClaimed = true;
    segment.power = 0; // Wiped power on steal unless specified otherwise
    if(defender) {
        logAction(`<strong>${attacker.name}</strong> stole ${document.querySelector(`[data-id="${id}"]`).innerText.split('\n')[0].trim()}! <span style="color:${defender.color}">${defender.name}</span> lost a flag to the bank.`);
    } else {
        logAction(`<strong>${attacker.name}</strong> seized the uncaptured segment ${document.querySelector(`[data-id="${id}"]`).innerText.split('\n')[0].trim()}!`);
    }
}

function attemptAttack(attackerId, defenderId, attackPower, attackCardName, onSuccess) {
    const attacker = players.find(p => p.id === attackerId);
    const defender = players.find(p => p.id === defenderId);
    if (!defender) { onSuccess(); return; }

    const attackerName = attacker ? attacker.name : 'Unknown';

    // Instead of automatically checking for valid defenses, we let the defender see all their defense cards.
    const defenseCards = defender.hand.filter(c => c.type === 'defence');
    
    // Find attack card description for the UI
    let attackDesc = "Attack!";
    const masterAttack = masterDeck.find(c => c.name === attackCardName);
    if(masterAttack) attackDesc = masterAttack.desc;

    // Use async flow for the UI overlay
    openDefenseModal(defender, attackerName, attackCardName, attackPower, attackDesc, defenseCards).then(result => {
        if (result) {
            // result is the chosen defense card
            const handIdx = defender.hand.indexOf(result);
            if (handIdx > -1) {
                defender.hand.splice(handIdx, 1);
            }
            logAction(`<strong>${defender.name}</strong> played ${result.name} and successfully blocked the attack from ${attackerName}!`);
        } else {
            // No defense played or timer expired (auto-lose)
            onSuccess();
        }
    });
}

function openDefenseModal(defender, attackerName, attackCardName, attackPower, attackDesc, defenseCards) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('attack-overlay');
        const statusText = document.getElementById('attack-status-text');
        const attackNameEl = document.getElementById('attack-card-name');
        const attackPowerEl = document.getElementById('attack-card-power');
        const attackDescEl = document.getElementById('attack-card-desc');
        const timerContainer = document.getElementById('defense-timer-container');
        const timerCircle = document.getElementById('timer-circle');
        const timerText = document.getElementById('timer-text');
        const defContainer = document.getElementById('defense-cards-container');

        // Setup UI
        statusText.innerHTML = `<span style="color:white;">${defender.name}</span>, you are attacked by <span style="color:var(--red-glow);">${attackerName}</span>!`;
        attackNameEl.innerText = `⚔️ ${attackCardName}`;
        attackPowerEl.innerText = `Power: ${attackPower}`;
        attackDescEl.innerText = attackDesc;
        
        timerContainer.style.display = 'block';
        defContainer.innerHTML = '';
        
        // Show all defense cards (or lack thereof)
        if (defenseCards.length === 0) {
            defContainer.innerHTML = '<div style="color: #999; font-size: 1.2rem;">No defense cards available.</div>';
        } else {
            defenseCards.forEach(c => {
                const isValid = c.power >= attackPower;
                const cardEl = document.createElement('div');
                cardEl.className = `defense-card-option ${isValid ? 'valid-defense' : 'invalid-defense'}`;
                cardEl.innerHTML = `
                    <div style="font-weight:bold; margin-bottom:5px;">${c.name}</div>
                    <div style="color:var(--gold);">Power: ${c.power}</div>
                    <div style="font-size:0.7em; margin-top:5px; color:#999;">${c.desc}</div>
                `;
                if (isValid) {
                    cardEl.addEventListener('click', () => {
                        handleChoice(c);
                    });
                }
                defContainer.appendChild(cardEl);
            });
        }

        overlay.style.display = 'flex';
        
        // Timer Logic (40 seconds, or 2 seconds if no valid defense)
        const hasValidDefense = defenseCards.some(c => c.power >= attackPower);
        let timeLeft = hasValidDefense ? 40 : 2;
        timerText.innerText = timeLeft;
        timerCircle.style.strokeDashoffset = '0';
        timerCircle.style.stroke = '#00FF88'; // Green initially
        
        const totalDash = 440; // 2 * PI * 70

        const timerInterval = setInterval(() => {
            timeLeft--;
            timerText.innerText = timeLeft;
            
            const offset = totalDash - (timeLeft / 40) * totalDash;
            timerCircle.style.strokeDashoffset = offset;
            
            if (timeLeft <= 20 && timeLeft > 10) {
                timerCircle.style.stroke = '#FFAA00'; // Orange
            } else if (timeLeft <= 10) {
                timerCircle.style.stroke = '#FF2D2D'; // Red
            }

            if (timeLeft <= 0) {
                handleChoice(null);
            }
        }, 1000);

        let resolved = false;

        function handleChoice(chosenCard) {
            if (resolved) return;
            resolved = true;
            clearInterval(timerInterval);
            
            // Flash animation
            if (chosenCard) {
                overlay.classList.add('flash-win');
            } else {
                overlay.classList.add('flash-lose');
            }
            
            setTimeout(() => {
                overlay.classList.remove('flash-win');
                overlay.classList.remove('flash-lose');
                overlay.style.display = 'none';
                resolve(chosenCard);
            }, 1000); // Wait for flash animation to finish
        }
    });
}

async function executeBiddingWar(challenger, defender, segment, segEl, onComplete) {
    const segmentName = segEl.innerText.split('\n')[0].trim();
    const isCaptured = segment.owner !== null;
    
    // Open the split screen modal
    const result = await openSplitBidModal(challenger, defender, segmentName, isCaptured);
    
    if (result.winner === 'challenger') {
        challenger.tokens -= result.challengerBid;
        logAction(`<strong>${challenger.name}</strong> won the bidding war with ${result.challengerBid} tokens and stole the segment!`);
        executeAttackSteal(challenger, defender, segment, segEl.getAttribute('data-id'));
    } else {
        // Defender wins (or tie, where defender wins ties automatically)
        defender.tokens -= result.defenderBid;
        logAction(`<strong>${defender.name}</strong> won the bidding war with ${result.defenderBid} tokens and successfully defended their segment!`);
    }
    onComplete();
}

function openSplitBidModal(challenger, defender, segmentName, isCaptured) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('split-bid-overlay');
        const segNameEl = document.getElementById('bid-segment-name');
        const segStatusEl = document.getElementById('bid-segment-status');
        const lightning = document.getElementById('lightning-divider');
        const resultText = document.getElementById('bid-result-text');
        const continueBtn = document.getElementById('btn-bid-continue');

        // Reset UI state
        overlay.style.display = 'flex';
        resultText.style.display = 'none';
        continueBtn.style.display = 'none';
        lightning.style.transform = 'translateX(-50%) rotate(0deg)';
        lightning.className = 'lightning-divider';
        
        document.getElementById('bid-left-side').className = 'split-half split-left';
        document.getElementById('bid-right-side').className = 'split-half split-right';
        document.getElementById('bid-left-flipper').classList.remove('flipped');
        document.getElementById('bid-right-flipper').classList.remove('flipped');
        
        segNameEl.innerText = segmentName;
        segStatusEl.innerText = isCaptured ? "Currently Captured" : "Uncaptured";

        // Challenger Setup (Left)
        document.getElementById('bid-left-avatar').innerText = challenger.name.substring(0, 2).toUpperCase();
        document.getElementById('bid-left-avatar').style.borderColor = challenger.color;
        document.getElementById('bid-left-avatar').style.color = challenger.color;
        document.getElementById('bid-left-name').innerText = challenger.name;
        
        // Defender Setup (Right)
        document.getElementById('bid-right-avatar').innerText = defender.name.substring(0, 2).toUpperCase();
        document.getElementById('bid-right-avatar').style.borderColor = defender.color;
        document.getElementById('bid-right-avatar').style.color = defender.color;
        document.getElementById('bid-right-name').innerText = defender.name;

        let leftBid = 2; // Minimum opening bid
        let rightBid = 2;
        let leftConfirmed = false;
        let rightConfirmed = false;

        const leftTotal = document.getElementById('bid-left-total');
        const rightTotal = document.getElementById('bid-right-total');
        const leftTokensLive = document.getElementById('bid-left-tokens-live');
        const rightTokensLive = document.getElementById('bid-right-tokens-live');
        const leftConfirmBtn = document.getElementById('btn-left-confirm');
        const rightConfirmBtn = document.getElementById('btn-right-confirm');
        
        leftConfirmBtn.className = 'confirm-bid-btn';
        rightConfirmBtn.className = 'confirm-bid-btn';
        leftConfirmBtn.innerText = 'CONFIRM BID';
        rightConfirmBtn.innerText = 'CONFIRM BID';
        
        // Show bid inputs during bidding phase
        document.getElementById('bid-left-controls').style.visibility = 'visible';
        document.getElementById('bid-right-controls').style.visibility = 'visible';
        
        // Hide flipper numbers until reveal
        document.getElementById('bid-left-reveal').innerText = '';
        document.getElementById('bid-right-reveal').innerText = '';

        function updateUI() {
            // Keep bids between 2 and max possible while keeping 3 tokens
            const maxLeft = Math.max(2, challenger.tokens - 3);
            const maxRight = Math.max(2, defender.tokens - 3);
            
            if (leftBid > maxLeft) leftBid = maxLeft;
            if (leftBid < 2) leftBid = 2;
            if (rightBid > maxRight) rightBid = maxRight;
            if (rightBid < 2) rightBid = 2;

            leftTotal.innerText = leftBid;
            rightTotal.innerText = rightBid;

            const lRem = challenger.tokens - leftBid;
            const rRem = defender.tokens - rightBid;

            leftTokensLive.innerText = `Tokens: ${lRem}`;
            rightTokensLive.innerText = `Tokens: ${rRem}`;

            leftTokensLive.className = `bid-tokens-live ${lRem <= 3 ? 'danger' : ''}`;
            rightTokensLive.className = `bid-tokens-live ${rRem <= 3 ? 'danger' : ''}`;
        }

        updateUI();

        // Event Handlers
        const handleLeftAdd = (e) => {
            if (leftConfirmed) return;
            const val = parseInt(e.target.getAttribute('data-val'), 10);
            leftBid += val;
            updateUI();
        };

        const handleRightAdd = (e) => {
            if (rightConfirmed) return;
            const val = parseInt(e.target.getAttribute('data-val'), 10);
            rightBid += val;
            updateUI();
        };

        const handleLeftConfirm = () => {
            if (leftConfirmed) return;
            leftConfirmed = true;
            leftConfirmBtn.classList.add('confirmed');
            leftConfirmBtn.innerText = 'READY';
            checkReveal();
        };

        const handleRightConfirm = () => {
            if (rightConfirmed) return;
            rightConfirmed = true;
            rightConfirmBtn.classList.add('confirmed');
            rightConfirmBtn.innerText = 'READY';
            checkReveal();
        };

        // Attach listeners
        document.querySelectorAll('.left-add').forEach(b => b.addEventListener('click', handleLeftAdd));
        document.querySelectorAll('.right-add').forEach(b => b.addEventListener('click', handleRightAdd));
        leftConfirmBtn.addEventListener('click', handleLeftConfirm);
        rightConfirmBtn.addEventListener('click', handleRightConfirm);

        function checkReveal() {
            if (leftConfirmed && rightConfirmed) {
                // Reveal Sequence
                document.getElementById('bid-left-controls').style.visibility = 'hidden';
                document.getElementById('bid-right-controls').style.visibility = 'hidden';
                
                document.getElementById('bid-left-reveal').innerText = leftBid;
                document.getElementById('bid-right-reveal').innerText = rightBid;
                
                document.getElementById('bid-left-flipper').classList.add('flipped');
                document.getElementById('bid-right-flipper').classList.add('flipped');

                setTimeout(() => {
                    const leftSide = document.getElementById('bid-left-side');
                    const rightSide = document.getElementById('bid-right-side');
                    
                    let winner = '';
                    if (leftBid > rightBid) {
                        winner = 'challenger';
                        leftSide.classList.add('bid-winner-glow');
                        rightSide.classList.add('bid-loser-half');
                        lightning.style.transform = 'translateX(-50%) rotate(-15deg)';
                        resultText.innerText = 'SEGMENT CAPTURED';
                        resultText.className = 'bid-result-text win';
                    } else {
                        // Tie goes to defender, or defender outbids
                        winner = 'defender';
                        rightSide.classList.add('bid-winner-glow');
                        leftSide.classList.add('bid-loser-half');
                        lightning.style.transform = 'translateX(-50%) rotate(15deg)';
                        resultText.innerText = 'DEFENDED';
                        resultText.className = 'bid-result-text defended';
                    }

                    resultText.style.display = 'block';
                    continueBtn.style.display = 'block';

                    const cleanupAndResolve = () => {
                        document.querySelectorAll('.left-add').forEach(b => b.removeEventListener('click', handleLeftAdd));
                        document.querySelectorAll('.right-add').forEach(b => b.removeEventListener('click', handleRightAdd));
                        leftConfirmBtn.removeEventListener('click', handleLeftConfirm);
                        rightConfirmBtn.removeEventListener('click', handleRightConfirm);
                        continueBtn.removeEventListener('click', cleanupAndResolve);
                        
                        overlay.style.display = 'none';
                        resolve({ winner: winner, challengerBid: leftBid, defenderBid: rightBid });
                    };
                    
                    continueBtn.addEventListener('click', cleanupAndResolve);
                    
                }, 800); // Wait for flip animation
            }
        }
    });
}

function playCard(handIdx) {
    const cp = players[currentPlayerIndex];
    const card = cp.hand[handIdx];
    
    if (card.type === 'claim') {
        alert(`To use ${card.name}, click on a segment of the corresponding level.`);
        return;
    }
    if (card.type === 'defence') {
        alert(`Defense cards cannot be played manually. They are automatically checked when you are attacked.`);
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
        alert(`Select target(s) on the board for ${card.name}.`);
        return;
    }
}

function cancelTargeting() {
    targetingMode = null;
    document.body.classList.remove('targeting-active');
}

function wasteCard(handIdx) {
    const cp = players[currentPlayerIndex];
    const card = cp.hand[handIdx];
    cp.hand.splice(handIdx, 1);
    
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
}

function resolveCopycat(handIdx) {
    const cp = players[currentPlayerIndex];
    if (!lastAction) {
        alert("No previous action to copy!");
        return;
    }
    
    // Copycat acts as Power 2 attack automatically
    let power = 2;
    cp.hand.splice(handIdx, 1);
    logAction(`<strong>${cp.name}</strong> played COPYCAT! Mirroring the last action...`);
    
    if (lastAction.type === 'claim') {
        const targetSeg = board[lastAction.segmentId];
        if (targetSeg) {
            attemptAttack(cp.id, targetSeg.owner, power, 'COPYCAT', () => {
                executeAttackSteal(cp, players.find(p => p.id === targetSeg.owner), targetSeg, lastAction.segmentId);
            });
        }
    } else if (lastAction.type === 'attack') {
        // Just repeat the attack if it's a simple target attack
        if (lastAction.targetId) {
            const targetSeg = board[lastAction.targetId];
            if(targetSeg && targetSeg.owner !== null) {
                attemptAttack(cp.id, targetSeg.owner, power, 'COPYCAT', () => {
                     executeAttackSteal(cp, players.find(p => p.id === targetSeg.owner), targetSeg, lastAction.targetId);
                });
            } else {
                 logAction(`Target segment is already empty. Copycat fails.`);
            }
        }
    }
    endTurn();
}

function handleTargetingClick(id, segment, segEl) {
    const cp = players[currentPlayerIndex];
    const card = targetingMode.card;
    const handIdx = targetingMode.cardIdx;
    
    const finish = () => {
        cp.hand.splice(handIdx, 1);
        lastAction = { type: 'attack', targetId: id }; // Basic tracking
        cancelTargeting();
        endTurn();
    };

    if (card.name === 'ATTACK') {
        if (segment.owner === null || segment.owner === cp.id) return alert("Must target an opponent's segment.");
        
        attemptAttack(cp.id, segment.owner, card.power, card.name, () => {
            const defender = players.find(p => p.id === segment.owner);
            if (defender.tokens >= 3) {
                const pay = confirm(`[ATTACK] ${defender.name}, pay 3 extra tokens to defend your segment ${segEl.innerText.split('\n')[0].trim()}?`);
                if (pay) {
                    if (defender.tokens - 3 < 3) {
                        alert("Not enough tokens to defend (must keep 3)!");
                        executeAttackSteal(cp, defender, segment, id);
                    } else {
                        defender.tokens -= 3;
                        logAction(`${defender.name} paid 3 tokens to hold their ground against ATTACK!`);
                    }
                } else {
                    executeAttackSteal(cp, defender, segment, id);
                }
            } else {
                executeAttackSteal(cp, defender, segment, id);
            }
        });
        finish();
    }
    
    else if (card.name === 'SEGMENT STEAL') {
        if (segment.owner !== null) return alert("Must target an UNCAPTURED segment.");
        let cpLvl = getHighestSegmentLevel(cp.id);
        if (cpLvl === 0) cpLvl = 1;
        if (segment.level !== cpLvl && segment.level !== cpLvl + 1) {
            return alert(`Must target a segment on your level (${cpLvl}) or one above (${cpLvl+1}).`);
        }
        executeAttackSteal(cp, null, segment, id);
        finish();
    }
    
    else if (card.name === 'DISRUPT') {
        if (segment.owner === null || segment.owner === cp.id) return alert("Must target an opponent's segment.");
        const defender = players.find(p => p.id === segment.owner);
        attemptAttack(cp.id, defender.id, card.power, card.name, () => {
            let maxLvl = getHighestSegmentLevel(defender.id);
            let dropped = 0;
            Object.keys(board).forEach(sid => {
                if(board[sid].owner === defender.id && board[sid].level === maxLvl) {
                    board[sid].owner = null;
                    board[sid].power = 0;
                    dropped++;
                }
            });
            logAction(`<strong>${cp.name}</strong> used DISRUPT! ${defender.name} lost all ${dropped} segments on Level ${maxLvl} and fell down the pyramid!`);
        });
        finish();
    }
    
    else if (card.name === 'BID') {
        if (segment.owner === null || segment.owner === cp.id) return alert("Must target an opponent's segment.");
        const defender = players.find(p => p.id === segment.owner);
        attemptAttack(cp.id, defender.id, card.power, card.name, () => {
            executeBiddingWar(cp, defender, segment, segEl, finish);
        });
        // Note: finish is called by executeBiddingWar
    }
    
    else if (card.name === 'COMPETITIVE STRIKE') {
        if (segment.owner === null || segment.owner === cp.id) return alert("Must target an opponent's segment.");
        if (segment.level > 2) return alert("COMPETITIVE STRIKE only works on Level 1 or Level 2 segments.");
        const defender = players.find(p => p.id === segment.owner);
        attemptAttack(cp.id, defender.id, card.power, card.name, () => {
            executeBiddingWar(cp, defender, segment, segEl, finish);
        });
    }
    
    else if (card.name === 'BLITZ ATTACK') {
        if (segment.owner === null || segment.owner === cp.id) return alert("Must target an opponent's segment.");
        if (targetingMode.targets.includes(id)) return alert("Already targeted this segment.");
        
        targetingMode.targets.push(id);
        segEl.style.boxShadow = "0 0 10px red";
        
        if (targetingMode.targets.length === 2) {
            let t1 = board[targetingMode.targets[0]];
            let t2 = board[targetingMode.targets[1]];
            let d1 = players.find(p => p.id === t1.owner);
            let d2 = players.find(p => p.id === t2.owner);
            
            // Need to sequence the attacks
            let resolve2 = () => {
                if(t2.owner !== null) {
                    attemptAttack(cp.id, d2.id, card.power, card.name, () => {
                        t2.owner = null; t2.power = 0;
                        logAction(`BLITZ hit! ${d2.name} lost a segment.`);
                    });
                }
                document.querySelectorAll('.segment').forEach(s => s.style.boxShadow='');
                finish();
            };
            
            attemptAttack(cp.id, d1.id, card.power, card.name, () => {
                t1.owner = null; t1.power = 0;
                logAction(`BLITZ hit! ${d1.name} lost a segment.`);
                resolve2();
            });
            // If d1 blocked, we still try d2
            if (t1.owner !== null) resolve2(); // meaning it was blocked
        } else {
            alert("Select the second target for BLITZ ATTACK.");
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
        
        // Event Modifiers
        if (segment.level === 1 && eventModifiers.l1FreeNoCard) {
            cost = 0;
            needsCard = false;
        }
        if (segment.level === 2 && eventModifiers.l2FirstFree) {
            cost = 0;
        }
        if (segment.level === 2 && eventModifiers.l1PlayersFreeL2) {
            if (getHighestSegmentLevel(cp.id) === 1) {
                cost = 0;
            }
        }
        if (segment.level === 4 && eventModifiers.l4NoCard) {
            needsCard = false;
        }
        
        let cardToUseIdx = -1;
        let cardUsed = null;
        if (needsCard) {
            let validCards = [];
            const segLetter = id.split('-')[1]; // e.g., 'A' from 'L1-A' or '1' from 'L4-1'
            
            cp.hand.forEach((c, idx) => {
                if (c.type === 'claim' && c.level === segment.level) {
                    if (c.targets.includes('Any') || c.targets.includes('Top') || c.targets.includes(segLetter)) {
                        validCards.push({card: c, idx: idx});
                    }
                }
            });

            if (validCards.length === 0) {
                alert(`You need a matching Dot Card in your hand to claim this segment!`);
                return;
            }
            
            // Auto-select lowest power card, keep wild cards as fallback
            validCards.sort((a, b) => {
                const aWild = a.card.targets.includes('Any') || a.card.targets.includes('Top');
                const bWild = b.card.targets.includes('Any') || b.card.targets.includes('Top');
                if (aWild && !bWild) return 1;
                if (!aWild && bWild) return -1;
                return a.card.power - b.card.power;
            });
            
            cardToUseIdx = validCards[0].idx;
            cardUsed = validCards[0].card;
        }

        // 2. Check Prerequisite (Hierarchical Progression)
        if (segment.level > 1) {
            const requiredLevel = segment.level - 1;
            const ownsRequired = Object.values(board).some(s => s.owner === cp.id && s.level === requiredLevel);
            if (!ownsRequired) {
                alert(`You must own at least one Level ${requiredLevel} segment before claiming a Level ${segment.level} segment!`);
                return;
            }
        }
        
        // 3. Ensure they have enough tokens (must remain >= 3)
        if (cp.tokens - cost >= 3) {
            // 4. Ensure they have enough flags
            if (cp.flags <= 0) {
                alert("You don't have enough flags to claim more territory.");
                return;
            }
            
            // Process the claim
            cp.tokens -= cost;
            cp.flags -= 1;
            if (cardToUseIdx !== -1) {
                cp.hand.splice(cardToUseIdx, 1); // Consume the claim card
                segment.power = cardUsed.power; // Stamp the power onto the segment
            }
            segment.owner = cp.id;
            segment.justClaimed = true;
            
            lastAction = { type: 'claim', segmentId: id }; // Track for Copycat
            
            if (segment.level === 2 && eventModifiers.l2FirstFree) {
                eventModifiers.l2FirstFree = false; // Consume the free play
                logAction(`<strong>${cp.name}</strong> claimed the first Level 2 segment for FREE!`);
            }
            
            const segmentName = segEl.innerText.split('\n')[0].trim();
            logAction(`<strong>${cp.name}</strong> played a Dot Card and conquered ${segmentName} for ${cost} tokens.`);
            endTurn();
        } else {
            alert(`Not enough tokens! Cost is ${cost}, and you must keep at least 3 tokens.`);
        }
    } else {
        // Belong to someone else
        if (segment.owner !== cp.id) {
            if (!eventModifiers.attacksAllowed) {
                alert("Peace Treaty is active! No attacks allowed this round.");
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
                cardUsed = validCards[0].card;

                const prevOwnerId = segment.owner;
                const prevOwner = players.find(p => p.id === prevOwnerId);
                
                if (cp.flags <= 0) {
                    alert("You don't have enough flags to claim this territory through a bid.");
                    return;
                }

                // alert(`BIDDING WAR! ${cp.name} is challenging ${prevOwner.name} for ${segEl.innerText.split('\n')[0].trim()} using ${cardUsed.name}!`);

                const segmentName = segEl.innerText.split('\n')[0].trim();
                const result = await openSplitBidModal(cp, prevOwner, segmentName, true);

                if (result.winner === 'challenger') {
                    let powerFee = Math.ceil(cardUsed.power / 2);
                    cp.tokens -= (result.challengerBid + powerFee);
                    cp.flags -= 1;
                    cp.hand.splice(cardToUseIdx, 1);
                    segment.owner = cp.id;
                    segment.justClaimed = true;
                    segment.power = cardUsed.power;
                    lastAction = { type: 'claim', segmentId: id }; // Track for Copycat
                    logAction(`<strong>${cp.name}</strong> won the bidding war for ${result.challengerBid} tokens (+${powerFee} power fee) and took the segment!`);
                } else {
                    prevOwner.tokens -= result.defenderBid;
                    cp.hand.splice(cardToUseIdx, 1);
                    logAction(`<strong>${prevOwner.name}</strong> defended their segment by winning the bid for ${result.defenderBid} tokens! <span style="color:${cp.color}">${cp.name}</span> lost their card.`);
                }
                
                endTurn();
                return;
            }
            
            // If they don't have a claim card, they can't do anything because Attack cards now use targeting mode.
            alert("You need a matching Dot Card to initiate a bidding war. Play an Attack card from your hand if you want to attack.");
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
    
    // Sort by power points
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
}

// --- RESPONSIVE LAYOUT SYSTEM ---
function initLayoutSystem() {
    const toggleBtn = document.getElementById('layout-toggle-btn');
    const sidebar = document.querySelector('.players-sidebar');
    const sidebarOpenBtn = document.getElementById('mobile-players-toggle-btn');
    const sidebarCloseBtn = document.getElementById('mobile-sidebar-close-btn');
    
    // Check local storage preference
    const savedLayout = localStorage.getItem('empireClimbLayout');
    
    function applyLayout(mode) {
        if (mode === 'mobile') {
            document.body.classList.add('layout-mobile');
            document.body.classList.remove('layout-desktop');
        } else {
            document.body.classList.add('layout-desktop');
            document.body.classList.remove('layout-mobile');
        }
        localStorage.setItem('empireClimbLayout', mode);
        // Force re-render of hand to ensure transforms are correctly handled
        renderHand();
    }
    
    if (savedLayout === 'mobile' || savedLayout === 'desktop') {
        applyLayout(savedLayout);
    } else {
        // Auto detect based on screen width
        if (window.innerWidth <= 768) {
            applyLayout('mobile');
        } else {
            applyLayout('desktop');
        }
    }
    
    // Toggle button click
    toggleBtn.addEventListener('click', () => {
        if (document.body.classList.contains('layout-mobile')) {
            applyLayout('desktop');
        } else {
            applyLayout('mobile');
        }
    });

    // Mobile Sidebar Toggles
    if (sidebarOpenBtn && sidebar) {
        sidebarOpenBtn.addEventListener('click', () => {
            sidebar.classList.add('sidebar-open');
        });
    }
    
    if (sidebarCloseBtn && sidebar) {
        sidebarCloseBtn.addEventListener('click', () => {
            sidebar.classList.remove('sidebar-open');
        });
    }
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

// Boot
initLayoutSystem();
initGame();
