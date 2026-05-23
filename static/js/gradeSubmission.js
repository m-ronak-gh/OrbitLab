/* ══════════════════════════════════════════════
   OrbitLab — Grade Submission Preview
   Inline sim preview for the grading page

   Expects window.RAW_CONFIG to be set by the template
   ══════════════════════════════════════════════ */

window.loadStudentSim = function () {
  var RAW_CONFIG = window.RAW_CONFIG || {};
  var frame = document.getElementById('sim-frame');
  var info = document.getElementById('sim-info');
  frame.style.display = 'block';
  info.style.display = 'block';
  document.getElementById('load-btn').textContent = '\u23F8 Running';

  var canvas = document.getElementById('sim-canvas');
  canvas.width = frame.clientWidth;
  canvas.height = frame.clientHeight;
  var ctx = canvas.getContext('2d');

  var bodies = (RAW_CONFIG.bodies || []).map(function (b) {
    return {
      x: b.x, y: b.y, vx: b.vx, vy: b.vy, mass: b.mass,
      color: b.color, name: b.name,
      trail: [], ax: 0, ay: 0,
      radius: Math.max(2.5, Math.cbrt(b.mass) * 1.4)
    };
  });
  var G = RAW_CONFIG.G || 100, soft = RAW_CONFIG.softening || 5;

  var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  bodies.forEach(function (b) {
    if (b.x < minX) minX = b.x;
    if (b.x > maxX) maxX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.y > maxY) maxY = b.y;
  });
  var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  var span = Math.max(maxX - minX, maxY - minY, 200);
  var scale = Math.min(canvas.width, canvas.height) / (span * 1.5);

  document.getElementById('sim-body-info').textContent =
    bodies.map(function (b) { return b.name + ': mass=' + b.mass; }).join('  |  ');

  function computeAcc() {
    bodies.forEach(function (b) { b.ax = 0; b.ay = 0; });
    for (var i = 0; i < bodies.length; i++) {
      for (var j = i + 1; j < bodies.length; j++) {
        var dx = bodies[j].x - bodies[i].x, dy = bodies[j].y - bodies[i].y;
        var d = Math.sqrt(dx * dx + dy * dy + soft * soft), f = G / (d * d);
        bodies[i].ax += f * dx / d * bodies[j].mass;
        bodies[i].ay += f * dy / d * bodies[j].mass;
        bodies[j].ax -= f * dx / d * bodies[i].mass;
        bodies[j].ay -= f * dy / d * bodies[i].mass;
      }
    }
  }
  computeAcc();

  function wts(x, y) {
    return { sx: (x - cx) * scale + canvas.width / 2, sy: (y - cy) * scale + canvas.height / 2 };
  }

  function loop() {
    requestAnimationFrame(loop);
    for (var i = 0; i < 2; i++) {
      bodies.forEach(function (b) { b.vx += b.ax * 0.4 * 0.5; b.vy += b.ay * 0.4 * 0.5; });
      bodies.forEach(function (b) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 80) b.trail.shift();
        b.x += b.vx * 0.4;
        b.y += b.vy * 0.4;
      });
      computeAcc();
      bodies.forEach(function (b) { b.vx += b.ax * 0.4 * 0.5; b.vy += b.ay * 0.4 * 0.5; });
    }
    ctx.fillStyle = '#03050c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bodies.forEach(function (b) {
      var p = wts(b.x, b.y);
      var r = Math.max(2, b.radius * scale);
      if (b.trail.length > 1) {
        ctx.beginPath();
        var p0 = wts(b.trail[0].x, b.trail[0].y);
        ctx.moveTo(p0.sx, p0.sy);
        b.trail.forEach(function (tp) { var q = wts(tp.x, tp.y); ctx.lineTo(q.sx, q.sy); });
        ctx.strokeStyle = b.color + '44';
        ctx.lineWidth = Math.max(0.5, r * 0.15);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.font = Math.max(9, r * 0.7) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, p.sx, p.sy - r - 4);
    });
  }
  loop();
};
