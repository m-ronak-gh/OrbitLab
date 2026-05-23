import os
import json
import requests
from datetime import datetime
from flask import (Flask, render_template, request, redirect, url_for,
                   flash, jsonify, abort)
from flask_sqlalchemy import SQLAlchemy
from flask_login import (LoginManager, UserMixin, login_user,
                         login_required, logout_user, current_user)
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-change-in-prod')
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = (
    'sqlite:///' + os.path.join(basedir, 'instance', 'orbitlab.db')
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please sign in to continue.'

os.makedirs(os.path.join(basedir, 'instance'), exist_ok=True)

# ─────────────────────────────────────────────
#  Jinja filter
# ─────────────────────────────────────────────

@app.template_filter('from_json')
def from_json_filter(s):
    try:
        return json.loads(s)
    except Exception:
        return []

# ─────────────────────────────────────────────
#  Models
# ─────────────────────────────────────────────

class User(UserMixin, db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(80),  unique=True, nullable=False)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256))
    role          = db.Column(db.String(20), default='student')
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    simulations   = db.relationship('Simulation',  backref='author',  lazy=True, cascade='all, delete-orphan')
    submissions   = db.relationship('Submission',  backref='student', lazy=True, cascade='all, delete-orphan')

    @property
    def is_admin(self):   return self.role == 'admin'
    @property
    def is_teacher(self): return self.role in ('teacher', 'admin')

    def set_password(self, pw):   self.password_hash = generate_password_hash(pw)
    def check_password(self, pw): return check_password_hash(self.password_hash, pw)


class Simulation(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    title       = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)
    scenario    = db.Column(db.String(40), default='custom')
    config_json = db.Column(db.Text, nullable=False)
    is_public   = db.Column(db.Boolean, default=True)
    fork_count  = db.Column(db.Integer, default=0)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    user_id     = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)


class Assignment(db.Model):
    id           = db.Column(db.Integer, primary_key=True)
    title        = db.Column(db.String(160), nullable=False)
    description  = db.Column(db.Text, nullable=False)
    concept      = db.Column(db.String(80))
    scenario     = db.Column(db.String(40), default='custom')
    config_json  = db.Column(db.Text)
    questions    = db.Column(db.Text)
    learning_objectives = db.Column(db.Text)  # NEW: JSON list of objectives
    difficulty   = db.Column(db.String(20), default='beginner')  # NEW: beginner/intermediate/advanced
    due_date     = db.Column(db.DateTime)
    is_published = db.Column(db.Boolean, default=False)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    teacher_id   = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    teacher      = db.relationship('User', foreign_keys=[teacher_id])
    submissions  = db.relationship('Submission', backref='assignment', lazy=True, cascade='all, delete-orphan')


class Submission(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    config_json   = db.Column(db.Text)
    answers       = db.Column(db.Text)
    observations  = db.Column(db.Text)
    hypothesis    = db.Column(db.Text)   # NEW: student's hypothesis before running
    grade         = db.Column(db.String(10))
    feedback      = db.Column(db.Text)
    submitted_at  = db.Column(db.DateTime, default=datetime.utcnow)
    graded_at     = db.Column(db.DateTime)
    assignment_id = db.Column(db.Integer, db.ForeignKey('assignment.id'), nullable=False)
    student_id    = db.Column(db.Integer, db.ForeignKey('user.id'),     nullable=False)


@login_manager.user_loader
def load_user(uid):
    return User.query.get(int(uid))


# ─────────────────────────────────────────────
#  Demo Configs — carefully tuned scenarios
# ─────────────────────────────────────────────

DEMO_CONFIGS = {
    "solar_system": {
        "title": "Inner Solar System",
        "scenario": "nbody",
        "description": "Sun + four inner planets with realistic mass ratios and velocities. Watch how orbital periods scale with distance — Kepler's Third Law in action.",
        "difficulty": "beginner",
        "concepts": ["keplers_laws", "orbital_mechanics"],
        "learning_points": ["Orbital period grows with distance (T² ∝ a³)", "Inner planets move faster than outer ones", "The Sun barely moves — it's ~330,000× Earth's mass"],
        "G": 100, "softening": 0.5,
        "bodies": [
            {"name":"Sun",    "x":0,   "y":0,   "vx":0,    "vy":0,    "mass":1000,"color":"#FDB813","radius":18},
            {"name":"Mercury","x":80,  "y":0,   "vx":0,    "vy":35.4, "mass":1,   "color":"#B5B5B5","radius":3},
            {"name":"Venus",  "x":130, "y":0,   "vx":0,    "vy":27.8, "mass":4,   "color":"#E8C07A","radius":5},
            {"name":"Earth",  "x":180, "y":0,   "vx":0,    "vy":23.6, "mass":4,   "color":"#4FC3F7","radius":5},
            {"name":"Mars",   "x":240, "y":0,   "vx":0,    "vy":19.1, "mass":2,   "color":"#EF5350","radius":4},
        ]
    },
    "binary_star": {
        "title": "Binary Star System",
        "scenario": "2body",
        "description": "Two equal-mass stars in a stable mutual orbit around their shared center of mass (the barycenter). Over half of all star systems in the Milky Way are binary or multiple.",
        "difficulty": "beginner",
        "concepts": ["two_body"],
        "learning_points": ["Both stars orbit their common center of mass", "Equal masses → symmetric orbit", "Center of mass (barycenter) stays fixed"],
        "G": 100, "softening": 1.0,
        "bodies": [
            {"name":"Star A","x":-80,"y":0,"vx":0,"vy":-12,"mass":200,"color":"#FFD54F","radius":12},
            {"name":"Star B","x": 80,"y":0,"vx":0,"vy": 12,"mass":200,"color":"#FF7043","radius":12},
        ]
    },
    "unequal_binary": {
        "title": "Star + Planet System",
        "scenario": "2body",
        "description": "A massive star with a much lighter planet. The star barely moves — the planet does almost all the orbiting. This approximates our own Solar System.",
        "difficulty": "beginner",
        "concepts": ["two_body", "keplers_laws"],
        "learning_points": ["Heavy body barely moves", "Light body has a nearly circular orbit", "This is why we say 'planets orbit the Sun'"],
        "G": 100, "softening": 0.5,
        "bodies": [
            {"name":"Star",  "x":5,   "y":0,   "vx":0,  "vy":0.24, "mass":800,"color":"#FFD54F","radius":14},
            {"name":"Planet","x":-155,"y":0,   "vx":0,  "vy":-25,  "mass":2,  "color":"#4FC3F7","radius":5},
        ]
    },
    "figure_eight": {
        "title": "Figure-Eight Choreography",
        "scenario": "3body",
        "description": "The remarkable Chenciner–Montgomery solution (2000): three equal masses chasing each other along a figure-eight. Stable under small perturbations — one of only a handful of known periodic 3-body solutions.",
        "difficulty": "intermediate",
        "concepts": ["three_body"],
        "learning_points": ["One of few exact periodic solutions to the 3-body problem", "All three bodies follow the same figure-8 path", "Sensitive to initial conditions — try changing a velocity slightly"],
        "G": 100, "softening": 0.5,
        "bodies": [
            {"name":"α","x":-97.0,"y":24.3, "vx":9.324,  "vy": 8.647, "mass":100,"color":"#CE93D8","radius":8},
            {"name":"β","x": 97.0,"y":24.3, "vx":9.324,  "vy": 8.647, "mass":100,"color":"#80DEEA","radius":8},
            {"name":"γ","x":  0.0,"y":-48.6,"vx":-18.648,"vy":-17.295,"mass":100,"color":"#A5D6A7","radius":8},
        ]
    },
    "lagrange_trojan": {
        "title": "Lagrange L4/L5 Trojans",
        "scenario": "nbody",
        "description": "A planet shares its orbit with two smaller bodies trapped at the L4 and L5 Lagrange points — forming equilateral triangles with the star. Jupiter has over 7,000 Trojan asteroids this way.",
        "difficulty": "intermediate",
        "concepts": ["lagrange_points", "keplers_laws"],
        "learning_points": ["L4 and L5 are stable equilibria 60° ahead/behind the planet", "Trojan asteroids oscillate around these points (libration)", "The system must maintain a mass ratio: dominant body ≫ planet"],
        "G": 100, "softening": 0.5,
        "bodies": [
            {"name":"Star",      "x":0,   "y":0,      "vx":0,     "vy":0,    "mass":1000,"color":"#FDB813","radius":16},
            {"name":"Planet",    "x":180, "y":0,      "vx":0,     "vy":23.6, "mass":5,   "color":"#4FC3F7","radius":5},
            {"name":"Trojan L4", "x":90,  "y":155.88, "vx":-20.43,"vy":11.8, "mass":1,   "color":"#81C784","radius":4},
            {"name":"Trojan L5", "x":90,  "y":-155.88,"vx":20.43, "vy":11.8, "mass":1,   "color":"#FFB74D","radius":4},
        ]
    },
    "hyperbolic_flyby": {
        "title": "Gravitational Slingshot",
        "scenario": "2body",
        "description": "A lightweight probe approaches a massive planet on a hyperbolic trajectory. It gains kinetic energy from the planet's gravity well and escapes faster than it arrived — the same mechanism used by Voyager 1 & 2.",
        "difficulty": "beginner",
        "concepts": ["escape_velocity", "two_body"],
        "learning_points": ["Total energy is positive → hyperbolic (escape) orbit", "Probe gains speed from the planet's gravity", "The planet loses a tiny amount of momentum to the probe"],
        "G": 100, "softening": 0.5,
        "bodies": [
            {"name":"Planet","x":0,   "y":0,  "vx":0, "vy":0, "mass":500,"color":"#CE93D8","radius":12},
            {"name":"Probe", "x":-300,"y":-60,"vx":28,"vy":4, "mass":0.1,"color":"#80DEEA","radius":3},
        ]
    },
    "chaotic_three": {
        "title": "Chaotic 3-Body",
        "scenario": "3body",
        "description": "Three unequal masses with no special symmetry. Try recording the outcome, then change any position by just 1 unit — the trajectories will diverge completely. This sensitive dependence on initial conditions is the heart of chaos.",
        "difficulty": "advanced",
        "concepts": ["three_body"],
        "learning_points": ["No two runs with slightly different ICs produce the same trajectory", "Eventually one body is ejected — the system 'breaks apart'", "Unpredictability is a mathematical property, not a measurement limitation"],
        "G": 100, "softening": 0.5,
        "bodies": [
            {"name":"Heavy","x":-60,"y": 20,"vx": 5, "vy":-3, "mass":200,"color":"#EF5350","radius":10},
            {"name":"Mid",  "x": 60,"y":-20,"vx":-5, "vy": 3, "mass":100,"color":"#FFA726","radius":8},
            {"name":"Light","x":  0,"y": 80,"vx": 0, "vy":-8, "mass":50, "color":"#66BB6A","radius":6},
        ]
    },
    "hohmann_transfer": {
        "title": "Hohmann Transfer Orbit",
        "scenario": "nbody",
        "description": "The most fuel-efficient path between two circular orbits: two engine burns create an elliptical transfer orbit. Every mission from LEO to the Moon or Mars uses this technique.",
        "difficulty": "advanced",
        "concepts": ["hohmann", "vis_viva", "keplers_laws"],
        "learning_points": ["Transfer ellipse is tangent to both circular orbits", "Two burns needed: departure (periapsis) and arrival (apoapsis)", "Faster paths to Mars exist but cost more fuel (vis-viva tradeoff)"],
        "G": 100, "softening": 0.5,
        "bodies": [
            {"name":"Earth",    "x":0,   "y":0,   "vx":0,   "vy":0,   "mass":600, "color":"#4FC3F7","radius":10},
            {"name":"LEO Sat",  "x":100, "y":0,   "vx":0,   "vy":24.5,"mass":0.5, "color":"#A5D6A7","radius":3},
            {"name":"GEO Sat",  "x":265, "y":0,   "vx":0,   "vy":15.0,"mass":0.5, "color":"#FFB74D","radius":3},
        ]
    },
}

CONCEPT_WIKI_MAP = {
    "keplers_laws":     "Kepler%27s_laws_of_planetary_motion",
    "two_body":         "Two-body_problem",
    "three_body":       "Three-body_problem",
    "lagrange_points":  "Lagrange_point",
    "orbital_mechanics":"Orbital_mechanics",
    "escape_velocity":  "Escape_velocity",
    "hill_sphere":      "Hill_sphere",
    "tidal_locking":    "Tidal_locking",
    "hohmann":          "Hohmann_transfer_orbit",
    "vis_viva":         "Vis-viva_equation",
}


def fetch_wiki_summary(page_key):
    title = CONCEPT_WIKI_MAP.get(page_key)
    if not title:
        return None
    try:
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
        r = requests.get(url, timeout=5,
                         headers={"User-Agent": "OrbitLab/3.0 (educational)"})
        if r.status_code == 200:
            d = r.json()
            return {
                "title":   d.get("title", ""),
                "extract": d.get("extract", ""),
                "url":     d.get("content_urls", {}).get("desktop", {}).get("page", ""),
            }
    except Exception:
        pass
    return None


# ─────────────────────────────────────────────
#  Public routes
# ─────────────────────────────────────────────

@app.route('/')
def index():
    recent = (Simulation.query
              .filter_by(is_public=True)
              .order_by(Simulation.created_at.desc())
              .limit(3).all())
    published_assignments = Assignment.query.filter_by(is_published=True).count()
    return render_template('index.html', recent=recent,
                           demo_count=len(DEMO_CONFIGS),
                           published_assignments=published_assignments)


@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email    = request.form.get('email', '').strip()
        password = request.form.get('password', '')
        role     = request.form.get('role', 'student')
        if role not in ('student', 'teacher'):
            role = 'student'

        if User.query.filter_by(username=username).first():
            flash('Username already taken.')
            return redirect(url_for('register'))
        if User.query.filter_by(email=email).first():
            flash('Email already registered.')
            return redirect(url_for('register'))

        user = User(username=username, email=email, role=role)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        login_user(user)
        flash(f'Welcome to OrbitLab, {username}!')
        return redirect(url_for('dashboard'))
    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user, remember=True)
            nxt = request.args.get('next')
            return redirect(nxt or url_for('dashboard'))
        flash('Invalid username or password.')
    return render_template('login.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))


@app.route('/gallery')
def gallery():
    q    = request.args.get('q', '').strip()
    scen = request.args.get('scenario', '')
    sims = Simulation.query.filter_by(is_public=True)
    if q:
        sims = sims.filter(Simulation.title.ilike(f'%{q}%'))
    if scen:
        sims = sims.filter_by(scenario=scen)
    sims = sims.order_by(Simulation.created_at.desc()).all()
    return render_template('gallery.html', simulations=sims, q=q, scen=scen)


@app.route('/demos')
def demos():
    return render_template('demos.html', demos=DEMO_CONFIGS)


@app.route('/concepts')
def concepts():
    return render_template('concepts.html', concepts=CONCEPT_WIKI_MAP)


@app.route('/concepts/<key>')
def conceptDetail(key):
    if key not in CONCEPT_WIKI_MAP:
        abort(404)
    info = fetch_wiki_summary(key)
    # Find demos that match this concept
    related_demos = {k: v for k, v in DEMO_CONFIGS.items()
                     if key in v.get('concepts', [])}
    return render_template('conceptDetail.html', key=key, info=info,
                           related_demos=related_demos,
                           demo_configs=DEMO_CONFIGS)


# ─────────────────────────────────────────────
#  Sandbox
# ─────────────────────────────────────────────

@app.route('/sandbox')
def sandbox():
    sim_id        = request.args.get('id')
    demo_key      = request.args.get('demo')
    assignment_id = request.args.get('assignment')
    return render_template('sandbox.html',
                           sim_id=sim_id,
                           demo_key=demo_key,
                           assignment_id=assignment_id,
                           demo_configs=DEMO_CONFIGS)


# ─────────────────────────────────────────────
#  Dashboard
# ─────────────────────────────────────────────

@app.route('/dashboard')
@login_required
def dashboard():
    my_sims = (Simulation.query
               .filter_by(user_id=current_user.id)
               .order_by(Simulation.created_at.desc())
               .limit(6).all())

    if current_user.is_teacher:
        assignments = (Assignment.query
                       .filter_by(teacher_id=current_user.id)
                       .order_by(Assignment.created_at.desc()).all())
        pending_grades = (Submission.query
                          .join(Assignment)
                          .filter(Assignment.teacher_id == current_user.id,
                                  Submission.grade.is_(None)
                                  ).count())
        # Total submissions across all assignments
        total_subs = (Submission.query
                      .join(Assignment)
                      .filter(Assignment.teacher_id == current_user.id).count())
        return render_template('dashboardTeacher.html',
                               my_sims=my_sims,
                               assignments=assignments,
                               pending_grades=pending_grades,
                               total_subs=total_subs)
    else:
        open_assignments = (Assignment.query
                            .filter_by(is_published=True)
                            .order_by(Assignment.created_at.desc()).all())
        my_submissions = {s.assignment_id: s for s in current_user.submissions}
        graded_count = sum(1 for s in current_user.submissions if s.grade)
        return render_template('dashboardStudent.html',
                               my_sims=my_sims,
                               open_assignments=open_assignments,
                               my_submissions=my_submissions,
                               graded_count=graded_count)


# ─────────────────────────────────────────────
#  Assignments — teacher CRUD
# ─────────────────────────────────────────────

@app.route('/assignments/new', methods=['GET', 'POST'])
@login_required
def newAssignment():
    if not current_user.is_teacher:
        abort(403)
    if request.method == 'POST':
        questions_raw = request.form.get('questions', '')
        questions = [q.strip() for q in questions_raw.strip().splitlines() if q.strip()]
        objectives_raw = request.form.get('learning_objectives', '')
        objectives = [o.strip() for o in objectives_raw.strip().splitlines() if o.strip()]
        due_raw  = request.form.get('due_date', '')
        due_date = datetime.strptime(due_raw, '%Y-%m-%d') if due_raw else None

        a = Assignment(
            title        = request.form.get('title', 'Untitled Assignment'),
            description  = request.form.get('description', ''),
            concept      = request.form.get('concept', ''),
            scenario     = request.form.get('scenario', 'custom'),
            difficulty   = request.form.get('difficulty', 'beginner'),
            config_json  = request.form.get('config_json') or None,
            questions    = json.dumps(questions),
            learning_objectives = json.dumps(objectives),
            due_date     = due_date,
            is_published = 'publish' in request.form,
            teacher_id   = current_user.id,
        )
        db.session.add(a)
        db.session.commit()
        flash('Assignment created successfully.')
        return redirect(url_for('assignmentDetail', aid=a.id))
    demo_configs_json = json.dumps({k: v for k, v in DEMO_CONFIGS.items()})
    return render_template('assignmentForm.html',
                           assignment=None,
                           demo_configs_json=demo_configs_json,
                           concepts=CONCEPT_WIKI_MAP)


@app.route('/assignments/<int:aid>')
@login_required
def assignmentDetail(aid):
    a = Assignment.query.get_or_404(aid)
    if not a.is_published and a.teacher_id != current_user.id and not current_user.is_admin:
        abort(403)
    questions = json.loads(a.questions) if a.questions else []
    objectives = json.loads(a.learning_objectives) if a.learning_objectives else []
    my_sub = None
    if not current_user.is_teacher:
        my_sub = Submission.query.filter_by(
            assignment_id=aid, student_id=current_user.id).first()
    subs = []
    if current_user.is_teacher or current_user.is_admin:
        subs = (Submission.query.filter_by(assignment_id=aid)
                .order_by(Submission.submitted_at.desc()).all())
    return render_template('assignmentDetail.html',
                           assignment=a, questions=questions,
                           objectives=objectives,
                           my_sub=my_sub, subs=subs)


@app.route('/assignments/<int:aid>/edit', methods=['GET', 'POST'])
@login_required
def editAssignment(aid):
    a = Assignment.query.get_or_404(aid)
    if a.teacher_id != current_user.id and not current_user.is_admin:
        abort(403)
    if request.method == 'POST':
        a.title       = request.form.get('title', a.title)
        a.description = request.form.get('description', a.description)
        a.concept     = request.form.get('concept', a.concept)
        a.scenario    = request.form.get('scenario', a.scenario)
        a.difficulty  = request.form.get('difficulty', a.difficulty or 'beginner')
        questions_raw = request.form.get('questions', '')
        a.questions   = json.dumps([q.strip() for q in questions_raw.splitlines() if q.strip()])
        objectives_raw = request.form.get('learning_objectives', '')
        a.learning_objectives = json.dumps([o.strip() for o in objectives_raw.splitlines() if o.strip()])
        a.is_published = 'publish' in request.form
        due_raw = request.form.get('due_date', '')
        a.due_date = datetime.strptime(due_raw, '%Y-%m-%d') if due_raw else None
        cfg = request.form.get('config_json', '').strip()
        a.config_json = cfg if cfg else None
        db.session.commit()
        flash('Assignment updated.')
        return redirect(url_for('assignmentDetail', aid=aid))
    questions_text = '\n'.join(json.loads(a.questions)) if a.questions else ''
    objectives_text = '\n'.join(json.loads(a.learning_objectives)) if a.learning_objectives else ''
    demo_configs_json = json.dumps({k: v for k, v in DEMO_CONFIGS.items()})
    return render_template('assignmentForm.html',
                           assignment=a,
                           questions_text=questions_text,
                           objectives_text=objectives_text,
                           demo_configs_json=demo_configs_json,
                           concepts=CONCEPT_WIKI_MAP)


@app.route('/assignments/<int:aid>/delete', methods=['POST'])
@login_required
def deleteAssignment(aid):
    a = Assignment.query.get_or_404(aid)
    if a.teacher_id != current_user.id and not current_user.is_admin:
        abort(403)
    db.session.delete(a)
    db.session.commit()
    flash('Assignment deleted.')
    return redirect(url_for('dashboard'))


# ─────────────────────────────────────────────
#  Submissions — student flow
# ─────────────────────────────────────────────

@app.route('/assignments/<int:aid>/submit', methods=['GET', 'POST'])
@login_required
def submitAssignment(aid):
    if current_user.is_teacher:
        abort(403)
    a = Assignment.query.get_or_404(aid)
    if not a.is_published:
        abort(403)
    existing = Submission.query.filter_by(
        assignment_id=aid, student_id=current_user.id).first()
    questions = json.loads(a.questions) if a.questions else []
    objectives = json.loads(a.learning_objectives) if a.learning_objectives else []

    if request.method == 'POST':
        answers = [request.form.get(f'answer_{i}', '') for i in range(len(questions))]
        config  = request.form.get('config_json', '')
        obs     = request.form.get('observations', '')
        hypo    = request.form.get('hypothesis', '')

        if existing:
            existing.answers      = json.dumps(answers)
            existing.config_json  = config
            existing.observations = obs
            existing.hypothesis   = hypo
            existing.submitted_at = datetime.utcnow()
            flash('Submission updated successfully.')
        else:
            sub = Submission(
                assignment_id = aid,
                student_id    = current_user.id,
                answers       = json.dumps(answers),
                config_json   = config,
                observations  = obs,
                hypothesis    = hypo,
            )
            db.session.add(sub)
            flash('Assignment submitted! Your teacher will review it soon.')
        db.session.commit()
        return redirect(url_for('assignmentDetail', aid=aid))

    starter_config = a.config_json
    return render_template('submitAssignment.html',
                           assignment=a,
                           questions=questions,
                           objectives=objectives,
                           existing=existing,
                           starter_config=starter_config,
                           demo_configs=DEMO_CONFIGS)


@app.route('/submissions/<int:sid>/grade', methods=['GET', 'POST'])
@login_required
def gradeSubmission(sid):
    sub = Submission.query.get_or_404(sid)
    if sub.assignment.teacher_id != current_user.id and not current_user.is_admin:
        abort(403)
    if request.method == 'POST':
        sub.grade     = request.form.get('grade', '')
        sub.feedback  = request.form.get('feedback', '')
        sub.graded_at = datetime.utcnow()
        db.session.commit()
        flash(f'Grade saved for {sub.student.username}.')
        return redirect(url_for('assignmentDetail', aid=sub.assignment_id))
    questions = json.loads(sub.assignment.questions) if sub.assignment.questions else []
    answers   = json.loads(sub.answers) if sub.answers else []
    qa = list(zip(questions, answers + [''] * len(questions)))
    return render_template('gradeSubmission.html', sub=sub, qa=qa)


# ─────────────────────────────────────────────
#  API
# ─────────────────────────────────────────────

@app.route('/api/simulations', methods=['POST'])
@login_required
def api_save_simulation():
    data    = request.get_json(force=True)
    sim_id  = data.get('id')

    if sim_id:
        sim = Simulation.query.get_or_404(sim_id)
        if sim.user_id != current_user.id:
            abort(403)
        sim.title       = data.get('title', sim.title)
        sim.description = data.get('description', sim.description)
        sim.config_json = json.dumps(data.get('config', {}))
        sim.is_public   = data.get('is_public', sim.is_public)
        sim.scenario    = data.get('scenario', sim.scenario)
        db.session.commit()
        return jsonify({'status': 'updated', 'id': sim.id})

    sim = Simulation(
        title       = data.get('title', 'Untitled System'),
        description = data.get('description', ''),
        scenario    = data.get('scenario', 'custom'),
        config_json = json.dumps(data.get('config', {})),
        is_public   = data.get('is_public', True),
        user_id     = current_user.id,
    )
    db.session.add(sim)
    db.session.commit()
    return jsonify({'status': 'created', 'id': sim.id})


@app.route('/api/simulations/<int:sim_id>')
def api_get_simulation(sim_id):
    sim = Simulation.query.get_or_404(sim_id)
    if not sim.is_public and (
            not current_user.is_authenticated or
            current_user.id != sim.user_id):
        abort(403)
    return jsonify({
        'id':          sim.id,
        'title':       sim.title,
        'description': sim.description,
        'scenario':    sim.scenario,
        'config':      json.loads(sim.config_json),
        'author':      sim.author.username,
    })


@app.route('/api/demos/<key>')
def api_get_demo(key):
    if key not in DEMO_CONFIGS:
        abort(404)
    d = DEMO_CONFIGS[key]
    return jsonify({'title': d['title'], 'scenario': d['scenario'],
                    'description': d['description'],
                    'config': {'G': d['G'], 'softening': d['softening'],
                               'bodies': d['bodies']}})


@app.route('/api/simulations/<int:sim_id>/fork', methods=['POST'])
@login_required
def fork_simulation(sim_id):
    orig = Simulation.query.get_or_404(sim_id)
    if not orig.is_public:
        abort(403)
    fork = Simulation(
        title       = f"{orig.title} (fork)",
        description = orig.description,
        scenario    = orig.scenario,
        config_json = orig.config_json,
        is_public   = False,
        user_id     = current_user.id,
    )
    orig.fork_count += 1
    db.session.add(fork)
    db.session.commit()
    return jsonify({'id': fork.id})


@app.route('/api/concept/<key>')
def api_concept(key):
    data = fetch_wiki_summary(key)
    if not data:
        return jsonify({'error': 'not found'}), 404
    return jsonify(data)


@app.route('/api/simulations/<int:sim_id>/delete', methods=['POST'])
@login_required
def api_delete_simulation(sim_id):
    sim = Simulation.query.get_or_404(sim_id)
    if sim.user_id != current_user.id and not current_user.is_admin:
        abort(403)
    db.session.delete(sim)
    db.session.commit()
    return jsonify({'status': 'deleted'})


# ─────────────────────────────────────────────
#  Admin
# ─────────────────────────────────────────────

@app.route('/admin')
@login_required
def admin():
    if not current_user.is_admin:
        abort(403)
    users     = User.query.order_by(User.created_at.desc()).all()
    sims      = Simulation.query.order_by(Simulation.created_at.desc()).limit(20).all()
    ass_count = Assignment.query.count()
    sub_count = Submission.query.count()
    pending   = Submission.query.filter(Submission.grade.is_(None)).count()
    return render_template('admin.html',
                           users=users, sims=sims,
                           ass_count=ass_count,
                           sub_count=sub_count,
                           pending=pending)


@app.route('/admin/promote/<int:uid>', methods=['POST'])
@login_required
def promote_user(uid):
    if not current_user.is_admin:
        abort(403)
    u = User.query.get_or_404(uid)
    new_role = request.form.get('role', 'student')
    if new_role in ('student', 'teacher', 'admin'):
        u.role = new_role
        db.session.commit()
        flash(f'{u.username} is now a {new_role}.')
    return redirect(url_for('admin'))


# ─────────────────────────────────────────────
#  Seed data
# ─────────────────────────────────────────────

def seed_db():
    if not User.query.filter_by(username='admin').first():
        admin_u = User(username='admin', email='admin@orbitlab.space', role='admin')
        admin_u.set_password('admin123')
        db.session.add(admin_u)

    if not User.query.filter_by(username='professor').first():
        teacher = User(username='professor', email='teacher@orbitlab.space', role='teacher')
        teacher.set_password('teach123')
        db.session.add(teacher)
        db.session.flush()

        assignments_to_create = [
            Assignment(
                title        = "Kepler's Second Law — Equal Areas",
                description  = (
                    "Load the Inner Solar System demo and watch it run for several orbits. "
                    "Kepler's Second Law states that a planet sweeps equal areas in equal times — "
                    "meaning it moves faster when close to the Sun and slower when far away.\n\n"
                    "Your task: observe and measure this effect. Count how many 'steps' Earth takes "
                    "per orbit when closest to the Sun vs. when farthest. Do the same for Mercury and Mars."
                ),
                concept      = "keplers_laws",
                scenario     = "nbody",
                difficulty   = "beginner",
                config_json  = json.dumps({
                    'G': 100, 'softening': 0.5,
                    'bodies': DEMO_CONFIGS['solar_system']['bodies']
                }),
                learning_objectives = json.dumps([
                    "Observe that planets move faster at perihelion (closest approach)",
                    "Understand that Kepler's Second Law is equivalent to conservation of angular momentum",
                    "Predict orbital speed from position using qualitative reasoning",
                ]),
                questions    = json.dumps([
                    "Describe what happens to Earth's speed as it approaches the Sun. Where is it fastest? Slowest?",
                    "Compare the trail lengths of Mercury and Mars at similar orbital phases. What does this tell you?",
                    "If you doubled the Sun's mass, how would Earth's orbital period change, and why?",
                    "Kepler's Second Law is equivalent to conservation of angular momentum. Can you explain why?",
                ]),
                is_published = True,
                teacher_id   = teacher.id,
            ),
            Assignment(
                title        = "3-Body Chaos — Sensitivity to Initial Conditions",
                description  = (
                    "Load the 'Chaotic 3-Body' demo. Let it run for about 30 seconds and sketch or describe "
                    "roughly what happens to each body.\n\n"
                    "Then reload the page, change the x-position of 'Heavy' from -60 to -61 (just 1 unit), "
                    "and run again. Compare the two outcomes.\n\n"
                    "This is the essence of deterministic chaos: the equations are perfectly deterministic, "
                    "but tiny differences in starting conditions produce completely different trajectories."
                ),
                concept      = "three_body",
                scenario     = "3body",
                difficulty   = "intermediate",
                config_json  = json.dumps({
                    'G': 100, 'softening': 0.5,
                    'bodies': DEMO_CONFIGS['chaotic_three']['bodies']
                }),
                learning_objectives = json.dumps([
                    "Experience sensitive dependence on initial conditions (SDIC)",
                    "Distinguish deterministic chaos from randomness",
                    "Understand why the 3-body problem has no closed-form solution",
                ]),
                questions    = json.dumps([
                    "Describe the trajectory of each body in your first run. Which body escapes first?",
                    "After changing a starting position by 1 unit, how quickly does the new trajectory diverge from the original?",
                    "Is the motion random, or could it in principle be predicted with perfect measurements? Explain.",
                    "The figure-eight scenario is also a 3-body system but is stable. What makes it different from the chaotic case?",
                ]),
                is_published = True,
                teacher_id   = teacher.id,
            ),
            Assignment(
                title        = "Design a Stable Binary Star with a Planet",
                description  = (
                    "Your goal is to design a stable 3-body system: two equal-mass stars orbiting "
                    "each other, plus a planet that orbits both stars together (a circumbinary orbit).\n\n"
                    "Start from the Binary Star demo. Add a third body (the planet) far enough from the "
                    "binary center that it 'sees' both stars as a single combined mass. Set its velocity "
                    "so it orbits stably.\n\n"
                    "This is actually how Tatooine (and the real exoplanet Kepler-16b) works!"
                ),
                concept      = "two_body",
                scenario     = "3body",
                difficulty   = "advanced",
                config_json  = json.dumps({
                    'G': 100, 'softening': 1.0,
                    'bodies': DEMO_CONFIGS['binary_star']['bodies']
                }),
                learning_objectives = json.dumps([
                    "Apply two-body orbital mechanics to design a stable configuration",
                    "Understand the concept of a circumbinary orbit",
                    "Discover the stability limit for circumbinary planets",
                ]),
                questions    = json.dumps([
                    "Paste the final body configuration you found that produces a stable orbit.",
                    "How far from the binary center did the planet need to be before its orbit was stable?",
                    "What happened when you placed the planet too close to the stars?",
                    "Does the planet's orbital period obey Kepler's Third Law? Calculate the expected period and compare.",
                ]),
                is_published = True,
                teacher_id   = teacher.id,
            ),
        ]
        for a in assignments_to_create:
            db.session.add(a)

    db.session.commit()


with app.app_context():
    db.create_all()
    seed_db()


if __name__ == '__main__':
    app.run(debug=True, port=5000)
