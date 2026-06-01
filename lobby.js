// ═══════════════════════════════════════════════════════════════════
//  Empire Climb — Lobby Client (lobby.js)
//  Handles Socket.IO connection + all lobby UI state transitions
// ═══════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── Config ──────────────────────────────────────────────────────
    const SERVER_URL = window.SOCKET_SERVER_URL || 'http://localhost:5931';

    // ── State ────────────────────────────────────────────────────────
    let currentRoomCode = null;
    let isHost          = false;
    let myPlayerName    = '';

    // ── Socket connection ────────────────────────────────────────────
    const socket = io(SERVER_URL, {
        transports:        ['websocket', 'polling'],
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
    });

    // ── DOM refs ─────────────────────────────────────────────────────
    const connChip      = document.getElementById('conn-chip');
    const connLabel     = document.getElementById('conn-label');

    const stateEntry    = document.getElementById('state-entry');
    const stateLobby    = document.getElementById('state-lobby');

    const createNameEl  = document.getElementById('create-name');
    const joinCodeEl    = document.getElementById('join-code');
    const joinNameEl    = document.getElementById('join-name');

    const btnCreate     = document.getElementById('btn-create');
    const btnJoin       = document.getElementById('btn-join');

    const createErrEl   = document.getElementById('create-error');
    const joinErrEl     = document.getElementById('join-error');

    const codeDisplayEl = document.getElementById('room-code-display');
    const countBadgeEl  = document.getElementById('player-count-badge');
    const playersListEl = document.getElementById('players-list-lobby');

    const hostControls  = document.getElementById('host-controls');
    const guestWaiting  = document.getElementById('guest-waiting');
    const btnStartGame  = document.getElementById('btn-start-game');
    const startNote     = document.getElementById('start-note');

    const btnCopyCode   = document.getElementById('btn-copy-code');
    const btnLeaveRoom  = document.getElementById('btn-leave-room');

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
        if (stateName === 'entry')  stateEntry.classList.add('active');
        if (stateName === 'lobby')  stateLobby.classList.add('active');
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
            slot.innerHTML = `
                <div class="player-slot-avatar"
                     style="border-color:${p.color};color:${p.color};background:${p.color}18;">
                    ${getInitials(p.name)}
                </div>
                <div class="player-slot-name">${escapeHtml(p.name)}</div>
                <div class="player-slot-badge ${p.isHost ? 'badge-host' : 'badge-ready'}">
                    ${p.isHost ? '👑 HOST' : 'READY'}
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

        // Update start button state (host only, needs ≥ 3)
        if (isHost) {
            const canStart = players.length >= 3;
            btnStartGame.disabled = !canStart;
            startNote.textContent = canStart
                ? `${players.length} player${players.length > 1 ? 's' : ''} ready — good to go!`
                : `Need at least 3 players to start (${players.length}/3)`;
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

        renderRoomCode(roomCode);
        renderPlayers(players);

        hostControls.style.display = amIHost ? 'flex'  : 'none';
        guestWaiting.style.display = amIHost ? 'none'  : 'flex';

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
            const size  = Math.random() * 3 + 1;
            const color = colors[Math.floor(Math.random() * colors.length)];
            Object.assign(p.style, {
                width:             `${size}px`,
                height:            `${size}px`,
                left:              `${Math.random() * 100}%`,
                background:        color,
                boxShadow:         `0 0 ${size * 4}px ${color}`,
                animationDuration: `${Math.random() * 15 + 10}s`,
                animationDelay:    `${Math.random() * 10}s`,
            });
            container.appendChild(p);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SOCKET EVENTS — inbound
    // ═══════════════════════════════════════════════════════════════

    socket.on('connect', () => {
        connChip.className  = 'connection-chip connected';
        connLabel.textContent = 'CONNECTED';
        console.log('[lobby] connected to server');
    });

    socket.on('disconnect', () => {
        connChip.className  = 'connection-chip disconnected';
        connLabel.textContent = 'DISCONNECTED';
        console.log('[lobby] disconnected from server');

        // If we were in a lobby, show a notice (but don't forcibly leave)
        if (currentRoomCode) {
            showError(document.createElement('div'), 'Connection lost. Attempting to reconnect…');
        }
    });

    socket.on('connect_error', () => {
        connChip.className  = 'connection-chip disconnected';
        connLabel.textContent = 'OFFLINE';
    });

    // ── Room created (I am the host) ──────────────────────────────────
    socket.on('room-created', ({ roomCode, players, isHost: amIHost }) => {
        setLoading(btnCreate, false);
        enterLobby(roomCode, players, amIHost);
        console.log(`[lobby] room created: ${roomCode}`);
    });

    // ── Room joined (I joined someone else's room) ────────────────────
    socket.on('room-joined', ({ roomCode, players, isHost: amIHost }) => {
        setLoading(btnJoin, false);
        clearError(joinErrEl);
        enterLobby(roomCode, players, amIHost);
        console.log(`[lobby] joined room: ${roomCode}`);
    });

    // ── Someone joined / left — update list in real time ─────────────
    socket.on('player-list-updated', ({ players }) => {
        renderPlayers(players);
    });

    // ── Game is starting — save to localStorage & redirect ────────────
    socket.on('game-starting', ({ players }) => {
        // Write player data in the exact format game.js expects
        localStorage.setItem('empireClimbPlayers', JSON.stringify(players));

        // Small delay so all animations can settle
        setTimeout(() => {
            window.location.href = 'game.html';
        }, 300);
    });

    // ── Server-side error ─────────────────────────────────────────────
    socket.on('error', ({ message }) => {
        setLoading(btnCreate, false);
        setLoading(btnJoin,   false);

        // Show the error in whichever panel triggered it
        if (currentRoomCode === null) {
            // We're still on the entry screen — figure out which panel
            const lastAction = btnCreate.disabled ? 'create' : 'join';
            showError(lastAction === 'create' ? createErrEl : joinErrEl, message);
        }
        console.warn('[lobby] server error:', message);
    });

    // ═══════════════════════════════════════════════════════════════
    //  UI EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════════

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
        setLoading(btnJoin, true);
        socket.emit('join-room', { roomCode: code, playerName: name });
    });

    // ── Allow Enter key to submit ─────────────────────────────────────
    createNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') btnCreate.click(); });
    joinNameEl.addEventListener('keydown',   e => { if (e.key === 'Enter') btnJoin.click();   });
    joinCodeEl.addEventListener('keydown',   e => { if (e.key === 'Enter') btnJoin.click();   });

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
            // Fallback for browsers that block clipboard
            window.prompt('Copy this room code:', currentRoomCode);
        });
    });

    // ── Leave Room ────────────────────────────────────────────────────
    btnLeaveRoom.addEventListener('click', () => {
        // Disconnecting removes the player server-side (disconnect handler)
        socket.disconnect();
        currentRoomCode = null;
        isHost = false;
        createNameEl.value = myPlayerName; // pre-fill name for convenience
        joinNameEl.value   = myPlayerName;
        clearError(createErrEl);
        clearError(joinErrEl);
        showState('entry');
        // Reconnect so they can create/join again
        socket.connect();
    });

    // ═══════════════════════════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════════════════════════
    spawnParticles();
    showState('entry');

})();
