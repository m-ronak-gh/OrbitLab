/* ══════════════════════════════════════════════
   OrbitLab — Theme Management
   Initializes and toggles light/dark theme
   ══════════════════════════════════════════════ */

(function () {
  // Apply saved theme immediately to prevent flash
  var savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme');
  var next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme: next } }));
}
