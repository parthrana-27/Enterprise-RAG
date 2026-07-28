# Enterprise Knowledge Assistant (Enterprise-RAG)

> A **production-grade, multi-agent Retrieval-Augmented Generation (RAG)** platform built for enterprise use. It enables employees to securely query internal documents via a conversational AI interface, with role-based access control, hybrid search, streaming LLM responses, and automated evaluation metrics.

---

## 🎯 Problem Statement

Enterprise teams struggle to find accurate information spread across hundreds of internal PDFs, Word documents, spreadsheets, and presentations. Generic LLMs hallucinate or lack company-specific knowledge. **Enterprise-RAG** solves this by grounding every LLM response in verified, role-filtered internal documents — eliminating hallucination and ensuring only authorized users see sensitive content.

---

## 🏗️ System Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER CLIENT                           │
│                   Next.js (TypeScript + Tailwind)               │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / SSE (streaming)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASTAPI MONOLITH                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │   auth   │  │ document │  │ retrieval│  │     chat      │  │
│  │ (JWT/RBAC│  │(ingestion│  │(hybrid   │  │(multi-agent   │  │
│  │  router) │  │ pipeline)│  │  search) │  │ reasoning)    │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘  │
│  ┌──────────┐  ┌────────────────────────────────────────────┐  │
│  │  admin   │  │           evaluation router                │  │
│  │ (telemetry│  │(precision, recall, faithfulness scoring)   │  │
│  │  & audit)│  └────────────────────────────────────────────┘  │
│  └──────────┘                                                   │
└───────────────────────┬─────────────────────────────────────────┘
                        │
           ┌────────────┴────────────┐
           ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐
│  PostgreSQL + pgvector│   │        Redis        │
│  (Documents, Users,  │   │  (Caching / Sessions│
│   Embeddings, Chunks)│   │   / Task queues)    │
└─────────────────────┘   └─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  LLM Provider(s)    │
│  OpenAI / Gemini    │
│  (Fallback: offline │
│   text simulator)   │
└─────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Backend framework | FastAPI (monolith) | Low overhead, async-native, auto-generates OpenAPI docs |
| Database | PostgreSQL + pgvector | Single DB for relational data AND vector similarity — avoids running a separate vector DB like Pinecone |
| Search strategy | Hybrid (BM25 + Vector) | BM25 handles keyword-exact matches; Vector handles semantic/conceptual matches |
| File ingestion | FastAPI BackgroundTasks | No heavyweight queue (Celery/Kafka) needed for MVP scale |
| Auth strategy | JWT (stateless) | Stateless tokens scale horizontally without shared session stores |
| LLM response | Server-Sent Events (SSE) | Enables real-time token streaming to the browser without WebSockets overhead |
| Frontend | Next.js App Router | React Server Components, file-based routing, edge-ready |

---

## 📂 Project Structure

```text
enterprise-rag/
├── backend/
│   ├── app/
│   │   ├── main.py                  # App entry point: mounts all routers, DB seeds, pgvector init
│   │   ├── core/
│   │   │   ├── config.py            # Pydantic settings (reads .env / env vars)
│   │   │   ├── database.py          # SQLAlchemy engine + SessionLocal factory
│   │   │   ├── llm.py               # LLM client factory (OpenAI / Gemini / offline fallback)
│   │   │   └── embeddings.py        # Sentence-Transformers embedding model loader
│   │   ├── models/
│   │   │   └── models.py            # SQLAlchemy ORM: User, Document, DocumentChunk tables
│   │   ├── schemas/
│   │   │   └── schemas.py           # Pydantic request/response validation schemas
│   │   └── services/
│   │       ├── auth/
│   │       │   └── router.py        # Login, JWT creation, password hashing (bcrypt), RBAC deps
│   │       ├── document/
│   │       │   └── router.py        # Upload, extract text, chunk, embed, store in pgvector
│   │       ├── retrieval/
│   │       │   └── router.py        # Hybrid BM25 + pgvector search with RBAC filtering
│   │       ├── chat/
│   │       │   └── router.py        # Multi-agent loop, SSE streaming, citations
│   │       ├── evaluation/
│   │       │   └── router.py        # Context Precision, Recall, Faithfulness scoring
│   │       └── admin/
│   │           └── router.py        # Audit logs, telemetry, user management
│   ├── Dockerfile                   # Production Docker image for backend
│   └── requirements.txt             # Python dependencies
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── login/               # Authentication page
│       │   ├── chat/                # Main chat interface (SSE consumer)
│       │   ├── documents/           # Document upload and management UI
│       │   └── admin/               # Admin dashboard
│       └── components/
│           └── DashboardShell.tsx   # Shared navigation/layout wrapper
├── infrastructure/
│   └── docker-compose.yml           # PostgreSQL (pgvector) + Redis containers
├── tests/
│   └── test_rag.py                  # pytest suite: password, RBAC, text splitting, score normalization
├── run.py                           # One-command local runner (starts DB + backend)
├── render.yaml                      # Render.com cloud deployment config
└── README.md
```

---

## ⚙️ Core Algorithms

### 1. Document Ingestion Pipeline
```
File Upload (.pdf / .docx / .xlsx / .pptx / .txt / .md)
        │
        ▼
Text Extraction (PyMuPDF for PDF, python-docx for Word, etc.)
        │
        ▼
Text Chunking (sliding window with overlap)
        │
        ▼
Embedding Generation (sentence-transformers/all-MiniLM-L6-v2 → 384-dim float vector)
        │
        ▼
Store in PostgreSQL (DocumentChunk table with pgvector column)
```
Processing runs as a **FastAPI BackgroundTask**, so the upload endpoint returns immediately (`202 Accepted`) and the status is polled by the frontend.

### 2. Hybrid Search (Retrieval)
Two parallel searches, combined with a weighted fusion formula:

```
User Query
    │
    ├──► Full-Text Search  (PostgreSQL tsvector / BM25 approximation)  → raw BM25 scores
    │
    └──► Vector Search     (pgvector <=> cosine similarity)            → raw cosine scores
                │
                ▼
        Normalize each score to [0, 1]
                │
                ▼
        Final Score = 0.4 × BM25_norm + 0.6 × Vector_norm
                │
                ▼
        RBAC Filter:
          Employee  → public docs only
          Manager   → own-department docs + public
          Admin     → all docs
                │
                ▼
        Return top-K ranked chunks
```

### 3. Multi-Agent Reasoning Loop (Chat)
```
User Message
     │
     ▼
[1] Query Agent       → Is the query complete enough? If not → Clarification
     │
     ▼
[2] Retrieval Agent   → Calls Retrieval Module, gets top chunks
     │
     ▼
[3] Reranker Agent    → Filters low-confidence chunks
     │
     ▼
[4] Response Agent    → Streams answer via SSE (token-by-token)
     │
     ▼
[5] Citation Formatter → Maps answer sentences to source doc + page
     │
     ▼
[6] Evaluation Agent  → Computes Precision, Recall, Faithfulness
     │
     ▼
Return to Client (streamed JSON events)
```

### 4. RBAC (Role-Based Access Control)
Three roles form a strict access hierarchy:

| Role | Document Access | Upload | Admin Tools |
|---|---|---|---|
| `employee` | Public docs only | ❌ | ❌ |
| `manager` | Public + own department | ✅ | ❌ |
| `admin` | All documents | ✅ | ✅ |

Every API endpoint uses a FastAPI `Depends()` guard that decodes the JWT, extracts the role, and enforces the policy before any DB query runs.

---

## 🔑 Default Seed Credentials

The database auto-seeds these users on first startup:

| Username | Password | Role |
| :--- | :--- | :--- |
| `admin` | `admin123` | Admin |
| `manager` | `manager123` | Manager |
| `employee` | `employee123` | Employee |

---

## 🚀 Local Developer Quickstart

### Prerequisites
- Docker Desktop (running)
- Python 3.9+
- Node.js 18+ & npm

### Option A: One-Command Start
```bash
python run.py
```
This single command: starts PostgreSQL + Redis via Docker Compose, waits for DB to initialize, then launches the FastAPI server on `http://localhost:8000`.

### Option B: Manual Start
```bash
# 1. Start infrastructure
docker compose -f infrastructure/docker-compose.yml up -d db redis

# 2. Install Python dependencies
pip install -r backend/requirements.txt

# 3. Start FastAPI backend
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to log in and start chatting!

---

## ✅ Verification

### Backend Tests (100% pass)
```bash
$env:PYTHONPATH="d:\Enterprise-RAG\backend"; pytest tests/
============================= test session starts =============================
platform win32 -- Python 3.13.1, pytest-9.0.2, pluggy-1.6.0
collected 5 items

tests\test_rag.py .....                                                  [100%]
======================== 5 passed, 9 warnings in 1.21s ========================
```

### Frontend Build
```bash
npm run build
▲ Next.js 16.2.9 (Turbopack)
✓ Compiled successfully in 3.1s
Route (app)
┌ ○ /
├ ○ /admin
├ ○ /chat
├ ○ /documents
└ ○ /login
```

---

## 🌐 Deployment
The `render.yaml` at the root configures a [Render.com](https://render.com) deployment:
- Backend runs as a **Docker web service** exposed on port `8000`.
- Environment variables (`DATABASE_URL`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `SECRET_KEY`) are injected at runtime via the Render dashboard.

---

## 🛠️ Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, Uvicorn |
| Database | PostgreSQL 15 + pgvector extension |
| Cache | Redis |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2, 384-dim) |
| LLM | OpenAI GPT / Google Gemini (configurable) |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| ORM | SQLAlchemy |
| Validation | Pydantic v2 |
| Testing | pytest |
| Containerization | Docker + Docker Compose |
| Deployment | Render.com (via render.yaml) |
