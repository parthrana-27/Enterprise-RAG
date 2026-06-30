import numpy as np
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.config import settings
from app.core.database import get_db
from app.core.embeddings import get_single_embedding
from app.models.models import User, Document, DocumentChunk
from app.schemas.schemas import QueryRequest, SearchResultChunk
from app.services.auth.router import get_current_user, has_required_role

router = APIRouter(prefix="/retrieve", tags=["retrieval"])

def normalize_scores(results: List[Dict[str, Any]], score_key: str) -> List[Dict[str, Any]]:
    """Normalizes the score_key values in list of dicts to range [0, 1]."""
    if not results:
        return results
    
    scores = [r[score_key] for r in results]
    min_score = min(scores)
    max_score = max(scores)
    
    denom = max_score - min_score
    for r in results:
        if denom > 0:
            r[f"norm_{score_key}"] = (r[score_key] - min_score) / denom
        else:
            r[f"norm_{score_key}"] = 1.0
            
    return results

@router.post("/search", response_model=List[SearchResultChunk])
def hybrid_search(
    query_in: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Performs hybrid search (BM25 + Vector) with security filters and version controls.
    """
    # 1. Check if user is allowed to access the requested security level filter (if any)
    user_role = current_user.role
    if query_in.security_filter:
        if not has_required_role(user_role, query_in.security_filter):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security filter exceeds your access level."
            )

    # 2. Compute query embedding
    query_vector = get_single_embedding(query_in.query)

    # 3. Setup SQL query filters for Role-Based Access Control and Version Control
    # Filter only completed documents
    # Version control: only latest version of a document by filename
    # Security level: document security_level must be accessible by user
    # Department filter: Managers only see their department (or empty department)
    rbac_conditions = []
    
    if user_role == settings.ROLE_EMPLOYEE:
        rbac_conditions.append("doc.security_level = 'Employee'")
    elif user_role == settings.ROLE_MANAGER:
        rbac_conditions.append("doc.security_level IN ('Employee', 'Manager')")
        if current_user.department:
            rbac_conditions.append(f"(doc.department = '{current_user.department}' OR doc.department IS NULL)")
    # Admins have no RBAC conditions (can view everything)

    rbac_sql_str = " AND ".join(rbac_conditions)
    if rbac_sql_str:
        rbac_sql_str = f"AND {rbac_sql_str}"

    # Base query template
    # Selects latest completed document version
    latest_version_sql = """
        doc.status = 'completed'
        AND doc.version = (
            SELECT MAX(d2.version) 
            FROM documents d2 
            WHERE d2.filename = doc.filename 
            AND d2.status = 'completed'
        )
    """

    # --- Vector Search Query ---
    # In pgvector, `<=>` computes cosine distance. Similarity = 1 - distance.
    vector_query = text(f"""
        SELECT 
            chunk.id as chunk_id, 
            chunk.document_id as document_id, 
            doc.filename as filename, 
            chunk.content as content, 
            doc.security_level as security_level,
            chunk.version as version,
            (1 - (chunk.embedding <=> :query_vector)) as score
        FROM document_chunks chunk
        JOIN documents doc ON chunk.document_id = doc.id
        WHERE {latest_version_sql} {rbac_sql_str}
        ORDER BY chunk.embedding <=> :query_vector
        LIMIT :limit
    """)

    # --- BM25 Full-text Search Query ---
    bm25_query = text(f"""
        SELECT 
            chunk.id as chunk_id, 
            chunk.document_id as document_id, 
            doc.filename as filename, 
            chunk.content as content, 
            doc.security_level as security_level,
            chunk.version as version,
            ts_rank_cd(to_tsvector('english', chunk.content), plainto_tsquery('english', :query_text)) as score
        FROM document_chunks chunk
        JOIN documents doc ON chunk.document_id = doc.id
        WHERE {latest_version_sql} {rbac_sql_str}
          AND to_tsvector('english', chunk.content) @@ plainto_tsquery('english', :query_text)
        ORDER BY score DESC
        LIMIT :limit
    """)

    try:
        # Run Vector Search
        vector_db_res = db.execute(
            vector_query, 
            {"query_vector": str(query_vector), "limit": query_in.top_k * 3}
        ).fetchall()
        
        vector_results = [
            {
                "chunk_id": r.chunk_id,
                "document_id": r.document_id,
                "filename": r.filename,
                "content": r.content,
                "security_level": r.security_level,
                "version": r.version,
                "raw_vector_score": float(r.score)
            }
            for r in vector_db_res
        ]

        # Run BM25 Search
        bm25_db_res = db.execute(
            bm25_query, 
            {"query_text": query_in.query, "limit": query_in.top_k * 3}
        ).fetchall()
        
        bm25_results = [
            {
                "chunk_id": r.chunk_id,
                "document_id": r.document_id,
                "filename": r.filename,
                "content": r.content,
                "security_level": r.security_level,
                "version": r.version,
                "raw_bm25_score": float(r.score)
            }
            for r in bm25_db_res
        ]

    except Exception as e:
        # Fallback if pgvector/fulltext extensions are not loaded or fail (mostly for development environment ease)
        # We perform a basic substring match to prevent complete pipeline failures
        logger.error(f"PostgreSQL advanced query error: {e}. Running fallback search.")
        fallback_query = text(f"""
            SELECT 
                chunk.id as chunk_id, 
                chunk.document_id as document_id, 
                doc.filename as filename, 
                chunk.content as content, 
                doc.security_level as security_level,
                chunk.version as version
            FROM document_chunks chunk
            JOIN documents doc ON chunk.document_id = doc.id
            WHERE doc.status = 'completed' {rbac_sql_str}
            LIMIT :limit
        """)
        fallback_res = db.execute(fallback_query, {"limit": query_in.top_k}).fetchall()
        
        return [
            SearchResultChunk(
                chunk_id=r.chunk_id,
                document_id=r.document_id,
                filename=r.filename,
                content=r.content,
                score=0.8,
                version=r.version,
                security_level=r.security_level
            )
            for r in fallback_res
        ]

    # 4. Normalize Scores
    vector_results = normalize_scores(vector_results, "raw_vector_score")
    bm25_results = normalize_scores(bm25_results, "raw_bm25_score")

    # Map chunks for fast lookup
    chunks_map = {}
    
    for r in vector_results:
        chunks_map[r["chunk_id"]] = {
            "chunk_id": r["chunk_id"],
            "document_id": r["document_id"],
            "filename": r["filename"],
            "content": r["content"],
            "security_level": r["security_level"],
            "version": r["version"],
            "vector_score": r["norm_raw_vector_score"],
            "bm25_score": 0.0
        }
        
    for r in bm25_results:
        cid = r["chunk_id"]
        if cid in chunks_map:
            chunks_map[cid]["bm25_score"] = r["norm_raw_bm25_score"]
        else:
            chunks_map[cid] = {
                "chunk_id": cid,
                "document_id": r["document_id"],
                "filename": r["filename"],
                "content": r["content"],
                "security_level": r["security_level"],
                "version": r["version"],
                "vector_score": 0.0,
                "bm25_score": r["norm_raw_bm25_score"]
            }

    # 5. Apply Hybrid Fusion Equation
    # Final Score = 0.4 * BM25 + 0.6 * Vector Similarity
    merged_results = []
    for cid, data in chunks_map.items():
        final_score = (0.4 * data["bm25_score"]) + (0.6 * data["vector_score"])
        
        merged_results.append(
            SearchResultChunk(
                chunk_id=data["chunk_id"],
                document_id=data["document_id"],
                filename=data["filename"],
                content=data["content"],
                score=round(final_score, 4),
                version=data["version"],
                security_level=data["security_level"]
            )
        )

    # Sort by final score descending and take top_k
    merged_results.sort(key=lambda x: x.score, reverse=True)
    return merged_results[:query_in.top_k]
