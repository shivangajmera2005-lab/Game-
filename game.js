// Game Engine

const segmentCosts = { 1: 0, 2: 3, 3: 5, 4: 8 };
let players = [];
let board = {};
let currentPlayerIndex = 0;
let turnState = { hasDrawn: false, hasActed: false };

// UI Elements
const rosterEl = document.getElementById('players-roster');
const actionLogEl = document.getElementById('action-log');
const currentPlayerNameEl = document.getElementById('current-player-name');
const btnDraw = document.getElementById('btn-draw');
const btnBuyFlag = document.getElementById('btn-buy-flag');
const btnEndTurn = document.getElementById('btn-end-turn');
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
        board[id] = { owner: null, level: parseInt(seg.getAttribute('data-level')) };
        
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
                <div>Flags: <span class="stat-val">${p.flags}/12</span></div>
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
            seg.style.borderColor = owner.color;
            if (!ownerLabel) {
                ownerLabel = document.createElement('div');
                ownerLabel.className = 'segment-owner';
                seg.appendChild(ownerLabel);
            }
            ownerLabel.textContent = owner.name;
        }
    });

    // Current Player
    const cp = players[currentPlayerIndex];
    currentPlayerNameEl.textContent = cp.name;
    currentPlayerNameEl.style.color = cp.color;

    // Buttons
    btnDraw.disabled = turnState.hasDrawn;
    btnBuyFlag.disabled = cp.tokens < 5 || cp.flags >= 12; // 3 min + 2 cost
    
    // Hand
    renderHand();
}

function renderHand() {
    handEl.innerHTML = '';
    const cp = players[currentPlayerIndex];
    if (cp.hand.length === 0) {
        handEl.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center;">Hand is empty</div>';
        return;
    }
    
    cp.hand.forEach((card, idx) => {
        const cEl = document.createElement('div');
        cEl.className = 'game-card';
        cEl.innerHTML = `
            <div class="card-title">${card.name}</div>
            <div class="card-desc">${card.desc}</div>
        `;
        // Playing a card is the action for the turn
        cEl.addEventListener('click', () => {
            if (turnState.hasActed) {
                alert("You have already taken an action this turn.");
                return;
            }
            playCard(idx);
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
    turnState = { hasDrawn: false, hasActed: false };
    logAction(`<strong>${cp.name}</strong>'s turn begins.`);
    updateUI();
}

function endTurn() {
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
    
    // Check win condition
    const activePlayers = players.filter(p => !p.bankrupt);
    if (activePlayers.length === 1) {
        logAction(`<strong>${activePlayers[0].name} HAS CONQUERED THE EMPIRE!</strong>`);
        alert(`${activePlayers[0].name} Wins!`);
        return;
    }
    
    startTurn();
}

function drawRandomCard() {
    const coreCards = [
        {name: 'Attack Card', desc: 'Power: 4. Play to attack an enemy segment.'},
        {name: 'Defence Card', desc: 'Power: 5. Defend against an attack.'},
        {name: 'Token Cache', desc: 'Gain 2 tokens immediately.'}
    ];
    const claimCards = [
        {name: 'Blue Claim (L1)', desc: 'Required to claim a Blue (Level 1) segment.', type: 'claim', level: 1},
        {name: 'Yellow Claim (L2)', desc: 'Required to claim a Yellow (Level 2) segment.', type: 'claim', level: 2},
        {name: 'Red Claim (L3)', desc: 'Required to claim a Red (Level 3) segment.', type: 'claim', level: 3},
        {name: 'Gold Claim (L4)', desc: 'Required to claim the Golden Throne (Level 4).', type: 'claim', level: 4}
    ];
    
    // Weighted deck so players don't get stuck early game without Level 1 claim cards
    const deck = [
        ...coreCards, ...coreCards,
        claimCards[0], claimCards[0], claimCards[0], // L1 is most common
        claimCards[1], claimCards[1], // L2
        claimCards[2], // L3
        claimCards[3]  // L4
    ];
    return deck[Math.floor(Math.random() * deck.length)];
}

// Actions
btnDraw.addEventListener('click', () => {
    if (turnState.hasDrawn) return;
    const cp = players[currentPlayerIndex];
    
    cp.hand.push(drawRandomCard());
    
    turnState.hasDrawn = true;
    logAction(`<strong>${cp.name}</strong> drew a card.`);
    updateUI();
});

btnBuyFlag.addEventListener('click', () => {
    const cp = players[currentPlayerIndex];
    if (cp.tokens >= 5 && cp.flags < 12) { // must leave 3 tokens
        cp.tokens -= 2;
        cp.flags += 1;
        logAction(`<strong>${cp.name}</strong> purchased a flag.`);
        updateUI();
    }
});

btnEndTurn.addEventListener('click', endTurn);

function playCard(handIdx) {
    const cp = players[currentPlayerIndex];
    const card = cp.hand[handIdx];
    
    cp.hand.splice(handIdx, 1);
    
    if (card.name === 'Token Cache') {
        cp.tokens += 2;
        logAction(`<strong>${cp.name}</strong> played Token Cache and gained 2 tokens.`);
    } else {
        logAction(`<strong>${cp.name}</strong> played ${card.name}. (Targeting not fully implemented in MVP)`);
    }
    
    turnState.hasActed = true;
    updateUI();
}

function handleSegmentClick(id, segEl) {
    const cp = players[currentPlayerIndex];
    if (turnState.hasActed) {
        alert("You have already taken an action this turn.");
        return;
    }
    
    const segment = board[id];
    
    // Claiming empty segment
    if (segment.owner === null) {
        const cost = segmentCosts[segment.level];
        
        // 1. Check if they have the corresponding claim card
        const cardIndex = cp.hand.findIndex(c => c.type === 'claim' && c.level === segment.level);
        if (cardIndex === -1) {
            alert(`You need a Level ${segment.level} Claim Card in your hand to claim this segment!`);
            return;
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
            const ownedCount = Object.values(board).filter(s => s.owner === cp.id).length;
            if (ownedCount >= cp.flags) {
                alert("You don't have enough flags to claim more territory.");
                return;
            }
            
            // Process the claim
            cp.tokens -= cost;
            cp.hand.splice(cardIndex, 1); // Consume the claim card
            segment.owner = cp.id;
            turnState.hasActed = true;
            
            const segmentName = segEl.innerText.split('\n')[0].trim();
            logAction(`<strong>${cp.name}</strong> played a Claim Card and conquered ${segmentName} for ${cost} tokens.`);
            updateUI();
        } else {
            alert(`Not enough tokens! Cost is ${cost}, and you must keep at least 3 tokens.`);
        }
    } else {
        // Belong to someone else
        if (segment.owner !== cp.id) {
            alert("Combat system requires playing an Attack card. (Select a card from your hand)");
        }
    }
}

// Particle system from previous
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
initGame();
