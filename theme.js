/**
 * Empire Climb — Theme Toggle (Dark / Light Mode)
 * Shared across all pages. Reads/writes localStorage key "ec-theme".
 */
(function () {
    const STORAGE_KEY = 'ec-theme';
    const DARK  = 'dark';
    const LIGHT = 'light';

    /** Apply the given theme to <html> and update every toggle button. */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);

        // Update all toggle buttons on the page
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            const icon  = btn.querySelector('.theme-icon');
            const label = btn.querySelector('.theme-label');
            if (theme === LIGHT) {
                if (icon)  icon.textContent  = '🌙';
                if (label) label.textContent = 'Dark';
                btn.setAttribute('aria-label', 'Switch to dark mode');
                btn.setAttribute('title', 'Switch to dark mode');
            } else {
                if (icon)  icon.textContent  = '☀️';
                if (label) label.textContent = 'Light';
                btn.setAttribute('aria-label', 'Switch to light mode');
                btn.setAttribute('title', 'Switch to light mode');
            }
        });
    }

    /** Toggle between dark and light. */
    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || DARK;
        applyTheme(current === DARK ? LIGHT : DARK);
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    // Apply saved or default theme immediately (before paint) to avoid flash.
    const saved = localStorage.getItem(STORAGE_KEY) || DARK;
    applyTheme(saved);

    // Wire up all toggle buttons once DOM is ready.
    document.addEventListener('DOMContentLoaded', function () {
        applyTheme(localStorage.getItem(STORAGE_KEY) || DARK); // re-apply after DOM ready
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.addEventListener('click', toggleTheme);
        });
    });

    // Expose globally so inline onclick can also call it.
    window.toggleTheme = toggleTheme;
})();
