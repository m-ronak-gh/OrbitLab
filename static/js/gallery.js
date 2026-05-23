/* ══════════════════════════════════════════════
   OrbitLab — Gallery
   Fork simulation functionality
   ══════════════════════════════════════════════ */

async function forkSim(id) {
  var r = await fetch('/api/simulations/' + id + '/fork', { method: 'POST' });
  var d = await r.json();
  if (d.id) {
    window.location.href = '/sandbox?id=' + d.id;
  }
}
