/* ══════════════════════════════════════════════
   OrbitLab — Demos Preview
   Mini canvas previews for demo cards

   Expects window.DEMO_DATA to be set by the template
   ══════════════════════════════════════════════ */

(function () {
  var DEMO_DATA = window.DEMO_DATA || {};

  function runPreview(canvas, previewBodies, G) {
    var w = canvas.width = canvas.offsetWidth;
    var h = canvas.height = canvas.offsetHeight;
    var ctx = canvas.getContext('2d');

    function getColors() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      return {
        bg: isDark ? '#000000' : '#ffffff',
        body: isDark ? '#ffffff' : '#000000',
        trail: isDark ? '#333333' : '#eeeeee'
      };
    }

    // Clone bodies
    var bods = previewBodies.map(function (b) {
      return {
        x: b.x, y: b.y, vx: b.vx, vy: b.vy, mass: b.mass,
        color: null, ax: 0, ay: 0, trail: []
      };
    });

    var soft = 5;
    // Auto-fit
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    bods.forEach(function (b) {
      if (b.x < minX) minX = b.x;
      if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.y > maxY) maxY = b.y;
    });
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var span = Math.max(maxX - minX, maxY - minY, 200);
    var scale = Math.min(w, h) / (span * 1.6);

    function wx(x) { return (x - cx) * scale + w / 2; }
    function wy(y) { return (y - cy) * scale + h / 2; }

    function computeAcc() {
      bods.forEach(function (b) { b.ax = 0; b.ay = 0; });
      for (var i = 0; i < bods.length; i++) {
        for (var j = i + 1; j < bods.length; j++) {
          var dx = bods[j].x - bods[i].x, dy = bods[j].y - bods[i].y;
          var d2 = dx * dx + dy * dy + soft * soft;
          var d = Math.sqrt(d2), f = G / d2;
          var fx = f * dx / d, fy = f * dy / d;
          bods[i].ax += fx * bods[j].mass;
          bods[i].ay += fy * bods[j].mass;
          bods[j].ax -= fx * bods[i].mass;
          bods[j].ay -= fy * bods[i].mass;
        }
      }
    }
    computeAcc();

    function step() {
      var dt = 0.4;
      bods.forEach(function (b) { b.vx += b.ax * dt * 0.5; b.vy += b.ay * dt * 0.5; });
      bods.forEach(function (b) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 60) b.trail.shift();
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      });
      computeAcc();
      bods.forEach(function (b) { b.vx += b.ax * dt * 0.5; b.vy += b.ay * dt * 0.5; });
    }

    function draw() {
      var colors = getColors();
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, w, h);
      bods.forEach(function (b) {
        var sx = wx(b.x), sy = wy(b.y);
        var r = Math.max(1.5, Math.cbrt(b.mass) * 1.2 * scale);
        if (b.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(wx(b.trail[0].x), wy(b.trail[0].y));
          b.trail.forEach(function (p) { ctx.lineTo(wx(p.x), wy(p.y)); });
          ctx.strokeStyle = colors.trail;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = colors.body;
        ctx.fill();
      });
    }

    function loop() {
      requestAnimationFrame(loop);
      for (var i = 0; i < 3; i++) step();
      draw();
    }
    loop();

    window.addEventListener('themechanged', draw);
  }

  document.querySelectorAll('.demo-preview-canvas').forEach(function (canvas) {
    var key = canvas.dataset.key;
    var d = DEMO_DATA[key];
    if (d) {
      setTimeout(function () { runPreview(canvas, d.bodies, d.G); }, 50);
    }
  });
})();
