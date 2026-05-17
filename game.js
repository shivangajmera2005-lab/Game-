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
        cEl.style.position = 'relative'; // Ensure absolute positioning works for cost
        cEl.innerHTML = `
            <div class="card-cost" style="position: absolute; top: 8px; right: 8px; font-size: 0.7em; background: rgba(255, 204, 0, 0.15); color: var(--yellow); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255, 204, 0, 0.3); font-weight: bold;">🪙 ${card.cost || 0}</div>
            <div class="card-title" style="padding-right: 35px;">${card.name}</div>
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
    segment.power = 0; // Wiped power on steal unless specified otherwise
    if(defender) {
        logAction(`<strong>${attacker.name}</strong> stole ${document.querySelector(`[data-id="${id}"]`).innerText.split('\n')[0].trim()}! <span style="color:${defender.color}">${defender.name}</span> lost a flag to the bank.`);
    } else {
        logAction(`<strong>${attacker.name}</strong> seized the uncaptured segment ${document.querySelector(`[data-id="${id}"]`).innerText.split('\n')[0].trim()}!`);
    }
}

function attemptAttack(attackerId, defenderId, attackPower, attackCardName, onSuccess) {
    const defender = players.find(p => p.id === defenderId);
    if (!defender) { onSuccess(); return; }

    const validDefenses = defender.hand.filter(c => c.type === 'defence' && c.power >= attackPower);
    if (validDefenses.length > 0) {
        validDefenses.sort((a,b) => a.power - b.power);
        const bestDef = validDefenses[0];
        
        const useDef = confirm(`[DEFENSE CHECK] ${defender.name}, you are attacked by ${attackCardName} (Power ${attackPower}). You have ${bestDef.name}. Use it to block?`);
        if (useDef) {
            const handIdx = defender.hand.indexOf(bestDef);
            defender.hand.splice(handIdx, 1);
            logAction(`<strong>${defender.name}</strong> played ${bestDef.name} and successfully blocked the attack from ${players.find(p => p.id === attackerId).name}!`);
            return;
        }
    }
    onSuccess();
}

async function executeBiddingWar(challenger, defender, segment, segEl, onComplete) {
    let currentBid = 0;
    let activeBidder = challenger;
    let inactiveBidder = defender;
    let folded = false;
    let highestBidder = null;

    while (!folded) {
        let title = "Bidding War";
        let desc = `Enter a bid higher than ${currentBid} to win ${segEl.innerText.split('\n')[0].trim()}. (You must keep 3 tokens)`;
        
        let newBid = await openBidModal(activeBidder, currentBid, false, title, desc, 0);
        
        if (newBid === null) {
            folded = true;
            highestBidder = inactiveBidder;
            alert(`${activeBidder.name} folded! ${highestBidder.name} wins the bid.`);
            break;
        }
        
        currentBid = newBid;
        
        let temp = activeBidder;
        activeBidder = inactiveBidder;
        inactiveBidder = temp;
    }

    if (highestBidder === challenger) {
        challenger.tokens -= currentBid;
        logAction(`<strong>${challenger.name}</strong> won the bidding war with ${currentBid} tokens and stole the segment!`);
        executeAttackSteal(challenger, defender, segment, segEl.getAttribute('data-id'));
    } else {
        defender.tokens -= currentBid;
        logAction(`<strong>${defender.name}</strong> won the bidding war with ${currentBid} tokens and successfully defended their segment!`);
    }
    onComplete();
}

function openBidModal(bidder, currentHighestBid, isSecret, title, desc, extraFee = 0) {
    return new Promise((resolve) => {
        const modal = document.getElementById('bid-modal');
        const titleEl = document.getElementById('bid-title');
        const descEl = document.getElementById('bid-desc');
        const currentDisplay = document.getElementById('bid-current-display');
        const currentVal = document.getElementById('bid-current-val');
        const totalEl = document.getElementById('bid-total');
        const foldBtn = document.getElementById('btn-bid-fold');
        const submitBtn = document.getElementById('btn-bid-submit');
        const addBtns = document.querySelectorAll('.bid-add-btn');

        titleEl.innerText = title;
        descEl.innerHTML = `<strong>${bidder.name}</strong><br>${desc}`;
        
        let accumulatedBid = 0;
        
        if (isSecret) {
            currentDisplay.style.display = 'none';
        } else {
            currentDisplay.style.display = 'block';
            currentVal.innerText = currentHighestBid;
            accumulatedBid = currentHighestBid; // start from current bid
        }
        
        totalEl.innerText = accumulatedBid;
        
        function updateButtons() {
            addBtns.forEach(btn => {
                const val = parseInt(btn.getAttribute('data-val'), 10);
                // Must keep 3 tokens. Cost is bid + extraFee.
                if (bidder.tokens - (accumulatedBid + val + extraFee) < 3) {
                    btn.disabled = true;
                } else {
                    btn.disabled = false;
                }
            });
            // Can only submit if bid > currentHighestBid (unless secret, then any bid >=0)
            if (!isSecret && accumulatedBid <= currentHighestBid) {
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.5';
            } else {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            }
        }

        const handleAdd = (e) => {
            const val = parseInt(e.target.getAttribute('data-val'), 10);
            accumulatedBid += val;
            totalEl.innerText = accumulatedBid;
            updateButtons();
        };

        const handleFold = () => {
            cleanup();
            resolve(null);
        };

        const handleSubmit = () => {
            if (!submitBtn.disabled) {
                cleanup();
                resolve(accumulatedBid);
            }
        };

        const cleanup = () => {
            addBtns.forEach(b => b.removeEventListener('click', handleAdd));
            foldBtn.removeEventListener('click', handleFold);
            submitBtn.removeEventListener('click', handleSubmit);
            modal.style.display = 'none';
        };

        addBtns.forEach(b => b.addEventListener('click', handleAdd));
        foldBtn.addEventListener('click', handleFold);
        submitBtn.addEventListener('click', handleSubmit);

        updateButtons();
        modal.style.display = 'flex';
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

                alert(`BIDDING WAR! ${cp.name} is challenging ${prevOwner.name} for ${segEl.innerText.split('\n')[0].trim()} using ${cardUsed.name}!`);

                let currentBid = 0;
                let activeBidder = cp;
                let inactiveBidder = prevOwner;
                let folded = false;
                let highestBidder = null;

                while (!folded) {
                    let fee = (activeBidder === cp) ? Math.ceil(cardUsed.power / 2) : 0;
                    
                    let title = "Bidding War";
                    let desc = `Enter a bid higher than ${currentBid} to conquer ${segEl.innerText.split('\n')[0].trim()}. (You must keep 3 tokens)`;
                    
                    let newBid = await openBidModal(activeBidder, currentBid, false, title, desc, fee);
                    
                    if (newBid === null) {
                        folded = true;
                        highestBidder = inactiveBidder;
                        alert(`${activeBidder.name} folded! ${highestBidder.name} wins the bid.`);
                        break;
                    }
                    
                    currentBid = newBid;
                    
                    let temp = activeBidder;
                    activeBidder = inactiveBidder;
                    inactiveBidder = temp;
                }

                if (highestBidder === cp) {
                    let powerFee = Math.ceil(cardUsed.power / 2);
                    cp.tokens -= (currentBid + powerFee);
                    cp.flags -= 1;
                    cp.hand.splice(cardToUseIdx, 1);
                    segment.owner = cp.id;
                    segment.power = cardUsed.power;
                    lastAction = { type: 'claim', segmentId: id }; // Track for Copycat
                    logAction(`<strong>${cp.name}</strong> won the bidding war for ${currentBid} tokens (+${powerFee} power fee) and took the segment!`);
                } else {
                    prevOwner.tokens -= currentBid;
                    cp.hand.splice(cardToUseIdx, 1);
                    logAction(`<strong>${prevOwner.name}</strong> defended their segment by winning the bid for ${currentBid} tokens! <span style="color:${cp.color}">${cp.name}</span> lost their card.`);
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
