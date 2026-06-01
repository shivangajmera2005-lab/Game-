// ═══════════════════════════════════════════════════════════════════
//  Empire Climb — Socket.IO Multiplayer Server
//  Port: 5931 (local) | process.env.PORT (Railway)
// ═══════════════════════════════════════════════════════════════════

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');

// ── App setup ───────────────────────────────────────────────────────
const app    = express();
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
        name:      p.name,
        color:     p.color,
        isHost:    p.socketId === room.hostId,
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

        const code = generateRoomCode();
        const player = {
            socketId:  socket.id,
            numericId: 1,
            name,
            color:     COLORS[0],
            isHost:    true,
        };

        rooms[code] = {
            code,
            hostId:    socket.id,
            players:   [player],
            started:   false,
            createdAt: Date.now(),
        };

        socket.join(code);
        console.log(`[room] ${code} created by "${name}"`);

        socket.emit('room-created', {
            roomCode: code,
            players:  publicPlayers(rooms[code]),
            isHost:   true,
        });
    });

    // ── JOIN ROOM ──────────────────────────────────────────────────
    socket.on('join-room', ({ roomCode, playerName }) => {
        const code = (roomCode || '').trim().toUpperCase();
        const name = (playerName || '').trim();

        if (!name) {
            return socket.emit('error', { message: 'Player name cannot be empty.' });
        }
        if (!rooms[code]) {
            return socket.emit('error', { message: `Room "${code}" does not exist.` });
        }

        const room = rooms[code];

        if (room.started) {
            return socket.emit('error', { message: 'This game has already started.' });
        }
        if (room.players.length >= 6) {
            return socket.emit('error', { message: 'Room is full (max 6 players).' });
        }

        const numericId = room.players.length + 1;
        const player = {
            socketId:  socket.id,
            numericId,
            name,
            color:     COLORS[numericId - 1],
            isHost:    false,
        };

        room.players.push(player);
        socket.join(code);
        console.log(`[room] ${code} joined by "${name}" (${room.players.length}/6)`);

        // Tell the joining player their full room state
        socket.emit('room-joined', {
            roomCode: code,
            players:  publicPlayers(room),
            isHost:   false,
        });

        // Tell everyone else in the room about the updated list
        socket.to(code).emit('player-list-updated', {
            players: publicPlayers(room),
        });
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
        if (room.started) {
            return socket.emit('error', { message: 'Game already started.' });
        }

        room.started = true;
        console.log(`[game] ${code} started with ${room.players.length} players`);

        // Emit to ALL players in the room (including host)
        // Shape matches what localStorage expects (game.js reads this)
        const gamePlayers = room.players.map(p => ({
            id:       p.numericId,
            name:     p.name,
            color:    p.color,
            tokens:   15,
            flags:    5,
            bankrupt: false,
        }));

        io.to(code).emit('game-starting', { players: gamePlayers });
    });

    // ── DISCONNECT ─────────────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log(`[-] disconnected ${socket.id}`);

        const room = findRoomBySocket(socket.id);
        if (!room) return;

        const code = room.code;

        // Remove this player
        room.players = room.players.filter(p => p.socketId !== socket.id);

        // If the room is empty, delete it
        if (room.players.length === 0) {
            delete rooms[code];
            console.log(`[room] ${code} deleted (empty)`);
            return;
        }

        // Re-assign numeric IDs after removal (keeps order clean)
        room.players.forEach((p, i) => { p.numericId = i + 1; p.color = COLORS[i]; });

        // If host left, give host to next player in line
        if (room.hostId === socket.id) {
            room.hostId = room.players[0].socketId;
            console.log(`[room] ${code} new host: "${room.players[0].name}"`);
        }

        // Broadcast updated list to remaining players
        io.to(code).emit('player-list-updated', {
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
