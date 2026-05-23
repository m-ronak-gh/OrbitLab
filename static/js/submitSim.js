/* ══════════════════════════════════════════════
   OrbitLab — Submit Assignment Simulation
   Embedded simulation for the assignment submission page

   Expects window.SUBMIT_CONFIG to be set by the template:
     { starterConfig: null | object, existingConfig: null | object }
   ══════════════════════════════════════════════ */

(function () {
  var canvas = document.getElementById('sim-canvas');
  var container = document.getElementById('sim-frame');

  function resize() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  var ctx = canvas.getContext('2d');
  window.simParams = { G: 100, dt: 0.4, soft: 5, trailLen: 100 };

  var bodies = [];
  var initialBodies = null;
  var running = false;
  var simTime = 0;
  var placing = null;
  var mousePos = { x: 0, y: 0 };
  var cam = { x: 0, y: 0, scale: 1 };

  var COLORS = ['#4f9cf9', '#a78bfa', '#34d399', '#fb923c', '#f87171', '#fbbf24', '#60a5fa', '#c084fc'];
  var colorIdx = 0;

  /* ── Body Class ── */
  function Body(x, y, vx, vy, mass, color, name) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.mass = mass;
    this.color = color;
    this.name = name;
    this.ax = 0;
    this.ay = 0;
    this.radius = Math.max(2.5, Math.cbrt(mass) * 1.4);
    this.trail = [];
    this.id = Math.random().toString(36).slice(2, 8);
  }

  /* ── Physics ── */
  function computeAcc() {
    for (var i = 0; i < bodies.length; i++) {
      bodies[i].ax = 0;
      bodies[i].ay = 0;
    }
    for (var i = 0; i < bodies.length; i++) {
      for (var j = i + 1; j < bodies.length; j++) {
        var dx = bodies[j].x - bodies[i].x, dy = bodies[j].y - bodies[i].y;
        var d2 = dx * dx + dy * dy + simParams.soft * simParams.soft;
        var d = Math.sqrt(d2), f = simParams.G / d2;
        var fx = f * dx / d, fy = f * dy / d;
        bodies[i].ax += fx * bodies[j].mass;
        bodies[i].ay += fy * bodies[j].mass;
        bodies[j].ax -= fx * bodies[i].mass;
        bodies[j].ay -= fy * bodies[i].mass;
      }
    }
  }

  function step() {
    var dt = simParams.dt;
    bodies.forEach(function (b) { b.vx += b.ax * dt * 0.5; b.vy += b.ay * dt * 0.5; });
    bodies.forEach(function (b) {
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > simParams.trailLen) b.trail.shift();
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    });
    computeAcc();
    bodies.forEach(function (b) { b.vx += b.ax * dt * 0.5; b.vy += b.ay * dt * 0.5; });
    simTime += dt * 0.016;
  }

  /* ── Coordinate Transforms ── */
  function wts(x, y) {
    return {
      sx: (x - cam.x) * cam.scale + canvas.width / 2,
      sy: (y - cam.y) * cam.scale + canvas.height / 2
    };
  }

  /* ── Rendering ── */
  function render() {
    ctx.fillStyle = '#03050c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bodies.forEach(function (b) {
      var p = wts(b.x, b.y);
      var r = Math.max(2, b.radius * cam.scale);
      if (b.trail.length > 1) {
        ctx.beginPath();
        var p0 = wts(b.trail[0].x, b.trail[0].y);
        ctx.moveTo(p0.sx, p0.sy);
        for (var i = 1; i < b.trail.length; i++) {
          var pt = wts(b.trail[i].x, b.trail[i].y);
          ctx.lineTo(pt.sx, pt.sy);
        }
        var g = ctx.createLinearGradient(p0.sx, p0.sy, p.sx, p.sy);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, b.color + '55');
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(0.5, r * 0.18);
        ctx.stroke();
      }
      var grd = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3.5);
      grd.addColorStop(0, b.color + '25');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r * 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      if (r * cam.scale > 3) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = Math.max(9, r * 0.8) + 'px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, p.sx, p.sy - r - 4);
      }
    });

    if (placing && placing.start) {
      var r = Math.max(2.5, Math.cbrt(placing.mass || 20) * 1.4 * cam.scale);
      ctx.beginPath();
      ctx.arc(placing.x, placing.y, r, 0, Math.PI * 2);
      ctx.fillStyle = (placing.color || '#4f9cf9') + '50';
      ctx.fill();
      ctx.strokeStyle = placing.color || '#4f9cf9';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(placing.start.x, placing.start.y);
      ctx.lineTo(mousePos.x, mousePos.y);
      ctx.strokeStyle = placing.color || '#4f9cf9';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ── Auto-Fit ── */
  function autoFit() {
    if (!bodies.length) return;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    bodies.forEach(function (b) {
      if (b.x < minX) minX = b.x;
      if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.y > maxY) maxY = b.y;
    });
    cam.x = (minX + maxX) / 2;
    cam.y = (minY + maxY) / 2;
    var span = Math.max(maxX - minX, maxY - minY, 200);
    cam.scale = Math.min(canvas.width, canvas.height) / (span * 1.5);
  }

  function kineticEnergy() {
    return bodies.reduce(function (s, b) { return s + 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy); }, 0);
  }

  /* ── Animation Loop ── */
  function loop() {
    requestAnimationFrame(loop);
    if (running && bodies.length > 0) {
      for (var i = 0; i < 2; i++) step();
      simTime += 0.001;
    }
    render();
    document.getElementById('hud-bodies').textContent = bodies.length;
    document.getElementById('hud-time').textContent = simTime.toFixed(1);
    document.getElementById('hud-ke').textContent = kineticEnergy().toFixed(0);
  }
  loop();

  /* ── Input Handling ── */
  canvas.addEventListener('mousedown', function (e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    placing = { x: mx, y: my, start: { x: mx, y: my }, mass: 20, color: COLORS[colorIdx % COLORS.length] };
  });

  canvas.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();
    mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (placing) {
      placing.x = mousePos.x;
      placing.y = mousePos.y;
    }
  });

  canvas.addEventListener('mouseup', function () {
    if (!placing || !placing.start) {
      placing = null;
      return;
    }
    var W = canvas.width, H = canvas.height;
    var wx = (placing.start.x - W / 2) / cam.scale + cam.x;
    var wy = (placing.start.y - H / 2) / cam.scale + cam.y;
    var dx = mousePos.x - placing.start.x, dy = mousePos.y - placing.start.y;
    var vs = 0.07 / cam.scale;
    var b = new Body(wx, wy, dx * vs, dy * vs, 20, placing.color, 'Body' + (bodies.length + 1));
    bodies.push(b);
    colorIdx++;
    computeAcc();
    placing = null;
    captureConfig();
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var wx = (mx - canvas.width / 2) / cam.scale + cam.x;
    var wy = (my - canvas.height / 2) / cam.scale + cam.y;
    cam.scale *= e.deltaY > 0 ? 0.88 : 1.13;
    cam.x = wx - (mx - canvas.width / 2) / cam.scale;
    cam.y = wy - (my - canvas.height / 2) / cam.scale;
  }, { passive: false });

  /* ── Controls ── */
  window.togglePlay = function () {
    running = !running;
    document.getElementById('btn-play').textContent = running ? '\u23F8 Pause' : '\u25B6 Run';
  };

  window.clearBodies = function () {
    bodies = [];
    simTime = 0;
    captureConfig();
  };

  window.resetSim = function () {
    if (initialBodies) {
      bodies = initialBodies.map(function (b) {
        return new Body(b.x, b.y, b.vx, b.vy, b.mass, b.color, b.name);
      });
      computeAcc();
      autoFit();
      simTime = 0;
      captureConfig();
    }
  };

  window.loadDemo = async function (key) {
    var r = await fetch('/api/demos/' + key);
    var d = await r.json();
    simParams.G = d.config.G;
    document.getElementById('ctrl-g').value = d.config.G;
    document.getElementById('gval').textContent = d.config.G;
    bodies = d.config.bodies.map(function (bd) {
      return new Body(bd.x, bd.y, bd.vx, bd.vy, bd.mass, bd.color, bd.name);
    });
    initialBodies = JSON.parse(JSON.stringify(d.config.bodies));
    computeAcc();
    autoFit();
    captureConfig();
  };

  /* ── Config Capture ── */
  function captureConfig() {
    var cfg = {
      G: simParams.G,
      softening: simParams.soft,
      bodies: bodies.map(function (b) {
        return { name: b.name, x: b.x, y: b.y, vx: b.vx, vy: b.vy, mass: b.mass, color: b.color };
      })
    };
    document.getElementById('config-capture').value = JSON.stringify(cfg);
  }

  document.getElementById('submit-form').addEventListener('submit', function () {
    captureConfig();
  });

  /* ── Load Initial Config ── */
  var submitCfg = window.SUBMIT_CONFIG || {};

  function loadConfig(cfg) {
    simParams.G = cfg.G || 100;
    document.getElementById('ctrl-g').value = simParams.G;
    document.getElementById('gval').textContent = simParams.G;
    bodies = (cfg.bodies || []).map(function (bd) {
      return new Body(bd.x, bd.y, bd.vx, bd.vy, bd.mass, bd.color, bd.name || 'Body');
    });
    initialBodies = JSON.parse(JSON.stringify(cfg.bodies || []));
    computeAcc();
    autoFit();
    captureConfig();
  }

  // Load existing submission config first, fall back to starter config
  if (submitCfg.existingConfig) {
    try { loadConfig(submitCfg.existingConfig); } catch (e) { /* ignore */ }
  } else if (submitCfg.starterConfig) {
    try { loadConfig(submitCfg.starterConfig); } catch (e) { console.warn('starter config error', e); }
  }
})();
