// ═══════════════════════════════════════════════════════════════════
//  Empire Climb — Lobby Client (lobby.js)
//  Handles Socket.IO connection + all lobby UI state transitions
// ═══════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── Config ──────────────────────────────────────────────────────
    const SERVER_URL =
        window.SOCKET_SERVER_URL ||
        'https://game-production-4ba0.up.railway.app';

    // ── State ────────────────────────────────────────────────────────
    let currentRoomCode = null;
    let isHost = false;
    let myPlayerName = '';
    let myReadyStatus = false;
    let chatUnreadCount = 0;

    // ── Socket connection ────────────────────────────────────────────
    const socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
    });

    // ── DOM refs ─────────────────────────────────────────────────────
    const connChip = document.getElementById('conn-chip');
    const connLabel = document.getElementById('conn-label');

    const stateEntry = document.getElementById('state-entry');
    const stateLobby = document.getElementById('state-lobby');

    const createNameEl = document.getElementById('create-name');
    const joinCodeEl = document.getElementById('join-code');
    const joinNameEl = document.getElementById('join-name');

    const btnCreate = document.getElementById('btn-create');
    const btnJoin = document.getElementById('btn-join');

    const createErrEl = document.getElementById('create-error');
    const joinErrEl = document.getElementById('join-error');

    const codeDisplayEl = document.getElementById('room-code-display');
    const countBadgeEl = document.getElementById('player-count-badge');
    const playersListEl = document.getElementById('players-list-lobby');

    const hostControls = document.getElementById('host-controls');
    const guestWaiting = document.getElementById('guest-waiting');
    const btnStartGame = document.getElementById('btn-start-game');
    const startNote = document.getElementById('start-note');

    const btnCopyCode = document.getElementById('btn-copy-code');
    const btnLeaveRoom = document.getElementById('btn-leave-room');

    const btnReadyToggle = document.getElementById('btn-ready-toggle');
    const toastContainer = document.getElementById('lobby-toast-container');

    // ── Helpers ──────────────────────────────────────────────────────

    function setLoading(btn, loading) {
        const spinner = btn.querySelector('.btn-spinner');
        btn.disabled = loading;
        if (spinner) spinner.style.display = loading ? 'block' : 'none';
    }

    function showError(el, msg) {
        el.textContent = msg;
        el.style.animation = 'none';
        // Reflow to restart animation
        void el.offsetWidth;
        el.style.animation = '';
    }

    function clearError(el) { el.textContent = ''; }

    function showState(stateName) {
        [stateEntry, stateLobby].forEach(s => s.classList.remove('active'));
        if (stateName === 'entry') stateEntry.classList.add('active');
        if (stateName === 'lobby') stateLobby.classList.add('active');
    }

    // ── Premium Floating Toast Alert ──────────────────────────────────
    function showToast(message, type = 'info') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `lobby-toast ${type}`;

        let icon = 'ℹ️';
        if (type === 'success') icon = '✔';
        if (type === 'error') icon = '❌';
        if (type === 'warning') icon = '👑';

        toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3900);
    }

    // ── Ready button toggler style ────────────────────────────────────
    function updateReadyButtonUI(ready) {
        if (!btnReadyToggle) return;
        if (ready) {
            btnReadyToggle.classList.add('ready-active');
            btnReadyToggle.innerHTML = '✔ READY';
        } else {
            btnReadyToggle.classList.remove('ready-active');
            btnReadyToggle.innerHTML = '⚡ MARK READY';
        }
    }

    // ── Room code display ─────────────────────────────────────────────
    function renderRoomCode(code) {
        codeDisplayEl.innerHTML = '';
        [...code].forEach(ch => {
            const span = document.createElement('span');
            span.className = 'code-digit';
            span.textContent = ch;
            codeDisplayEl.appendChild(span);
        });
    }

    // ── Player list rendering ─────────────────────────────────────────
    function renderPlayers(players) {
        playersListEl.innerHTML = '';
        countBadgeEl.textContent = `${players.length} / 6`;

        // Filled slots
        players.forEach(p => {
            const slot = document.createElement('div');
            slot.className = 'player-slot' + (p.isHost ? ' is-host' : '');

            // Visual indicator for ready status beside name
            const readyIndicator = p.ready
                ? `<span style="color:var(--green-glow); margin-right: 8px; font-weight: bold; text-shadow: 0 0 10px var(--green-glow)">✔</span>`
                : `<span style="color:var(--red-glow); margin-right: 8px; text-shadow: 0 0 10px var(--red-glow)">●</span>`;

            const badgeClass = p.isHost ? 'badge-host' : (p.ready ? 'badge-ready' : 'badge-not-ready');
            const badgeText = p.isHost ? '👑 HOST' : (p.ready ? 'READY' : 'NOT READY');

            slot.innerHTML = `
                <div class="player-slot-avatar"
                     style="border-color:${p.color};color:${p.color};background:${p.color}18;">
                    ${getInitials(p.name)}
                </div>
                <div class="player-slot-name">${readyIndicator}${escapeHtml(p.name)}</div>
                <div class="player-slot-badge ${badgeClass}">
                    ${badgeText}
                </div>
            `;
            playersListEl.appendChild(slot);
        });

        // Empty slots (up to 6)
        const emptyCount = 6 - players.length;
        for (let i = 0; i < emptyCount; i++) {
            const empty = document.createElement('div');
            empty.className = 'player-slot-empty';
            empty.innerHTML = `
                <div class="slot-empty-dot">○</div>
                <div class="slot-empty-text">Waiting for player…</div>
            `;
            playersListEl.appendChild(empty);
        }

        // Update start button state (host only, needs ≥ 3 and all non-host players ready)
        if (isHost) {
            const minPlayersMet = players.length >= 3;
            const guests = players.filter(p => !p.isHost);
            const allReady = guests.every(p => p.ready);
            const canStart = minPlayersMet && allReady;

            btnStartGame.disabled = !canStart;

            if (!minPlayersMet) {
                startNote.textContent = `Need at least 3 players to start (${players.length}/3)`;
            } else if (!allReady) {
                const unreadyCount = guests.filter(p => !p.ready).length;
                startNote.textContent = `Waiting for ${unreadyCount} player${unreadyCount > 1 ? 's' : ''} to be ready`;
            } else {
                startNote.textContent = `All players ready — ready to start!`;
            }
        }
    }

    function getInitials(name) {
        return (name || '?').slice(0, 2).toUpperCase();
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Show lobby state ──────────────────────────────────────────────
    function enterLobby(roomCode, players, amIHost) {
        currentRoomCode = roomCode;
        isHost = amIHost;
        myReadyStatus = false;
        updateReadyButtonUI(false);

        renderRoomCode(roomCode);
        renderPlayers(players);

        hostControls.style.display = amIHost ? 'flex' : 'none';
        guestWaiting.style.display = amIHost ? 'none' : 'flex';

        // Host doesn't need a ready button — they control the Start button
        if (btnReadyToggle) {
            btnReadyToggle.style.display = amIHost ? 'none' : '';
        }

        // Show chat widget and reset state
        const chatWidget = document.getElementById('chat-widget');
        if (chatWidget) {
            chatWidget.style.display = 'block';
            const msgContainer = document.getElementById('chat-messages');
            if (msgContainer) {
                msgContainer.innerHTML = '<div class="chat-system-message">Secure communication link established.</div>';
            }
            const input = document.getElementById('chat-input');
            if (input) input.value = '';
            chatUnreadCount = 0;
            const badge = document.getElementById('chat-badge');
            if (badge) {
                badge.style.display = 'none';
                badge.textContent = '0';
            }
            const panel = document.getElementById('chat-panel');
            if (panel) {
                panel.classList.add('collapsed');
            }
        }

        showState('lobby');
    }

    // ── Particles (ambient effect) ────────────────────────────────────
    function spawnParticles() {
        const container = document.getElementById('particles');
        if (!container) return;

        const colors = [
            'rgba(255,215,0,0.7)',
            'rgba(0,170,255,0.6)',
            'rgba(255,45,45,0.5)',
            'rgba(255,204,0,0.6)',
        ];

        for (let i = 0; i < 40; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 3 + 1;
            const color = colors[Math.floor(Math.random() * colors.length)];
            Object.assign(p.style, {
                width: `${size}px`,
                height: `${size}px`,
                left: `${Math.random() * 100}%`,
                background: color,
                boxShadow: `0 0 ${size * 4}px ${color}`,
                animationDuration: `${Math.random() * 15 + 10}s`,
                animationDelay: `${Math.random() * 10}s`,
            });
            container.appendChild(p);
        }
    }

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
            if (badge) {
                badge.style.display = 'none';
                badge.textContent = '0';
            }
            if (input) input.focus();
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Avoid triggering toggleBtn click
            panel.classList.add('collapsed');
        });

        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                sendChatMessage();
            });
        }

        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    sendChatMessage();
                }
            });
        }
    }

    function sendChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        if (socket && socket.connected) {
            socket.emit('send-chat-msg', { roomCode: currentRoomCode, message: text });
            input.value = '';
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SOCKET EVENTS — inbound
    // ═══════════════════════════════════════════════════════════════

    socket.on('connect', () => {
        connChip.className = 'connection-chip connected';
        connLabel.textContent = 'CONNECTED';
        console.log('[lobby] connected to server');
    });

    socket.on('disconnect', () => {
        connChip.className = 'connection-chip disconnected';
        connLabel.textContent = 'DISCONNECTED';
        console.log('[lobby] disconnected from server');

        // If we were in a lobby, show a notice
        if (currentRoomCode) {
            showToast('Connection lost. Reconnecting…', 'error');
        }
    });

    socket.on('connect_error', () => {
        connChip.className = 'connection-chip disconnected';
        connLabel.textContent = 'OFFLINE';
    });

    // ── Room created (I am the host) ──────────────────────────────────
    socket.on('room-created', ({ roomCode, players, isHost: amIHost }) => {
        setLoading(btnCreate, false);
        enterLobby(roomCode, players, amIHost);
        showToast('Empire room created!', 'success');
        console.log(`[lobby] room created: ${roomCode}`);
    });

    // ── Room joined (I joined someone else's room) ────────────────────
    socket.on('room-joined', ({ roomCode, players, isHost: amIHost, isSpectator, gameState }) => {
        setLoading(btnJoin, false);
        clearError(joinErrEl);

        if (isSpectator) {
            showToast(`Entering Spectator Mode...`, 'success');
            sessionStorage.setItem('empireClimbRoomCode', roomCode);
            sessionStorage.setItem('empireClimbIsMultiplayer', 'true');
            if (gameState) {
                sessionStorage.setItem('empireClimbSpectatorInitialState', JSON.stringify(gameState));
            } else {
                sessionStorage.removeItem('empireClimbSpectatorInitialState');
            }
            setTimeout(() => {
                window.location.href = `game.html?room=${roomCode}&spectator=true`;
            }, 1000);
            return;
        }

        enterLobby(roomCode, players, amIHost);
        showToast(`Entered Room ${roomCode}!`, 'success');
        console.log(`[lobby] joined room: ${roomCode}`);
    });

    // ── Lobby state updated ──────────────────────────────────────────
    socket.on('lobbyUpdated', ({ roomCode, players }) => {
        // Find myself in the players list to keep local ready state in sync
        const me = players.find(p => p.name === myPlayerName);
        if (me) {
            myReadyStatus = me.ready;
            updateReadyButtonUI(myReadyStatus);
        }

        renderPlayers(players);
    });

    // ── Real-time peer status alerts ─────────────────────────────────
    socket.on('playerJoined', ({ name }) => {
        showToast(`${name} joined the room!`, 'info');
    });

    socket.on('playerLeft', ({ name }) => {
        showToast(`${name} left the room.`, 'error');
    });

    socket.on('hostChanged', ({ hostName }) => {
        showToast(`${hostName} is now the host!`, 'warning');

        // Host reassignment check
        if (myPlayerName === hostName) {
            isHost = true;
            hostControls.style.display = 'flex';
            guestWaiting.style.display = 'none';
        }
    });

    // ── Game is starting ──────────────────────────────────────────────
    socket.on('gameStarting', ({ players }) => {
        showToast('Entering the battlefield! Prepare to rise...', 'success');

        // Write player data in the exact format game.js expects
        sessionStorage.setItem('empireClimbPlayers', JSON.stringify(players));

        // CRITICAL: save room context so game.js knows this is a shared multiplayer game
        sessionStorage.setItem('empireClimbRoomCode', currentRoomCode);
        sessionStorage.setItem('empireClimbIsMultiplayer', 'true');
        // Tell game.js whether this client is the host (host deals cards & pushes first state)
        sessionStorage.setItem('empireClimbIsHost', isHost ? 'true' : 'false');

        // Small delay so all animations can settle
        setTimeout(() => {
            window.location.href = `game.html?room=${currentRoomCode}&name=${encodeURIComponent(myPlayerName)}&host=${isHost}`;
        }, 1200);
    });

    socket.on('chat-msg-received', ({ sender, color, message, timestamp }) => {
        const msgContainer = document.getElementById('chat-messages');
        if (!msgContainer) return;

        const isSelf = sender === myPlayerName;
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

    // ── Server-side error ─────────────────────────────────────────────
    socket.on('error', ({ message }) => {
        setLoading(btnCreate, false);
        setLoading(btnJoin, false);

        // Show the error in whichever panel triggered it
        if (currentRoomCode === null) {
            const lastAction = btnCreate.disabled ? 'create' : 'join';
            showError(lastAction === 'create' ? createErrEl : joinErrEl, message);
        } else {
            showToast(message, 'error');
        }
        console.warn('[lobby] server error:', message);
    });

    // ═══════════════════════════════════════════════════════════════
    //  UI EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════════

    // ── Toggle Ready Status ───────────────────────────────────────────
    btnReadyToggle.addEventListener('click', () => {
        if (!currentRoomCode) return;
        myReadyStatus = !myReadyStatus;
        updateReadyButtonUI(myReadyStatus);

        if (myReadyStatus) {
            socket.emit('playerReady', { roomCode: currentRoomCode });
        } else {
            socket.emit('playerNotReady', { roomCode: currentRoomCode });
        }
    });

    // ── Create Room ───────────────────────────────────────────────────
    btnCreate.addEventListener('click', () => {
        clearError(createErrEl);
        const name = createNameEl.value.trim();

        if (!name) {
            showError(createErrEl, 'Please enter your name first.');
            createNameEl.focus();
            return;
        }

        myPlayerName = name;
        sessionStorage.setItem('empireClimbMyName', name);
        setLoading(btnCreate, true);
        socket.emit('create-room', { playerName: name });
    });

    // ── Join Room ─────────────────────────────────────────────────────
    btnJoin.addEventListener('click', () => {
        clearError(joinErrEl);
        const code = joinCodeEl.value.trim().toUpperCase();
        const name = joinNameEl.value.trim();

        if (!code) {
            showError(joinErrEl, 'Please enter a room code.');
            joinCodeEl.focus();
            return;
        }
        if (code.length !== 6) {
            showError(joinErrEl, 'Room code must be 6 characters.');
            joinCodeEl.focus();
            return;
        }
        if (!name) {
            showError(joinErrEl, 'Please enter your name.');
            joinNameEl.focus();
            return;
        }

        myPlayerName = name;
        sessionStorage.setItem('empireClimbMyName', name);
        setLoading(btnJoin, true);
        socket.emit('join-room', { roomCode: code, playerName: name });
    });

    // ── Allow Enter key to submit ─────────────────────────────────────
    createNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') btnCreate.click(); });
    joinNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoin.click(); });
    joinCodeEl.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoin.click(); });

    // Auto-uppercase room code input as the user types
    joinCodeEl.addEventListener('input', () => {
        const pos = joinCodeEl.selectionStart;
        joinCodeEl.value = joinCodeEl.value.toUpperCase();
        joinCodeEl.setSelectionRange(pos, pos);
    });

    // ── Start Game (host only) ────────────────────────────────────────
    btnStartGame.addEventListener('click', () => {
        if (!currentRoomCode || !isHost) return;
        socket.emit('start-game', { roomCode: currentRoomCode });
    });

    // ── Copy Room Code ────────────────────────────────────────────────
    btnCopyCode.addEventListener('click', () => {
        if (!currentRoomCode) return;
        navigator.clipboard.writeText(currentRoomCode).then(() => {
            btnCopyCode.textContent = '✅ Copied!';
            btnCopyCode.classList.add('copied');
            setTimeout(() => {
                btnCopyCode.textContent = '📋 Copy Code';
                btnCopyCode.classList.remove('copied');
            }, 2000);
        }).catch(() => {
            window.prompt('Copy this room code:', currentRoomCode);
        });
    });

    // ── Leave Room ────────────────────────────────────────────────────
    btnLeaveRoom.addEventListener('click', () => {
        socket.disconnect();
        currentRoomCode = null;
        isHost = false;
        myReadyStatus = false;
        createNameEl.value = myPlayerName;
        joinNameEl.value = myPlayerName;
        clearError(createErrEl);
        clearError(joinErrEl);

        const chatWidget = document.getElementById('chat-widget');
        if (chatWidget) {
            chatWidget.style.display = 'none';
        }

        showState('entry');
        socket.connect();
    });

    // ═══════════════════════════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════════════════════════
    spawnParticles();
    initChatHandlers();
    showState('entry');

})();
