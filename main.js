// ============================================================
// LOADING SCREEN
// ============================================================
let pct = 0;
const pctEl = document.getElementById('loader-pct');
const loaderInterval = setInterval(() => {
  pct = Math.min(pct + Math.random() * 8, 99);
  pctEl.textContent = Math.floor(pct) + '%';
}, 80);

window.addEventListener('load', () => {
  clearInterval(loaderInterval);
  pctEl.textContent = '100%';
  setTimeout(() => {
    document.getElementById('loader').classList.add('hidden');
  }, 500);
});
// Fallback: hide loader after 3.5s regardless
setTimeout(() => {
  document.getElementById('loader').classList.add('hidden');
}, 3500);

// ============================================================
// CUSTOM CURSOR
// ============================================================
const cursor = document.getElementById('cursor');
const cursorRing = document.getElementById('cursor-ring');
const mouseLight = document.getElementById('mouse-light');
let mx = 0, my = 0, rx = 0, ry = 0;

document.addEventListener('mousemove', e => {
  mx = e.clientX;
  my = e.clientY;
  cursor.style.left = mx + 'px';
  cursor.style.top = my + 'px';
  mouseLight.style.left = mx + 'px';
  mouseLight.style.top = my + 'px';
});

// Smooth-follow ring animation
function animRing() {
  rx += (mx - rx) * 0.12;
  ry += (my - ry) * 0.12;
  cursorRing.style.left = rx + 'px';
  cursorRing.style.top = ry + 'px';
  requestAnimationFrame(animRing);
}
animRing();

// Cursor grows on interactive elements
document.querySelectorAll('a, button, .faq-question, .card-showcase, .rarity-card, .strategy-card, .feature-card, .rule-card, .segment').forEach(el => {
  el.addEventListener('mouseenter', () => {
    cursor.style.transform = 'translate(-50%,-50%) scale(2)';
    cursorRing.style.transform = 'translate(-50%,-50%) scale(1.5)';
    cursorRing.style.borderColor = 'rgba(255,215,0,0.7)';
  });
  el.addEventListener('mouseleave', () => {
    cursor.style.transform = 'translate(-50%,-50%) scale(1)';
    cursorRing.style.transform = 'translate(-50%,-50%) scale(1)';
    cursorRing.style.borderColor = 'rgba(255,215,0,0.4)';
  });
});

// ============================================================
// FLOATING PARTICLES
// ============================================================
const particlesEl = document.getElementById('particles');
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
  `;
  particlesEl.appendChild(p);
}

// ============================================================
// NAVBAR — shrink on scroll
// ============================================================
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
});

// ============================================================
// MOBILE HAMBURGER MENU
// ============================================================
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('mobile-menu').classList.add('open');
});
document.getElementById('mobile-close').addEventListener('click', closeMobileMenu);

function closeMobileMenu() {
  document.getElementById('mobile-menu').classList.remove('open');
}

// ============================================================
// SCROLL REVEAL (IntersectionObserver)
// ============================================================
const revealEls = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('visible');
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
revealEls.forEach(el => revealObserver.observe(el));

// ============================================================
// ANIMATED COUNTERS
// ============================================================
const counterEls = document.querySelectorAll('[data-counter]');
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const target = parseInt(e.target.dataset.counter);
      let current = 0;
      const step = target / 40;
      const timer = setInterval(() => {
        current += step;
        if (current >= target) {
          current = target;
          clearInterval(timer);
        }
        e.target.textContent = Math.floor(current);
      }, 30);
      counterObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });
counterEls.forEach(el => counterObserver.observe(el));

// ============================================================
// FAQ ACCORDION
// ============================================================
document.querySelectorAll('.faq-question').forEach(q => {
  q.addEventListener('click', () => {
    const item = q.parentElement;
    const answer = item.querySelector('.faq-answer');
    const isOpen = item.classList.contains('open');

    // Close all
    document.querySelectorAll('.faq-item').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-answer').style.maxHeight = '0';
    });

    // Open clicked (if it was closed)
    if (!isOpen) {
      item.classList.add('open');
      answer.style.maxHeight = answer.scrollHeight + 'px';
    }
  });
});

// ============================================================
// PARALLAX — hero grid on scroll
// ============================================================
window.addEventListener('scroll', () => {
  const heroGrid = document.querySelector('.hero-grid');
  if (heroGrid) {
    heroGrid.style.transform = `translateY(${window.scrollY * 0.3}px)`;
  }
});