import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.models.models import Base, User
from app.services.auth.router import get_password_hash

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

# Initialize database tables
def initialize_db():
    logger.info("Initializing database...")
    try:
        # Run DB extension activation
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
            logger.info("pgvector extension initialized.")
    except Exception as e:
        logger.warning(f"Could not initialize pgvector extension: {e}. Check if database is running and user has superuser privileges.")

    # Create tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified.")

    # Seed Initial Users
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        # 1. Check/Seed Admin
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            db_admin = User(
                username="admin",
                password_hash=get_password_hash("admin123"),
                role=settings.ROLE_ADMIN,
                department="IT"
            )
            db.add(db_admin)
            logger.info("Seed: Created Admin user (username: admin, password: admin123)")
            
        # 2. Check/Seed Manager
        manager = db.query(User).filter(User.username == "manager").first()
        if not manager:
            db_manager = User(
                username="manager",
                password_hash=get_password_hash("manager123"),
                role=settings.ROLE_MANAGER,
                department="HR"
            )
            db.add(db_manager)
            logger.info("Seed: Created Manager user (username: manager, password: manager123)")

        # 3. Check/Seed Employee
        employee = db.query(User).filter(User.username == "employee").first()
        if not employee:
            db_employee = User(
                username="employee",
                password_hash=get_password_hash("employee123"),
                role=settings.ROLE_EMPLOYEE,
                department="HR"
            )
            db.add(db_employee)
            logger.info("Seed: Created Employee user (username: employee, password: employee123)")

        db.commit()
    except Exception as e:
        logger.error(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

# Start database setup
initialize_db()

# Initialize FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS Middleware config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo simplicity, allow all. In production, lock down to domains.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Router Modules
from app.services.auth.router import router as auth_router
from app.services.document.router import router as doc_router
from app.services.retrieval.router import router as ret_router
from app.services.chat.router import router as chat_router
from app.services.evaluation.router import router as eval_router
from app.services.admin.router import router as admin_router

app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(doc_router, prefix=settings.API_V1_STR)
app.include_router(ret_router, prefix=settings.API_V1_STR)
app.include_router(chat_router, prefix=settings.API_V1_STR)
app.include_router(eval_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Enterprise Knowledge Assistant API is running.",
        "version": settings.VERSION
    }
