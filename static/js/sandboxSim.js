/* ══════════════════════════════════════════════
   OrbitLab — Sandbox Simulation Engine
   Full 2D N-body simulation with canvas rendering
   
   Expects the template to set:
     window.SANDBOX_CONFIG = { simId, demoKey, assignmentId, isAuthenticated }
   ══════════════════════════════════════════════ */

(function () {
  var canvas = document.getElementById('sim-canvas');
  var container = document.getElementById('sim-container');

  function resize() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  var ctx = canvas.getContext('2d');

  window.simParams = { G: 100, dt: 0.4, soft: 5, trailLen: 120 };
  window.placingParams = { mass: 20, radius: 0, color: null };

  var bodies = [];
  var initialBodies = null;
  var running = false;
  var simTime = 0;
  var placing = null;
  var mousePos = { x: 0, y: 0 };
  var cam = { x: 0, y: 0, scale: 1 };
  var showVectors = false;
  var showGrid = false;
  var currentScenario = '';
  var savedId = null;

  /* ── Theme Colors ── */
  function getThemeColors() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      bg: isDark ? '#000000' : '#ffffff',
      text: isDark ? '#ffffff' : '#000000',
      border: isDark ? '#ffffff' : '#000000',
      grid: isDark ? '#333333' : '#e5e5e5',
      trail: isDark ? '#666666' : '#cccccc'
    };
  }

  /* ── Body Class ── */
  function Body(x, y, vx, vy, mass, color, name, radius) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.mass = mass;
    this.color = color;
    this.name = name;
    this.ax = 0;
    this.ay = 0;
    this.radius = radius || Math.max(2.5, Math.cbrt(mass) * 1.4);
    this.trail = [];
    this.id = Math.random().toString(36).slice(2, 8);
  }

  Body.prototype.getRenderColor = function () {
    return this.color || getThemeColors().text;
  };

  /* ── Physics ── */
  function computeAcc() {
    var i, j, dx, dy, d2, d, f, fx, fy;
    for (i = 0; i < bodies.length; i++) {
      bodies[i].ax = 0;
      bodies[i].ay = 0;
    }
    for (i = 0; i < bodies.length; i++) {
      for (j = i + 1; j < bodies.length; j++) {
        dx = bodies[j].x - bodies[i].x;
        dy = bodies[j].y - bodies[i].y;
        d2 = dx * dx + dy * dy + simParams.soft * simParams.soft;
        d = Math.sqrt(d2);
        f = simParams.G / d2;
        fx = f * dx / d;
        fy = f * dy / d;
        bodies[i].ax += fx * bodies[j].mass;
        bodies[i].ay += fy * bodies[j].mass;
        bodies[j].ax -= fx * bodies[i].mass;
        bodies[j].ay -= fy * bodies[i].mass;
      }
    }
  }

  function step() {
    var dt = simParams.dt;
    var b, i;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      b.vx += b.ax * dt * 0.5;
      b.vy += b.ay * dt * 0.5;
    }
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (simParams.trailLen > 0) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > simParams.trailLen) b.trail.shift();
      } else {
        b.trail = [];
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    computeAcc();
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      b.vx += b.ax * dt * 0.5;
      b.vy += b.ay * dt * 0.5;
    }
    simTime += dt * 0.016;
  }

  /* ── Coordinate Transforms ── */
  function wts(x, y) {
    return {
      sx: (x - cam.x) * cam.scale + canvas.width / 2,
      sy: (y - cam.y) * cam.scale + canvas.height / 2
    };
  }

  function stw(sx, sy) {
    return {
      x: (sx - canvas.width / 2) / cam.scale + cam.x,
      y: (sy - canvas.height / 2) / cam.scale + cam.y
    };
  }

  /* ── Grid ── */
  function drawGrid() {
    var colors = getThemeColors();
    var gridStep = Math.pow(10, Math.floor(Math.log10(200 / cam.scale)));
    var startX = Math.floor((cam.x - canvas.width / 2 / cam.scale) / gridStep) * gridStep;
    var startY = Math.floor((cam.y - canvas.height / 2 / cam.scale) / gridStep) * gridStep;
    var x, y, p;

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (x = startX; x < cam.x + canvas.width / 2 / cam.scale; x += gridStep) {
      p = wts(x, 0);
      ctx.beginPath();
      ctx.moveTo(p.sx, 0);
      ctx.lineTo(p.sx, canvas.height);
      ctx.stroke();
    }
    for (y = startY; y < cam.y + canvas.height / 2 / cam.scale; y += gridStep) {
      p = wts(0, y);
      ctx.beginPath();
      ctx.moveTo(0, p.sy);
      ctx.lineTo(canvas.width, p.sy);
      ctx.stroke();
    }

    var origin = wts(0, 0);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(origin.sx, 0);
    ctx.lineTo(origin.sx, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, origin.sy);
    ctx.lineTo(canvas.width, origin.sy);
    ctx.stroke();
  }

  /* ── Rendering ── */
  function render() {
    var colors = getThemeColors();
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (showGrid) drawGrid();

    var i, b, p, p0, r, vLen, vNx, vNy, arrowLen, ex, ey, angle;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      p = wts(b.x, b.y);
      r = Math.max(2, b.radius * cam.scale);

      // Trail
      if (b.trail.length > 1) {
        ctx.beginPath();
        p0 = wts(b.trail[0].x, b.trail[0].y);
        ctx.moveTo(p0.sx, p0.sy);
        for (var t = 1; t < b.trail.length; t++) {
          var pt = wts(b.trail[t].x, b.trail[t].y);
          ctx.lineTo(pt.sx, pt.sy);
        }
        ctx.strokeStyle = colors.trail;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Body
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = b.getRenderColor();
      ctx.fill();
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      if (r > 3) {
        ctx.fillStyle = colors.text;
        ctx.font = 'bold ' + Math.min(12, Math.max(9, r * 0.75)) + 'px var(--font-mono)';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, p.sx, p.sy - r - 8);
      }

      // Velocity vectors
      if (showVectors && (Math.abs(b.vx) > 0.01 || Math.abs(b.vy) > 0.01)) {
        vLen = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        vNx = b.vx / vLen;
        vNy = b.vy / vLen;
        arrowLen = Math.min(vLen * 8 * cam.scale, 60);
        ex = p.sx + vNx * arrowLen;
        ey = p.sy + vNy * arrowLen;
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = colors.text;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        angle = Math.atan2(vNy, vNx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 6 * Math.cos(angle - 0.4), ey - 6 * Math.sin(angle - 0.4));
        ctx.lineTo(ex - 6 * Math.cos(angle + 0.4), ey - 6 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = colors.text;
        ctx.fill();
      }
    }

    // Placement preview
    if (placing && placing.start) {
      var mass = placingParams.mass;
      var placingRadius = placingParams.radius || Math.max(2.5, Math.cbrt(mass) * 1.4);
      var pr = placingRadius * cam.scale;
      ctx.beginPath();
      ctx.arc(placing.x, placing.y, pr, 0, Math.PI * 2);
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(placing.start.x, placing.start.y);
      ctx.lineTo(mousePos.x, mousePos.y);
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      var pdx = mousePos.x - placing.start.x;
      var pdy = mousePos.y - placing.start.y;
      var v = Math.sqrt(pdx * pdx + pdy * pdy) * 0.07 / cam.scale;
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 10px var(--font-mono)';
      ctx.textAlign = 'left';
      ctx.fillText('V\u2248' + v.toFixed(1), mousePos.x + 8, mousePos.y - 5);
    }
  }

  /* ── Auto-Fit Camera ── */
  function autoFit() {
    if (!bodies.length) return;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (b.x < minX) minX = b.x;
      if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.y > maxY) maxY = b.y;
    }
    cam.x = (minX + maxX) / 2;
    cam.y = (minY + maxY) / 2;
    var span = Math.max(maxX - minX, maxY - minY, 200);
    cam.scale = Math.min(canvas.width, canvas.height) / (span * 1.6);
  }

  /* ── Kinetic Energy ── */
  function ke() {
    var s = 0;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      s += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy);
    }
    return s;
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
    document.getElementById('hud-ke').textContent = ke().toFixed(0);
  }
  loop();

  window.addEventListener('themechanged', render);

  /* ── Input Handling ── */
  var isPanning = false, panStart = null, panCam = null;

  canvas.addEventListener('mousedown', function (e) {
    if (e.button === 2) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panCam = { x: cam.x, y: cam.y, scale: cam.scale };
      return;
    }
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    placing = { x: mx, y: my, start: { x: mx, y: my } };
  });

  canvas.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();
    mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (placing) {
      placing.x = mousePos.x;
      placing.y = mousePos.y;
    }
    if (isPanning && panStart) {
      cam.x = panCam.x - (e.clientX - panStart.x) / cam.scale;
      cam.y = panCam.y - (e.clientY - panStart.y) / cam.scale;
    }
  });

  canvas.addEventListener('mouseup', function (e) {
    if (e.button === 2) {
      isPanning = false;
      return;
    }
    if (!placing || !placing.start) {
      placing = null;
      return;
    }
    var w = stw(placing.start.x, placing.start.y);
    var dx = mousePos.x - placing.start.x, dy = mousePos.y - placing.start.y;
    var vs = 0.07 / cam.scale;
    var b = new Body(w.x, w.y, dx * vs, dy * vs, placingParams.mass, placingParams.color, 'B' + (bodies.length + 1), placingParams.radius || undefined);
    bodies.push(b);
    computeAcc();
    placing = null;
    document.getElementById('place-hint').style.opacity = '0';
  });

  canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var w = stw(mx, my);
    cam.scale *= e.deltaY > 0 ? 0.88 : 1.13;
    cam.x = w.x - (mx - canvas.width / 2) / cam.scale;
    cam.y = w.y - (my - canvas.height / 2) / cam.scale;
  }, { passive: false });

  /* ── Global Controls ── */
  window.togglePlay = function () {
    running = !running;
    document.getElementById('btn-play').textContent = running ? '\u23F8 Pause' : '\u25B6 Play';
  };

  window.resetSim = function () {
    if (!initialBodies) return;
    bodies = initialBodies.map(function (b) {
      return new Body(b.x, b.y, b.vx, b.vy, b.mass, b.color, b.name, b.radius);
    });
    computeAcc();
    autoFit();
    simTime = 0;
  };

  window.clearBodies = function () {
    bodies = [];
    initialBodies = null;
    simTime = 0;
    running = false;
    document.getElementById('btn-play').textContent = '\u25B6 Play';
  };

  window.toggleVectors = function () {
    showVectors = !showVectors;
    document.getElementById('btn-vectors').classList.toggle('active', showVectors);
  };

  window.toggleGrid = function () {
    showGrid = !showGrid;
    document.getElementById('btn-grid').classList.toggle('active', showGrid);
  };

  /* ── Demo Loading ── */
  window.loadDemo = async function (key) {
    var r = await fetch('/api/demos/' + key);
    var d = await r.json();
    simParams.G = d.config.G;
    document.getElementById('ctrl-g').value = d.config.G;
    document.getElementById('gval').textContent = d.config.G;
    bodies = d.config.bodies.map(function (bd) {
      return new Body(bd.x, bd.y, bd.vx, bd.vy, bd.mass, null, bd.name, bd.radius);
    });
    initialBodies = JSON.parse(JSON.stringify(d.config.bodies)).map(function (bd) {
      bd.color = null;
      return bd;
    });
    currentScenario = d.scenario;
    document.getElementById('hud-scenario').textContent = d.title.toUpperCase();
    computeAcc();
    autoFit();
    simTime = 0;
    document.getElementById('place-hint').style.opacity = '0';
    if (document.getElementById('save-title').value === '') {
      document.getElementById('save-title').value = d.title;
      document.getElementById('save-desc').value = d.description;
    }
  };

  /* ── Save Modal ── */
  window.openSaveModal = function () {
    document.getElementById('save-modal').classList.add('open');
  };

  window.closeSaveModal = function () {
    document.getElementById('save-modal').classList.remove('open');
  };

  window.saveSim = async function () {
    var title = document.getElementById('save-title').value || 'Untitled System';
    var desc = document.getElementById('save-desc').value;
    var pub = document.getElementById('save-public').checked;
    var config = {
      G: simParams.G,
      softening: simParams.soft,
      bodies: bodies.map(function (b) {
        return { name: b.name, x: b.x, y: b.y, vx: b.vx, vy: b.vy, mass: b.mass, color: b.color, radius: b.radius };
      })
    };
    var payload = { title: title, description: desc, scenario: currentScenario || 'custom', config: config, is_public: pub };
    if (savedId) payload.id = savedId;
    var r = await fetch('/api/simulations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    var d = await r.json();
    savedId = d.id;
    closeSaveModal();
    var hud = document.getElementById('hud-scenario');
    var oldText = hud.textContent;
    hud.textContent = 'SAVED \u2713';
    setTimeout(function () { hud.textContent = oldText; }, 2500);
  };

  /* ── Initial State Loading ── */
  var cfg = window.SANDBOX_CONFIG || {};

  if (cfg.simId) {
    (async function () {
      var r = await fetch('/api/simulations/' + cfg.simId);
      var d = await r.json();
      simParams.G = d.config.G || 100;
      document.getElementById('ctrl-g').value = simParams.G;
      document.getElementById('gval').textContent = simParams.G;
      bodies = (d.config.bodies || []).map(function (bd) {
        return new Body(bd.x, bd.y, bd.vx, bd.vy, bd.mass, bd.color, bd.name || 'Body', bd.radius);
      });
      initialBodies = JSON.parse(JSON.stringify(d.config.bodies || []));
      currentScenario = d.scenario;
      savedId = d.id;
      document.getElementById('hud-scenario').textContent = d.title.toUpperCase();
      document.getElementById('save-title').value = d.title;
      document.getElementById('save-desc').value = d.description || '';
      computeAcc();
      autoFit();
    })();
  } else if (cfg.demoKey) {
    loadDemo(cfg.demoKey);
  } else if (cfg.assignmentId) {
    (async function () {
      var r = await fetch('/api/simulations/' + cfg.assignmentId);
      var d = await r.json();
      if (d.config) {
        simParams.G = d.config.G || 100;
        document.getElementById('ctrl-g').value = simParams.G;
        document.getElementById('gval').textContent = simParams.G;
        bodies = (d.config.bodies || []).map(function (bd) {
          return new Body(bd.x, bd.y, bd.vx, bd.vy, bd.mass, bd.color, bd.name || 'Body', bd.radius);
        });
        initialBodies = JSON.parse(JSON.stringify(d.config.bodies || []));
        computeAcc();
        autoFit();
      }
    })();
  }
})();
