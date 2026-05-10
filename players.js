const colors = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316'];
let players = [
    { id: 1, name: 'Player 1', color: colors[0] },
    { id: 2, name: 'Player 2', color: colors[1] },
    { id: 3, name: 'Player 3', color: colors[2] }
];

const playersListEl = document.getElementById('players-list');
const addPlayerBtn = document.getElementById('add-player-btn');

function renderPlayers() {
    playersListEl.innerHTML = '';
    players.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
            <div class="player-color" style="background-color: ${player.color};"></div>
            <div class="player-input-wrap">
                <input type="text" class="player-input" value="${player.name}" data-id="${player.id}" placeholder="Player Name">
            </div>
            <button class="player-delete" data-id="${player.id}" ${players.length <= 3 ? 'disabled' : ''}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        `;
        playersListEl.appendChild(item);
    });

    // Add event listeners to new elements
    document.querySelectorAll('.player-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const id = parseInt(e.target.getAttribute('data-id'));
            const player = players.find(p => p.id === id);
            if (player) player.name = e.target.value;
        });
    });

    document.querySelectorAll('.player-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            if (players.length > 3) {
                players = players.filter(p => p.id !== id);
                renderPlayers();
            }
        });
    });

    addPlayerBtn.disabled = players.length >= 6;
}

addPlayerBtn.addEventListener('click', () => {
    if (players.length < 6) {
        const nextId = Math.max(...players.map(p => p.id), 0) + 1;
        const color = colors[players.length];
        players.push({ id: nextId, name: `Player ${players.length + 1}`, color: color });
        renderPlayers();
    }
});

// Initial render
renderPlayers();

// Floating Particles logic (reused from main.js)
const particlesEl = document.getElementById('particles');
if (particlesEl) {
    const particleColors = [
        'rgba(255,215,0,0.7)',
        'rgba(0,170,255,0.6)',
        'rgba(255,45,45,0.5)',
        'rgba(255,204,0,0.6)'
    ];
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 3 + 1;
        const color = particleColors[Math.floor(Math.random() * particleColors.length)];
        p.style.cssText = `
            width:${size}px;
            height:${size}px;
            left:${Math.random() * 100}%;
            background:${color};
            animation-duration:${Math.random() * 15 + 10}s;
            animation-delay:${Math.random() * 10}s;
            box-shadow:0 0 ${size * 4}px ${color};
            position: absolute;
            border-radius: 50%;
            animation: floatUp linear infinite;
        `;
        particlesEl.appendChild(p);
    }
}

// Begin Conquest Logic
const beginConquestBtn = document.getElementById('begin-conquest-btn');
beginConquestBtn.addEventListener('click', () => {
    // Initialize default game state for each player
    const gamePlayers = players.map(p => ({
        id: p.id,
        name: p.name || `Player ${p.id}`,
        color: p.color,
        tokens: 15,
        flags: 5,
        bankrupt: false
    }));

    localStorage.setItem('empireClimbPlayers', JSON.stringify(gamePlayers));
    window.location.href = 'game.html';
});
