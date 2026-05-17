// Game Engine

const segmentCosts = { 1: 0, 2: 3, 3: 5, 4: 8 };
let players = [];
let board = {};
let currentPlayerIndex = 0;
let round = 1;

// State variables for events
let activeEvent = null;
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
            }
        } else {
            seg.classList.remove('claimed');
            seg.style.borderColor = '';
            if (ownerLabel) ownerLabel.remove();
        }
    });

    // Current Player
    const cp = players[currentPlayerIndex];
    if(cp) {
        currentPlayerNameEl.textContent = cp.name;
        currentPlayerNameEl.style.color = cp.color;
        btnBuyFlag.disabled = cp.tokens < 5 || cp.flags >= 12; // 3 min + 2 cost
        btnPass.disabled = cp.bankrupt;
    }

    // Hand
    renderHand();
}

function renderHand() {
    handEl.innerHTML = '';
    const cp = players[currentPlayerIndex];
    if (!cp || cp.hand.length === 0) {
        handEl.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center;">Hand is empty</div>';
        return;
    }
    
    cp.hand.forEach((card, idx) => {
        const cEl = document.createElement('div');
        cEl.className = 'game-card';
        cEl.innerHTML = `
            <div class="card-title">${card.name}</div>
            <div class="card-desc">${card.desc}</div>
            <div class="card-actions" style="margin-top: 10px; display: flex; gap: 5px;">
                <button class="play-btn" style="flex:1; padding:4px; font-size:0.7em; cursor:pointer; background:rgba(0,170,255,0.2); border:1px solid var(--blue-glow); color:var(--text); border-radius:3px;">Play</button>
                <button class="waste-btn" style="flex:1; padding:4px; font-size:0.7em; cursor:pointer; background:rgba(255,45,45,0.2); border:1px solid var(--red-glow); color:var(--text); border-radius:3px;">Waste</button>
            </div>
        `;
        
        cEl.querySelector('.play-btn').addEventListener('click', () => {
            playCard(idx);
        });
        cEl.querySelector('.waste-btn').addEventListener('click', () => {
            wasteCard(idx);
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

function endTurn() {
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
                p.bankrupt = true;
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
            p.hand.push(drawRandomCard());
            drawn++;
        }
        if (drawn > 0) {
            logAction(`<span style="color:${p.color}">${p.name}</span> drew ${drawn} cards.`);
        }
    });
    logAction(`<br>`);
    updateUI(); // Important to reflect drops or bankruptcy immediately
}

function drawRandomCard() {
    const coreCards = [
        {name: 'Attack Card', desc: 'Power: 4. Play to steal an enemy segment.', type: 'attack', cost: 2},
        {name: 'Defence Card', desc: 'Power: 5. Defend against an attack.', type: 'defence', cost: 0},
        {name: 'Token Cache', desc: 'Gain 2 tokens immediately.', type: 'power', cost: 0}
    ];
    const claimCards = [
        {name: 'Blue Dot Card', desc: 'Required to claim a Blue (Level 1) segment.', type: 'claim', level: 1, cost: 0},
        {name: 'Yellow Dot Card', desc: 'Required to claim a Yellow (Level 2) segment.', type: 'claim', level: 2, cost: 3},
        {name: 'Red Dot Card', desc: 'Required to claim a Red (Level 3) segment.', type: 'claim', level: 3, cost: 5},
        {name: 'Golden Dot Card', desc: 'Required to claim the Golden Throne (Level 4).', type: 'claim', level: 4, cost: 8}
    ];
    
    // Weighted deck
    const deck = [
        ...coreCards, ...coreCards,
        claimCards[0], claimCards[0], claimCards[0],
        claimCards[1], claimCards[1],
        claimCards[2],
        claimCards[3]
    ];
    return deck[Math.floor(Math.random() * deck.length)];
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
            cp.bankrupt = true;
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

function playCard(handIdx) {
    const cp = players[currentPlayerIndex];
    const card = cp.hand[handIdx];
    
    if (card.type === 'claim') {
        alert(`To use ${card.name}, click on an empty segment of the corresponding level.`);
        return;
    }
    if (card.type === 'attack') {
        alert(`To use ${card.name}, click on an opponent's segment to steal it.`);
        return;
    }
    
    cp.hand.splice(handIdx, 1);
    
    if (card.name === 'Token Cache') {
        cp.tokens += 2;
        logAction(`<strong>${cp.name}</strong> played Token Cache and gained 2 tokens.`);
    } else {
        logAction(`<strong>${cp.name}</strong> played ${card.name}.`);
    }
    
    endTurn();
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
            cp.bankrupt = true;
            logAction(`<strong>${cp.name}</strong> went bankrupt from wasting a card!`);
        }
    } else {
        logAction(`<strong>${cp.name}</strong> wasted ${card.name}.`);
    }
    endTurn();
}

function handleSegmentClick(id, segEl) {
    const cp = players[currentPlayerIndex];
    const segment = board[id];
    
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
        
        let cardIndex = -1;
        if (needsCard) {
            cardIndex = cp.hand.findIndex(c => c.type === 'claim' && c.level === segment.level);
            if (cardIndex === -1) {
                alert(`You need a Level ${segment.level} Dot Card in your hand to claim this segment!`);
                return;
            }
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
            if (cardIndex !== -1) cp.hand.splice(cardIndex, 1); // Consume the claim card
            segment.owner = cp.id;
            
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
            
            const attackCardIdx = cp.hand.findIndex(c => c.type === 'attack');
            if (attackCardIdx !== -1) {
                let attackCost = 2; // base cost
                if (activeEvent && activeEvent.id === 7) attackCost = 0; // Cheap Warfare
                
                if (cp.tokens - attackCost < 3) {
                    alert(`You need at least ${attackCost + 3} tokens to use an Attack Card right now.`);
                    return;
                }
                
                const prevOwnerId = segment.owner;
                const prevOwner = players.find(p => p.id === prevOwnerId);
                
                const confirmAttack = confirm(`Use an Attack Card to steal this segment from ${prevOwner.name}? (Cost: ${attackCost} tokens)`);
                if (confirmAttack) {
                    // Check flags
                    if (cp.flags <= 0) {
                        alert("You don't have enough flags to hold more territory.");
                        return;
                    }

                    // Steal segment
                    cp.tokens -= attackCost;
                    cp.flags -= 1;
                    segment.owner = cp.id;
                    cp.hand.splice(attackCardIdx, 1); // Consume attack card
                    
                    logAction(`<strong>${cp.name}</strong> used an Attack Card and stole a segment! <span style="color:${prevOwner.color}">${prevOwner.name}</span> lost a flag to the bank.`);
                    endTurn();
                }
            } else {
                alert("You need an Attack Card in your hand to steal an opponent's segment!");
            }
        }
    }
}

function endGame() {
    // Calculate power points
    players.forEach(p => {
        p.powerPoints = p.tokens; // Base points from tokens
        Object.values(board).forEach(seg => {
            if (seg.owner === p.id) {
                if (seg.level === 1) p.powerPoints += 1;
                else if (seg.level === 2) p.powerPoints += 2;
                else if (seg.level === 3) p.powerPoints += 3;
                else if (seg.level === 4) p.powerPoints += 5;
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
initGame();
