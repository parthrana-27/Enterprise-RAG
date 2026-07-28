# Enterprise Knowledge Assistant (Enterprise-RAG)

Enterprise-RAG is a full-stack Retrieval-Augmented Generation (RAG) application. It allows users to upload documents, embed them into a vector database, and chat with an LLM that retrieves context from those documents to answer questions. 

It is designed with enterprise features in mind, specifically role-based access control with three primary roles: Admin, Manager, and Employee.

## 🏗️ Architecture

The project is divided into three main components:

1. **Backend:** Built with Python and **FastAPI**. It handles the API routes, database connections, document processing (chunking/embedding), and LLM interactions.
2. **Frontend:** Built with **Next.js** (React) and TypeScript using the App Router (`src/app`). It provides the user interface for chatting, uploading documents, and admin management.
3. **Infrastructure:** Uses **Docker Compose** to run a **PostgreSQL** database (equipped with the `pgvector` extension for storing vector embeddings) and **Redis** (for caching or background tasks).

## 📂 Project Structure

### Backend (`/backend/app/`)
The backend is modular and organized by domain/feature:
* `main.py`: The entry point for the FastAPI server. Initializes the DB, enables the `pgvector` extension, and seeds default users.
* `core/`: Core configurations (environment variables, database engine, LLM integrations).
* `models/` & `schemas/`: SQLAlchemy ORM definitions for tables and Pydantic models for API validation.
* `services/`: Isolated domains containing business logic:
  * `auth`: User login, JWT token generation, and password hashing.
  * `document`: File uploads, text extraction, and generating vector embeddings.
  * `retrieval`: Logic for searching the `pgvector` database to find relevant document chunks.
  * `chat`: Endpoints for the user chat interface, combining retrieval with LLM generation.
  * `admin`: Endpoints restricted to administrators.
  * `evaluation`: Logic to evaluate the quality of LLM responses.

### Frontend (`/frontend/src/app/`)
The frontend is a standard Next.js application:
* `/login`: The authentication page.
* `/chat`: The main conversational interface where users interact with the RAG system.
* `/documents`: A page to view and upload knowledge base files.
* `/admin`: A dashboard for administrative tasks.

## 🚀 Getting Started

### Prerequisites
* Docker Desktop installed and running.
* Python 3.9+
* Node.js and npm/yarn

### Starting the Services

**1. Run the Backend and Infrastructure:**
The project includes a convenient orchestration script at the root level called `run.py`. This script automates the backend setup.

```bash
python run.py
```
What this script does:
* Spins up the necessary infrastructure (Postgres and Redis) via `docker-compose`.
* Verifies that you have the required Python dependencies installed.
* Starts the FastAPI server locally on `http://localhost:8000`.

*Note: The system automatically seeds three default users on startup: `admin`, `manager`, and `employee` with default passwords (`admin123`, `manager123`, `employee123`).*

**2. Run the Frontend:**
Open a new terminal window, navigate to the frontend directory, install dependencies, and start the development server.

```bash
cd frontend
npm install
npm run dev
```
The frontend will be available at `http://localhost:3000`.
