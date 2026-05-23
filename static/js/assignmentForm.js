/* ══════════════════════════════════════════════
   OrbitLab — Assignment Form Helpers
   Demo loading for assignment creation/editing
   ══════════════════════════════════════════════ */

// Expects window.DEMO_CONFIGS to be set by the template
window.useDemo = function (key) {
  var d = window.DEMO_CONFIGS[key];
  if (!d) return;
  var cfg = JSON.stringify({ G: d.G, softening: d.softening, bodies: d.bodies }, null, 2);
  document.getElementById('config-preview').value = cfg;
  var status = document.getElementById('config-status');
  status.textContent = '\u2713 Loaded: ' + d.title + ' (' + d.bodies.length + ' bodies)';
  status.style.display = 'block';
  status.style.color = '#34d399';
};

window.clearConfig = function () {
  document.getElementById('config-preview').value = '';
  document.getElementById('config-status').style.display = 'none';
};
