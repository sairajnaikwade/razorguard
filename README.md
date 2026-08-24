# RazorGuard

RazorGuard is an AI-powered payment fraud detection and investigation platform built for the **Razorpay AI Buildathon — Track 02**.

Phase 1 provides the operational foundation: authentication, role-based access control, health monitoring, database migrations, Docker orchestration, and a React dashboard shell. ML training, fraud scoring APIs, and analyst workflows are planned for later phases.

## Current Project Status

| Phase | Scope | Status |
|-------|--------|--------|
| **Phase 1** | Foundation (API, auth, RBAC, DB, Docker, frontend shell) | Complete (hardened) |
| **Phase 2** | Data pipeline + ML model training | Planned |
| **Phase 3+** | Fraud APIs, dashboards, investigation UI, AI agent | Planned |

## Architecture

```
Browser
  └── Frontend (React + Vite + nginx)
        └── /api/*  ──proxy──▶  Backend (FastAPI)
                                    ├── PostgreSQL
                                    └── Redis
```

- **Backend:** FastAPI, SQLAlchemy (async), Alembic, JWT + Argon2, RBAC
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Zustand
- **Data:** PostgreSQL for persistence; Redis for health/connectivity (Phase 2+ usage)
- **ML:** Scaffolding in `ml/` (not trained in Phase 1)

## Technology Stack

| Layer | Technologies |
|-------|--------------|
| API | FastAPI, Uvicorn, Pydantic |
| Database | PostgreSQL 15, SQLAlchemy 2, Alembic |
| Cache | Redis 7 |
| Auth | JWT (python-jose), Argon2 (pwdlib) |
| Frontend | React, Vite, TypeScript, Tailwind, Axios |
| ML (Phase 2) | pandas, numpy, scikit-learn, joblib, matplotlib |
| Containers | Docker Compose |

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker Desktop (for full stack)
- PostgreSQL and Redis (via Docker Compose or local install)

### 1. Environment configuration

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

- `JWT_SECRET_KEY` — generate with:  
  `python -c "import secrets; print(secrets.token_urlsafe(64))"`
- `ADMIN_PASSWORD` — local admin password (hashed on first seed)
- Database and Redis URLs if not using defaults

Never commit `.env`. It is listed in `.gitignore`.

### 2. Backend setup

```bash
cd backend
python -m venv venv
# Windows
.\venv\Scripts\pip install -r requirements.txt
# macOS/Linux
# source venv/bin/activate && pip install -r requirements.txt

# Run migrations (PostgreSQL must be running)
.\venv\Scripts\alembic upgrade head

# Seed default admin user (idempotent — skips if admin exists)
.\venv\Scripts\python app/db/init_db.py

# Start API
.\venv\Scripts\uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Dev server: http://localhost:5173 (proxies `/api` to backend on port 8000)

### 4. Docker setup

From the project root:

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost:8000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

In Docker, the frontend nginx container proxies `/api/*` to the backend service. The browser uses relative `/api` URLs — no hardcoded backend host in client code.

### 5. ML dependencies (Phase 2 prep)

ML scripts use packages declared in:

- `ml/requirements.txt` — standalone ML environment
- `backend/requirements.txt` — same deps for backend/Docker parity

Install for standalone ML work:

```bash
pip install -r ml/requirements.txt
```

Do not run training until Phase 2 is approved.

## Test Commands

```bash
# Backend (from project root)
npm run test:backend

# Or directly
cd backend && python -m pytest tests/ -v

# Frontend build
cd frontend && npm run build
```

## Phase 1 API Endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/auth/login` | Public | Login, returns JWT |
| GET | `/api/auth/me` | Authenticated | Current user profile |
| GET | `/api/system/health` | Public | DB + Redis health |
| GET | `/api/admin/users` | ADMIN | List users |
| GET | `/api/admin/stats` | ADMIN | Admin statistics |
| GET | `/api/analyst/overview` | ADMIN, ANALYST | Analyst workspace stub |
| GET | `/api/system/info` | All roles | Read-only system info |

### RBAC Roles

| Role | Permissions |
|------|-------------|
| **ADMIN** | Full administrative access |
| **ANALYST** | Analyst-level access (no admin routes) |
| **VIEWER** | Read-only access |

## Phase 2 Planned Scope

Phase 2 (Data + ML) will add:

- Transaction data ingestion aligned with the ML schema
- Feature engineering pipeline (`ml/features.py`)
- Model training and evaluation (`ml/train.py`, `ml/evaluate.py`)
- Alembic migrations extending the `transactions` table
- Fraud scoring integration (later phase)

No ML performance claims are made at this stage.

## Project Structure

```
backend/          FastAPI application, Alembic, tests
frontend/         React UI
ml/               ML pipeline scaffolding (Phase 2)
data/             Demo transaction dataset
docker/           Dockerfiles
scripts/          Utility scripts (e.g. demo data generation)
docker-compose.yml
.env.example
```

## License

Private — Razorpay AI Buildathon project.
