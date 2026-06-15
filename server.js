// ═══════════════════════════════════════════════════════════════════
//  Empire Climb — Socket.IO Multiplayer Server
//  Port: 5931 (local) | process.env.PORT (Railway)
// ═══════════════════════════════════════════════════════════════════

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// ── App setup ───────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Allow requests from:
//  • localhost (dev)
//  • any *.vercel.app domain (preview + prod)
//  • any custom domain you add later
const allowedOrigins = [
    /^http:\/\/localhost(:\d+)?$/,
    /^https?:\/\/.*\.vercel\.app$/,
    /^https?:\/\/.*\.up\.railway\.app$/,
];

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g. same-origin file://)
            if (!origin) return callback(null, true);
            const allowed = allowedOrigins.some(pattern => pattern.test(origin));
            if (allowed) return callback(null, true);
            callback(new Error(`CORS blocked: ${origin}`));
        },
        methods: ['GET', 'POST'],
        credentials: true,
    },
    transports: ['websocket', 'polling'],
});

// Serve all static frontend files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname)));

// Health check endpoint (Railway uses this)
app.get('/health', (_req, res) => res.json({ status: 'ok', port: PORT }));

// Serve lobby as root for convenience
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'lobby.html'));
});

// ── In-memory room store ─────────────────────────────────────────────
//
//  rooms = {
//    "ABC123": {
//      code:      "ABC123",
//      hostId:    "socketId",
//      players:   [ { socketId, numericId, name, color, isHost } ],
//      started:   false,
//      createdAt: Date.now()
//    }
//  }
//
const rooms = {};

// Player color palette — same as players.js
const COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316'];

// ── Helpers ──────────────────────────────────────────────────────────

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let code;
    do {
        code = Array.from({ length: 6 }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');
    } while (rooms[code]); // ensure uniqueness
    return code;
}

/** Return the public-safe player list (no internal fields) */
function publicPlayers(room) {
    return room.players.map(p => ({
        numericId: p.numericId,
        name: p.name,
        color: p.color,
        isHost: p.socketId === room.hostId,
        ready: p.ready || false,
        connected: p.connected !== false,
    }));
}

/** Find which room a socket belongs to */
function findRoomBySocket(socketId) {
    return Object.values(rooms).find(r =>
        r.players.some(p => p.socketId === socketId)
    ) || null;
}

// ── Stale room cleanup (every 2 hours) ──────────────────────────────
setInterval(() => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    Object.keys(rooms).forEach(code => {
        if (rooms[code].createdAt < cutoff) {
            delete rooms[code];
            console.log(`[cleanup] removed stale room ${code}`);
        }
    });
}, 30 * 60 * 1000);

// ── Socket.IO events ─────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[+] connected  ${socket.id}`);

    // ── CREATE ROOM ────────────────────────────────────────────────
    socket.on('create-room', ({ playerName }) => {
        const name = (playerName || '').trim();
        if (!name) {
            return socket.emit('error', { message: 'Player name cannot be empty.' });
        }

        socket.playerName = name;
        const code = generateRoomCode();
        const player = {
            socketId: socket.id,
            numericId: 1,
            name,
            color: COLORS[0],
            isHost: true,
            ready: false,
        };

        rooms[code] = {
            code,
            hostId: socket.id,
            players: [player],
            started: false,
            createdAt: Date.now(),
        };

        socket.join(code);
        console.log(`[room] ${code} created by "${name}"`);

        socket.emit('room-created', {
            roomCode: code,
            players: publicPlayers(rooms[code]),
            isHost: true,
        });
    });

    // ── JOIN ROOM ──────────────────────────────────────────────────
    socket.on('join-room', ({ roomCode, playerName }) => {
        const code = (roomCode || '').trim().toUpperCase();
        const name = (playerName || '').trim();
        socket.playerName = name;

        if (!name) {
            return socket.emit('error', { message: 'Player name cannot be empty.' });
        }
        if (!rooms[code]) {
            return socket.emit('error', { message: `Room "${code}" does not exist.` });
        }

        const room = rooms[code];

        // Check if player is already in the room (reconnecting/refreshing)
        const existingPlayer = room.players.find(p => p.name === name);
        if (existingPlayer) {
            existingPlayer.socketId = socket.id;
            existingPlayer.connected = true;
            
            // Re-assign hostId if the reconnecting player was the first player (original host)
            if (room.players[0].name === name) {
                room.hostId = socket.id;
            }
            
            socket.join(code);
            console.log(`[room] ${code} player "${name}" reconnected`);

            socket.emit('room-joined', {
                roomCode: code,
                players: publicPlayers(room),
                isHost: room.hostId === socket.id,
                isSpectator: false,
                gameState: room.gameState || null
            });

            // Re-broadcast updated game state frame to all clients
            if (room.gameState) {
                io.to(code).emit('game-state-update', room.gameState);
            }

            io.to(code).emit('player-connection-status', { name: name, connected: true });
            socket.to(code).emit('playerJoined', { name: name + " (Reconnected)" });
            return;
        }

        // If the game has already started and this is a new player, join as spectator
        if (room.started) {
            socket.join(code);
            console.log(`[room] ${code} joined as SPECTATOR by "${name}"`);
            
            socket.emit('room-joined', {
                roomCode: code,
                players: publicPlayers(room),
                isHost: false,
                isSpectator: true,
                gameState: room.gameState || null
            });

            socket.to(code).emit('playerJoined', { name: name + " (Spectator)" });
            return;
        }

        if (room.players.length >= 6) {
            return socket.emit('error', { message: 'Room is full (max 6 players).' });
        }

        const numericId = room.players.length + 1;
        const player = {
            socketId: socket.id,
            numericId,
            name,
            color: COLORS[numericId - 1],
            isHost: false,
            ready: false,
        };

        room.players.push(player);
        socket.join(code);
        console.log(`[room] ${code} joined by "${name}" (${room.players.length}/6)`);

        // Tell the joining player their full room state
        socket.emit('room-joined', {
            roomCode: code,
            players: publicPlayers(room),
            isHost: false,
            isSpectator: false,
        });

        // Notify other clients in the room
        socket.to(code).emit('playerJoined', { name: player.name });

        // Update all clients with the new lobby state
        io.to(code).emit('lobbyUpdated', {
            roomCode: code,
            players: publicPlayers(room),
        });
    });

    // ── CREATE LOCAL ROOM FOR SPECTATORS ─────────────────────────────
    socket.on('create-local-room', ({ players, gameState }) => {
        const code = generateRoomCode();
        rooms[code] = {
            code,
            hostId: socket.id,
            players: (players || []).map((p, idx) => ({
                numericId: p.id,
                name: p.name,
                color: p.color || COLORS[idx % COLORS.length],
                ready: true
            })),
            started: true,
            isLocal: true,
            createdAt: Date.now(),
            gameState: gameState || null
        };
        socket.join(code);
        console.log(`[local-room] ${code} created for spectating`);
        socket.emit('local-room-created', { roomCode: code });
    });

    // ── GAME STATE UPDATE ────────────────────────────────────────────
    socket.on('game-state-update', ({ roomCode, gameState }) => {
        const code = (roomCode || '').trim().toUpperCase();
        const room = rooms[code];
        if (!room) return;

        room.gameState = gameState;
        // Broadcast the state update to everyone else in the room
        socket.to(code).emit('game-state-update', gameState);
    });

    // ── REQUEST DEFENSE ──────────────────────────────────────────────
    socket.on('request-defense', ({ roomCode, attackerId, defenderId, attackPower, attackCardName, attackCardDesc }) => {
        const code = (roomCode || '').trim().toUpperCase();
        socket.to(code).emit('request-defense', { attackerId, defenderId, attackPower, attackCardName, attackCardDesc });
    });

    // ── DEFENSE RESPONSE ─────────────────────────────────────────────
    socket.on('defense-response', ({ roomCode, blocked, cardIdx }) => {
        const code = (roomCode || '').trim().toUpperCase();
        socket.to(code).emit('defense-response', { blocked, cardIdx });
    });

    // ── REQUEST PAY OR LOSE ──────────────────────────────────────────
    socket.on('request-pay-or-lose', ({ roomCode, defenderId, cost, segmentName }) => {
        const code = (roomCode || '').trim().toUpperCase();
        socket.to(code).emit('request-pay-or-lose', { defenderId, cost, segmentName });
    });

    // ── PAY OR LOSE RESPONSE ──────────────────────────────────────────
    socket.on('pay-or-lose-response', ({ roomCode, action }) => {
        const code = (roomCode || '').trim().toUpperCase();
        socket.to(code).emit('pay-or-lose-response', { action });
    });

    // ── START BID WAR ────────────────────────────────────────────────
    socket.on('start-bid-war', ({ roomCode, challengerId, defenderId, segmentId }) => {
        const code = (roomCode || '').trim().toUpperCase();
        socket.to(code).emit('start-bid-war', { challengerId, defenderId, segmentId });
    });

    // ── BID WAR UPDATE ───────────────────────────────────────────────
    socket.on('bid-war-update', ({ roomCode, payload }) => {
        const code = (roomCode || '').trim().toUpperCase();
        socket.to(code).emit('bid-war-update', payload);
    });

    // ── SEND CHAT MESSAGE ─────────────────────────────────────────────
    socket.on('send-chat-msg', ({ roomCode, message }) => {
        const code = (roomCode || '').trim().toUpperCase();
        const room = rooms[code];
        if (!room) return;

        const msgStr = (message || '').trim().substring(0, 120);
        if (!msgStr) return;

        // Find sender identity and color
        let senderName = socket.playerName || 'Observer';
        let senderColor = '#00e5ff'; // Default spectator color (cyan)

        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
            senderName = player.name;
            senderColor = player.color;
        }

        io.to(code).emit('chat-msg-received', {
            sender: senderName,
            color: senderColor,
            message: msgStr,
            timestamp: Date.now()
        });
    });

    // ── PLAYER READY ───────────────────────────────────────────────
    socket.on('playerReady', ({ roomCode }) => {
        const code = (roomCode || '').trim().toUpperCase();
        const room = rooms[code];
        if (!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
            player.ready = true;
            console.log(`[room] ${code} player "${player.name}" is READY`);
            io.to(code).emit('lobbyUpdated', {
                roomCode: code,
                players: publicPlayers(room),
            });
        }
    });

    // ── PLAYER NOT READY ───────────────────────────────────────────
    socket.on('playerNotReady', ({ roomCode }) => {
        const code = (roomCode || '').trim().toUpperCase();
        const room = rooms[code];
        if (!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
            player.ready = false;
            console.log(`[room] ${code} player "${player.name}" is NOT READY`);
            io.to(code).emit('lobbyUpdated', {
                roomCode: code,
                players: publicPlayers(room),
            });
        }
    });

    // ── START GAME ─────────────────────────────────────────────────
    socket.on('start-game', ({ roomCode }) => {
        const code = (roomCode || '').trim().toUpperCase();
        const room = rooms[code];

        if (!room) {
            return socket.emit('error', { message: 'Room not found.' });
        }
        if (room.hostId !== socket.id) {
            return socket.emit('error', { message: 'Only the host can start the game.' });
        }
        if (room.players.length < 3) {
            return socket.emit('error', { message: 'Need at least 3 players to start.' });
        }
        // Server-side validation: all NON-HOST players must be ready
        // (Host has no ready button — they control the Start button itself)
        const allReady = room.players.every(p => p.socketId === room.hostId || p.ready);
        if (!allReady) {
            return socket.emit('error', { message: 'All players must be ready to start the game.' });
        }
        if (room.started) {
            return socket.emit('error', { message: 'Game already started.' });
        }

        room.started = true;
        console.log(`[game] ${code} started with ${room.players.length} players`);

        // Emit to ALL players in the room (including host)
        // Shape matches what localStorage expects (game.js reads this)
        const gamePlayers = room.players.map(p => ({
            id: p.numericId,
            name: p.name,
            color: p.color,
            tokens: 15,
            flags: 5,
            bankrupt: false,
        }));

        io.to(code).emit('gameStarting', { players: gamePlayers });
    });

    // ── DISCONNECT ─────────────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log(`[-] disconnected ${socket.id}`);

        const room = findRoomBySocket(socket.id);
        if (!room) return;

        const code = room.code;
        const leavingPlayer = room.players.find(p => p.socketId === socket.id);

        if (leavingPlayer) {
            if (room.started) {
                leavingPlayer.connected = false;
                console.log(`[room] ${code} player "${leavingPlayer.name}" disconnected (inactive)`);
                io.to(code).emit('player-connection-status', { name: leavingPlayer.name, connected: false });
                return;
            }
        }

        // If game has not started yet, fully remove the player
        room.players = room.players.filter(p => p.socketId !== socket.id);

        // If the room is empty, delete it
        if (room.players.length === 0) {
            delete rooms[code];
            console.log(`[room] ${code} deleted (empty)`);
            return;
        }

        // Re-assign numeric IDs after removal (keeps order clean)
        room.players.forEach((p, i) => { p.numericId = i + 1; p.color = COLORS[i]; });

        // Notify other clients about the departure
        if (leavingPlayer) {
            socket.to(code).emit('playerLeft', { name: leavingPlayer.name });
        }

        // If host left, give host to next player in line
        if (room.hostId === socket.id) {
            room.hostId = room.players[0].socketId;
            console.log(`[room] ${code} new host: "${room.players[0].name}"`);
            io.to(code).emit('hostChanged', { hostName: room.players[0].name });
        }

        // Broadcast updated state to remaining players
        io.to(code).emit('lobbyUpdated', {
            roomCode: code,
            players: publicPlayers(room),
        });
    });
});

// ── Start server ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5931;
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║   EMPIRE CLIMB — Multiplayer Server     ║
║   http://localhost:${PORT}                ║
╚══════════════════════════════════════════╝
    `);
});
