// ============================================================
//   SFX ENGINE — Web Audio API Synthesized Sound Effects
// ============================================================
const SFX = (() => {
    let ctx = null;
    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function isMuted() {
        return sessionStorage.getItem('empireClimbSfxMuted') === 'true';
    }

    function tone(freq, type, duration, vol = 0.3, delay = 0) {
        if (isMuted()) return;
        try {
            const c = getCtx();
            const o = c.createOscillator();
            const g = c.createGain();
            o.type = type;
            o.frequency.setValueAtTime(freq, c.currentTime + delay);
            g.gain.setValueAtTime(vol, c.currentTime + delay);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
            o.connect(g); g.connect(c.destination);
            o.start(c.currentTime + delay);
            o.stop(c.currentTime + delay + duration + 0.05);
        } catch(e) {}
    }

    function noise(duration, vol = 0.15) {
        if (isMuted()) return;
        try {
            const c = getCtx();
            const bufSize = c.sampleRate * duration;
            const buf = c.createBuffer(1, bufSize, c.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            const src = c.createBufferSource();
            const g = c.createGain();
            src.buffer = buf;
            g.gain.setValueAtTime(vol, c.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
            src.connect(g); g.connect(c.destination);
            src.start(); src.stop(c.currentTime + duration + 0.05);
        } catch(e) {}
    }

    return {
        // Card played — satisfying whoosh + chime
        cardPlay() {
            noise(0.12, 0.08);
            tone(880, 'sine', 0.15, 0.2);
            tone(1320, 'sine', 0.1, 0.15, 0.05);
        },

        // Card wasted — low thud
        cardWaste() {
            tone(120, 'sine', 0.25, 0.25);
            noise(0.15, 0.06);
        },

        // Turn start — ascending chime
        turnStart() {
            tone(523, 'sine', 0.12, 0.15);
            tone(659, 'sine', 0.12, 0.15, 0.1);
            tone(784, 'sine', 0.2, 0.2, 0.2);
        },

        // Segment claimed — triumphant fanfare
        segmentClaim() {
            tone(523, 'triangle', 0.15, 0.2);
            tone(659, 'triangle', 0.15, 0.2, 0.12);
            tone(784, 'triangle', 0.15, 0.2, 0.24);
            tone(1047, 'triangle', 0.3, 0.25, 0.36);
        },

        // Attack launched — aggressive stab
        attack() {
            tone(200, 'sawtooth', 0.08, 0.2);
            tone(150, 'sawtooth', 0.15, 0.25, 0.05);
            noise(0.1, 0.12);
        },

        // Defense blocked — shield ping
        defense() {
            tone(1200, 'sine', 0.08, 0.15);
            tone(1600, 'sine', 0.12, 0.2, 0.06);
            tone(2000, 'sine', 0.15, 0.15, 0.12);
        },

        // Token gain — coin chime
        tokenGain() {
            tone(1400, 'sine', 0.06, 0.12);
            tone(1800, 'sine', 0.08, 0.15, 0.06);
        },

        // Token loss — descending tone
        tokenLoss() {
            tone(400, 'sine', 0.12, 0.15);
            tone(300, 'sine', 0.15, 0.12, 0.1);
        },

        // Bid war start — dramatic tension
        bidWar() {
            tone(220, 'sawtooth', 0.1, 0.12);
            tone(277, 'sawtooth', 0.1, 0.12, 0.1);
            tone(330, 'sawtooth', 0.1, 0.12, 0.2);
            tone(440, 'sawtooth', 0.2, 0.18, 0.3);
        },

        // Bid confirm — click
        bidConfirm() {
            tone(800, 'square', 0.05, 0.1);
            tone(1000, 'square', 0.05, 0.08, 0.04);
        },

        // Victory fanfare — winner screen
        victory() {
            tone(523, 'triangle', 0.2, 0.2);
            tone(659, 'triangle', 0.2, 0.2, 0.15);
            tone(784, 'triangle', 0.2, 0.2, 0.3);
            tone(1047, 'triangle', 0.4, 0.25, 0.45);
            tone(784, 'triangle', 0.15, 0.15, 0.7);
            tone(1047, 'triangle', 0.5, 0.3, 0.85);
        },

        // Bankruptcy — ominous low
        bankruptcy() {
            tone(100, 'sawtooth', 0.4, 0.2);
            tone(80, 'sawtooth', 0.5, 0.15, 0.2);
        },

        // Event card drawn — mystical shimmer
        eventDraw() {
            tone(600, 'sine', 0.15, 0.1);
            tone(900, 'sine', 0.1, 0.12, 0.08);
            tone(750, 'sine', 0.1, 0.1, 0.15);
            tone(1100, 'sine', 0.2, 0.15, 0.22);
        },

        // Button click — subtle tap
        click() {
            tone(1000, 'sine', 0.04, 0.08);
        },

        // Chat message received — soft ping
        chatMsg() {
            tone(1200, 'sine', 0.08, 0.1);
            tone(1500, 'sine', 0.06, 0.08, 0.07);
        },

        // Card draw — shuffle swoosh
        cardDraw() {
            noise(0.08, 0.06);
            tone(600, 'sine', 0.06, 0.08, 0.03);
        },

        // Timer tick (urgent) — subtle beep
        timerTick() {
            tone(880, 'square', 0.03, 0.06);
        },

        // Error / invalid action
        error() {
            tone(200, 'square', 0.08, 0.12);
            tone(180, 'square', 0.1, 0.1, 0.08);
        }
    };
})();
