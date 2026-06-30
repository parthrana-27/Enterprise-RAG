import os
import shutil
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db, SessionLocal
from app.models.models import Document, AuditLog, User
from app.schemas.schemas import DocumentResponse
from app.services.auth.router import get_current_user, RoleChecker, has_required_role

router = APIRouter(prefix="/documents", tags=["documents"])

# Ensure upload directory exists inside workspace
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    security_level: str = Form(settings.ROLE_EMPLOYEE),
    department: Optional[str] = Form(None),
    current_user: User = Depends(RoleChecker([settings.ROLE_MANAGER, settings.ROLE_ADMIN])),
    db: Session = Depends(get_db)
):
    # Validate security level parameter
    if security_level not in [settings.ROLE_EMPLOYEE, settings.ROLE_MANAGER, settings.ROLE_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid security level. Choose from Employee, Manager, Admin."
        )

    # 1. Determine version if file with same name exists
    existing_doc = db.query(Document)\
        .filter(Document.filename == file.filename)\
        .order_by(Document.version.desc())\
        .first()
    
    version = 1
    if existing_doc:
        version = existing_doc.version + 1

    # 2. Save file to disk
    file_ext = os.path.splitext(file.filename)[1].replace(".", "").lower()
    safe_filename = f"{os.path.splitext(file.filename)[0]}_v{version}.{file_ext}"
    storage_path = os.path.join(UPLOAD_DIR, safe_filename)

    try:
        with open(storage_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}"
        )

    # 3. Create document record in database
    db_doc = Document(
        filename=file.filename,
        file_type=file_ext,
        storage_path=storage_path,
        author_id=current_user.id,
        department=department or current_user.department,
        version=version,
        security_level=security_level,
        status="processing"
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    # Log action
    audit_log = AuditLog(
        user_id=current_user.id,
        action="UPLOAD",
        target_type="DOCUMENT",
        target_id=str(db_doc.id),
        details=f"Uploaded document {file.filename} (Version {version}, Security: {security_level})"
    )
    db.add(audit_log)
    db.commit()

    # 4. Trigger Ingestion Background Task
    from app.services.document.pipeline import ingest_document_in_background
    background_tasks.add_task(
        ingest_document_in_background,
        SessionLocal,
        db_doc.id,
        storage_path
    )

    return db_doc

@router.get("/list", response_model=List[DocumentResponse])
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Retrieve all documents
    query = db.query(Document)
    
    # Apply Role Filter:
    # Employees: can only see Employee clearance documents.
    # Managers: can see Employee and Manager documents.
    # Admins: can see all documents.
    docs = query.all()
    
    filtered_docs = []
    for doc in docs:
        # Check if user role matches or exceeds document security level
        role_allowed = has_required_role(current_user.role, doc.security_level)
        
        # Check if department matches (Managers only see their department's documents or public ones)
        dept_allowed = True
        if current_user.role == settings.ROLE_MANAGER and doc.department:
            if doc.department != current_user.department:
                dept_allowed = False
        
        # Admins can bypass department restrictions
        if current_user.role == settings.ROLE_ADMIN:
            dept_allowed = True
            
        if role_allowed and dept_allowed:
            filtered_docs.append(doc)

    return filtered_docs

@router.delete("/delete/{document_id}", status_code=status.HTTP_200_OK)
def delete_document(
    document_id: int,
    current_user: User = Depends(RoleChecker([settings.ROLE_ADMIN])),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )

    filename = doc.filename
    # Delete from storage if it exists
    if os.path.exists(doc.storage_path):
        try:
            os.remove(doc.storage_path)
        except Exception as e:
            # Continue deleting from DB even if local file delete fails
            pass

    db.delete(doc)
    db.commit()

    # Log action
    audit_log = AuditLog(
        user_id=current_user.id,
        action="DELETE",
        target_type="DOCUMENT",
        target_id=str(document_id),
        details=f"Deleted document {filename}"
    )
    db.add(audit_log)
    db.commit()

    return {"message": f"Successfully deleted document and its chunks."}
