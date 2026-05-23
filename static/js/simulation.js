import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── State ──────────────────────────────────────────────────────────
let G = 1.0;
let timeStep = 0.016;
let bodies = [];
let isPaused = false;
let mode = 'add';
let theta = 0.5;
let trailLength = 150;
let showVectors = false;
let collisionsEnabled = true;
let simTime = 0;

// ─── Barnes-Hut Quadtree ────────────────────────────────────────────
class Quadtree {
    constructor(x, y, size, capacity = 1) {
        this.x = x; this.y = y; this.size = size; this.capacity = capacity;
        this.bodies = []; this.divided = false;
        this.centerOfMass = new THREE.Vector2(0, 0);
        this.totalMass = 0;
    }

    subdivide() {
        const s = this.size / 2;
        const cx = this.x, cy = this.y;
        this.nw = new Quadtree(cx - s/2, cy + s/2, s, this.capacity);
        this.ne = new Quadtree(cx + s/2, cy + s/2, s, this.capacity);
        this.sw = new Quadtree(cx - s/2, cy - s/2, s, this.capacity);
        this.se = new Quadtree(cx + s/2, cy - s/2, s, this.capacity);
        this.divided = true;
        for (let b of this.bodies) this.insertToChild(b);
        this.bodies = [];
    }

    insertToChild(body) {
        if (body.pos.x < this.x && body.pos.y >= this.y) this.nw.insert(body);
        else if (body.pos.x >= this.x && body.pos.y >= this.y) this.ne.insert(body);
        else if (body.pos.x < this.x && body.pos.y < this.y) this.sw.insert(body);
        else this.se.insert(body);
    }

    insert(body) {
        if (!this.divided) {
            if (this.bodies.length < this.capacity) {
                this.bodies.push(body);
            } else {
                this.subdivide();
                this.insertToChild(body);
            }
        } else {
            this.insertToChild(body);
        }
        const newMass = this.totalMass + body.mass;
        this.centerOfMass.x = (this.centerOfMass.x * this.totalMass + body.pos.x * body.mass) / newMass;
        this.centerOfMass.y = (this.centerOfMass.y * this.totalMass + body.pos.y * body.mass) / newMass;
        this.totalMass = newMass;
    }

    calculateForce(body, G, theta, forceVec) {
        const dx = this.centerOfMass.x - body.pos.x;
        const dy = this.centerOfMass.y - body.pos.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(distSq);

        if (this.divided && this.size / dist < theta && dist > 0) {
            const f = (G * body.mass * this.totalMass) / distSq;
            forceVec.x += (dx / dist) * f;
            forceVec.y += (dy / dist) * f;
        } else if (this.divided) {
            this.nw.calculateForce(body, G, theta, forceVec);
            this.ne.calculateForce(body, G, theta, forceVec);
            this.sw.calculateForce(body, G, theta, forceVec);
            this.se.calculateForce(body, G, theta, forceVec);
        } else {
            for (let other of this.bodies) {
                if (other === body) continue;
                const odx = other.pos.x - body.pos.x;
                const ody = other.pos.y - body.pos.y;
                const odistSq = odx * odx + ody * ody + 0.01;
                const odist = Math.sqrt(odistSq);
                const f = (G * body.mass * other.mass) / odistSq;
                forceVec.x += (odx / odist) * f;
                forceVec.y += (ody / odist) * f;
            }
        }
    }
}

// ─── Three.js Setup ─────────────────────────────────────────────────
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020204);
scene.fog = new THREE.FogExp2(0x020204, 0.0008);

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 10000);
camera.position.set(0, 0, 300);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

// Lighting
const ambient = new THREE.AmbientLight(0x404040, 0.4);
scene.add(ambient);
const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
sunLight.position.set(100, 100, 100);
scene.add(sunLight);

// Starfield
const starGeo = new THREE.BufferGeometry();
const starCount = 3000;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) {
    starPos[i] = (Math.random() - 0.5) * 4000;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.6 });
scene.add(new THREE.Points(starGeo, starMat));

// ─── Body Class ─────────────────────────────────────────────────────
class Body {
    constructor(x, y, z, mass, color, vx = 0, vy = 0, vz = 0) {
        this.mass = mass;
        this.radius = Math.max(2, Math.pow(mass, 1/3) * 0.5);
        this.color = color;
        this.pos = new THREE.Vector3(x, y, z);
        this.vel = new THREE.Vector3(vx, vy, vz);
        this.acc = new THREE.Vector3(0, 0, 0);
        this.id = Math.random().toString(36).substr(2, 9);

        // Mesh
        const geo = new THREE.SphereGeometry(this.radius, 32, 32);
        const mat = new THREE.MeshPhongMaterial({ 
            color: color, 
            shininess: 30,
            emissive: color,
            emissiveIntensity: 0.1
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(this.pos);
        scene.add(this.mesh);

        // Glow
        const glowGeo = new THREE.SphereGeometry(this.radius * 1.4, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({ 
            color: color, 
            transparent: true, 
            opacity: 0.15 
        });
        this.glow = new THREE.Mesh(glowGeo, glowMat);
        this.glow.position.copy(this.pos);
        scene.add(this.glow);

        // Trail
        this.trailPoints = [];
        this.trailGeo = new THREE.BufferGeometry();
        const trailMat = new THREE.LineBasicMaterial({ 
            color: color, 
            transparent: true, 
            opacity: 0.25,
            linewidth: 1 
        });
        this.trail = new THREE.Line(this.trailGeo, trailMat);
        this.trail.frustumCulled = false;
        scene.add(this.trail);

        // Velocity arrow
        this.velArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1,0,0), this.pos, 10, color, 4, 2
        );
        this.velArrow.visible = false;
        scene.add(this.velArrow);
    }

    updateTrail() {
        this.trailPoints.push(this.pos.clone());
        if (this.trailPoints.length > trailLength) this.trailPoints.shift();
        if (this.trailPoints.length > 1) {
            this.trailGeo.setFromPoints(this.trailPoints);
        }
    }

    updateVectors() {
        if (showVectors && this.vel.length() > 0.01) {
            this.velArrow.position.copy(this.pos);
            this.velArrow.setDirection(this.vel.clone().normalize());
            this.velArrow.setLength(Math.min(this.vel.length() * 8, 50), 6, 3);
            this.velArrow.visible = true;
        } else {
            this.velArrow.visible = false;
        }
    }

    destroy() {
        scene.remove(this.mesh); scene.remove(this.glow); scene.remove(this.trail); scene.remove(this.velArrow);
        this.mesh.geometry.dispose(); this.mesh.material.dispose();
        this.glow.geometry.dispose(); this.glow.material.dispose();
        this.trailGeo.dispose(); this.trail.material.dispose();
    }
}

// ─── Interaction ─────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

container.addEventListener('mousedown', (e) => {
    if (mode !== 'add') return;
    if (e.target.closest('.hud-panel') || e.target.closest('.glass-strong')) return;

    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const pt = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, pt);

    if (pt) {
        const mass = parseFloat(document.getElementById('input-mass').value);
        const color = document.getElementById('input-color').value;
        const vx = parseFloat(document.getElementById('input-vx').value);
        const vy = parseFloat(document.getElementById('input-vy').value);
        
        const b = new Body(pt.x, pt.y, 0, mass, color, vx, vy, 0);
        bodies.push(b);
        updateBodyCount();
    }
});

// ─── Physics ─────────────────────────────────────────────────────────
function updatePhysics() {
    if (bodies.length === 0) return;

    // Build bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let b of bodies) {
        minX = Math.min(minX, b.pos.x); minY = Math.min(minY, b.pos.y);
        maxX = Math.max(maxX, b.pos.x); maxY = Math.max(maxY, b.pos.y);
    }
    const size = Math.max(maxX - minX, maxY - minY, 50) * 1.2;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    const qt = new Quadtree(cx, cy, size, 1);
    for (let b of bodies) qt.insert(b);

    // Calculate forces
    for (let b of bodies) {
        const force = new THREE.Vector2(0, 0);
        qt.calculateForce(b, G, theta, force);
        b.acc.set(force.x / b.mass, force.y / b.mass, 0);
    }

    // Integrate + collisions
    const toRemove = new Set();
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        b.vel.add(b.acc.clone().multiplyScalar(timeStep));
        b.pos.add(b.vel.clone().multiplyScalar(timeStep));
        b.mesh.position.copy(b.pos);
        b.glow.position.copy(b.pos);
        b.updateTrail();
        b.updateVectors();

        // Collision check
        if (collisionsEnabled) {
            for (let j = i + 1; j < bodies.length; j++) {
                const other = bodies[j];
                const dist = b.pos.distanceTo(other.pos);
                if (dist < (b.radius + other.radius) * 0.8) {
                    // Merge
                    const newMass = b.mass + other.mass;
                    const newVel = b.vel.clone().multiplyScalar(b.mass).add(other.vel.clone().multiplyScalar(other.mass)).divideScalar(newMass);
                    b.mass = newMass;
                    b.radius = Math.max(2, Math.pow(newMass, 1/3) * 0.5);
                    b.vel.copy(newVel);
                    
                    // Update mesh
                    b.mesh.geometry.dispose();
                    b.mesh.geometry = new THREE.SphereGeometry(b.radius, 32, 32);
                    b.glow.geometry.dispose();
                    b.glow.geometry = new THREE.SphereGeometry(b.radius * 1.4, 16, 16);
                    
                    toRemove.add(j);
                }
            }
        }
    }

    // Remove merged
    if (toRemove.size > 0) {
        const indices = Array.from(toRemove).sort((a,b) => b - a);
        for (let idx of indices) {
            bodies[idx].destroy();
            bodies.splice(idx, 1);
        }
        updateBodyCount();
    }

    simTime += timeStep;
}

// ─── UI Bindings ────────────────────────────────────────────────────
function updateBodyCount() {
    document.getElementById('body-count').innerText = bodies.length;
}

document.getElementById('input-mass').oninput = (e) => document.getElementById('mass-val').innerText = e.target.value;
document.getElementById('input-vx').oninput = (e) => document.getElementById('vx-val').innerText = e.target.value;
document.getElementById('input-vy').oninput = (e) => document.getElementById('vy-val').innerText = e.target.value;
document.getElementById('input-g').oninput = (e) => { G = parseFloat(e.target.value); document.getElementById('g-val').innerText = G.toFixed(1); };
document.getElementById('input-ts').oninput = (e) => { timeStep = parseFloat(e.target.value); document.getElementById('ts-val').innerText = timeStep.toFixed(3); };
document.getElementById('input-trail').oninput = (e) => { trailLength = parseInt(e.target.value); document.getElementById('trail-val').innerText = trailLength; };

document.getElementById('mode-add').onclick = () => {
    mode = 'add';
    document.getElementById('mode-add').classList.add('active');
    document.getElementById('mode-observe').classList.remove('active');
    controls.mouseButtons.LEFT = null;
};
document.getElementById('mode-observe').onclick = () => {
    mode = 'observe';
    document.getElementById('mode-observe').classList.add('active');
    document.getElementById('mode-add').classList.remove('active');
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
};

document.getElementById('btn-pause').onclick = () => {
    isPaused = !isPaused;
    document.getElementById('btn-pause').innerText = isPaused ? 'Resume' : 'Pause';
    document.getElementById('sim-status').innerText = isPaused ? 'Paused' : 'Running';
    document.getElementById('sim-status-indicator').className = `w-2 h-2 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`;
};
document.getElementById('btn-step').onclick = () => {
    if (isPaused) updatePhysics();
};
document.getElementById('btn-clear').onclick = () => {
    bodies.forEach(b => b.destroy());
    bodies = []; simTime = 0;
    updateBodyCount();
};
document.getElementById('toggle-vectors').onchange = (e) => { showVectors = e.target.checked; };
document.getElementById('toggle-collisions').onchange = (e) => { collisionsEnabled = e.target.checked; };

// ─── Save / Submit ──────────────────────────────────────────────────
document.getElementById('save-sim')?.addEventListener('click', async () => {
    const title = document.getElementById('sim-title').value || 'Untitled Universe';
    const config = {
        G, timeStep, trailLength,
        bodies: bodies.map(b => ({
            pos: [b.pos.x, b.pos.y, b.pos.z],
            vel: [b.vel.x, b.vel.y, b.vel.z],
            mass: b.mass, radius: b.radius, color: b.color
        }))
    };
    
    const resp = await fetch('/api/simulations', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title, description: '', config, is_public: true, scenario_type: 'custom'})
    });
    
    if (resp.ok) {
        const data = await resp.json();
        alert('Saved! ID: ' + data.id);
    }
});

document.getElementById('submit-assignment')?.addEventListener('click', async () => {
    const assignmentId = window.ORBIT_LAB_CONFIG.assignmentId;
    if (!assignmentId) return;
    
    // First save simulation
    const title = document.getElementById('sim-title').value || 'Assignment Solution';
    const config = {
        G, timeStep, trailLength,
        bodies: bodies.map(b => ({
            pos: [b.pos.x, b.pos.y, b.pos.z],
            vel: [b.vel.x, b.vel.y, b.vel.z],
            mass: b.mass, radius: b.radius, color: b.color
        }))
    };
    
    const simResp = await fetch('/api/simulations', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title, description: 'Assignment submission', config, is_public: false})
    });
    
    const simData = await simResp.json();
    
    // Then submit
    const subResp = await fetch('/api/submissions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({assignment_id: parseInt(assignmentId), simulation_id: simData.id, config})
    });
    
    if (subResp.ok) {
        alert('Submitted successfully!');
        window.location.href = '/assignments';
    }
});

// ─── Loading ────────────────────────────────────────────────────────
async function loadInitialState() {
    const { simId, scenarioId, assignmentId } = window.ORBIT_LAB_CONFIG;
    
    if (simId) {
        try {
            const r = await fetch(`/api/simulations/${simId}`);
            const data = await r.json();
            loadConfig(data.config);
        } catch(e) { console.error(e); }
    } else if (scenarioId) {
        try {
            const r = await fetch(`/api/scenarios/${scenarioId}`);
            const data = await r.json();
            loadConfig(data.config);
        } catch(e) { console.error(e); }
    } else if (assignmentId) {
        try {
            const r = await fetch(`/api/assignments/${assignmentId}`);
            // Assignment starter config would be loaded here
        } catch(e) { console.error(e); }
    }
    
    document.getElementById('loading-overlay').style.opacity = '0';
    setTimeout(() => document.getElementById('loading-overlay').style.display = 'none', 700);
}

function loadConfig(config) {
    bodies.forEach(b => b.destroy());
    bodies = [];
    
    G = config.G || 1.0;
    timeStep = config.timeStep || 0.016;
    trailLength = config.trailLength || 150;
    
    document.getElementById('input-g').value = G;
    document.getElementById('g-val').innerText = G.toFixed(1);
    document.getElementById('input-ts').value = timeStep;
    document.getElementById('ts-val').innerText = timeStep.toFixed(3);
    document.getElementById('input-trail').value = trailLength;
    document.getElementById('trail-val').innerText = trailLength;
    
    for (const b of config.bodies) {
        bodies.push(new Body(b.pos[0], b.pos[1], b.pos[2], b.mass, b.color, b.vel[0], b.vel[1], b.vel[2]));
    }
    updateBodyCount();
}

// ─── Animation ──────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    if (!isPaused) updatePhysics();
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

setTimeout(loadInitialState, 500);
animate();