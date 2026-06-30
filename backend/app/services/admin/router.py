from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.models import AuditLog, User, Document, DocumentChunk, ChatMessage
from app.services.auth.router import RoleChecker
from app.core.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])

# Enforce strict Admin check for all endpoints
admin_checker = RoleChecker([settings.ROLE_ADMIN])

@router.get("/stats")
def get_system_stats(
    current_user: User = Depends(admin_checker),
    db: Session = Depends(get_db)
):
    """
    Returns high-level statistics for the admin dashboard.
    """
    total_docs = db.query(Document).count()
    completed_docs = db.query(Document).filter(Document.status == "completed").count()
    failed_docs = db.query(Document).filter(Document.status == "failed").count()
    processing_docs = db.query(Document).filter(Document.status == "processing").count()
    
    total_chunks = db.query(DocumentChunk).count()
    total_users = db.query(User).count()
    total_queries = db.query(ChatMessage).filter(ChatMessage.role == "assistant").count()
    
    return {
        "documents": {
            "total": total_docs,
            "completed": completed_docs,
            "failed": failed_docs,
            "processing": processing_docs
        },
        "total_chunks": total_chunks,
        "total_users": total_users,
        "total_queries": total_queries
    }

@router.get("/audit-logs")
def get_audit_logs(
    limit: int = Query(50, description="Number of logs to pull"),
    action_filter: Optional[str] = None,
    current_user: User = Depends(admin_checker),
    db: Session = Depends(get_db)
):
    """
    Returns system audit logs with user linkage.
    """
    query = db.query(
        AuditLog.id,
        AuditLog.action,
        AuditLog.target_type,
        AuditLog.target_id,
        AuditLog.details,
        AuditLog.timestamp,
        User.username.label("username")
    ).outerjoin(User, AuditLog.user_id == User.id)
    
    if action_filter:
        query = query.filter(AuditLog.action == action_filter)
        
    logs = query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
    
    return [
        {
            "id": r.id,
            "action": r.action,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "details": r.details,
            "timestamp": r.timestamp,
            "username": r.username or "System"
        }
        for r in logs
    ]

@router.get("/frequent-queries")
def get_frequent_queries(
    limit: int = 10,
    current_user: User = Depends(admin_checker),
    db: Session = Depends(get_db)
):
    """
    Aggregates user messages to find most frequently asked questions.
    """
    results = db.query(
        ChatMessage.content,
        func.count(ChatMessage.id).label("count")
    ).filter(
        ChatMessage.role == "user"
    ).group_by(
        ChatMessage.content
    ).order_by(
        func.count(ChatMessage.id).desc()
    ).limit(limit).all()
    
    return [{"query": r.content, "count": r.count} for r in results]

@router.get("/user-activity")
def get_user_activity(
    limit: int = 10,
    current_user: User = Depends(admin_checker),
    db: Session = Depends(get_db)
):
    """
    Returns top active users based on their message counts.
    """
    results = db.query(
        User.username,
        User.role,
        User.department,
        func.count(ChatMessage.id).label("queries_asked")
    ).join(
        ChatSession, ChatSession.user_id == User.id
    ).join(
        ChatMessage, ChatMessage.session_id == ChatSession.id
    ).filter(
        ChatMessage.role == "user"
    ).group_by(
        User.username, User.role, User.department
    ).order_by(
        func.count(ChatMessage.id).desc()
    ).limit(limit).all()
    
    return [
        {
            "username": r.username,
            "role": r.role,
            "department": r.department or "N/A",
            "queries_asked": r.queries_asked
        }
        for r in results
    ]
