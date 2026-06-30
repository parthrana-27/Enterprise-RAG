from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

# --- Auth & User Schemas ---
class UserBase(BaseModel):
    username: str
    role: str
    department: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None


# --- Document Schemas ---
class DocumentResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    upload_date: datetime
    department: Optional[str] = None
    version: int
    security_level: str
    status: str
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


# --- Chat & Messaging Schemas ---
class ChatMessageBase(BaseModel):
    role: str
    content: str

class ChatMessageCreate(BaseModel):
    content: str

class Citation(BaseModel):
    document_id: int
    filename: str
    chunk_index: int
    text_snippet: str
    page_num: Optional[int] = None
    score: float

class ChatMessageResponse(ChatMessageBase):
    id: int
    citations: Optional[List[Dict[str, Any]]] = None
    latency_ms: int
    token_cost: float
    eval_precision: Optional[float] = None
    eval_recall: Optional[float] = None
    eval_faithfulness: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ChatSessionResponse(BaseModel):
    id: str
    user_id: int
    created_at: datetime
    messages: List[ChatMessageResponse] = []

    class Config:
        from_attributes = True


# --- Ingestion & Chunking Schemas ---
class DocumentChunkResponse(BaseModel):
    id: int
    document_id: int
    chunk_index: int
    content: str
    version: int

    class Config:
        from_attributes = True


# --- Search & Retrieval Schemas ---
class QueryRequest(BaseModel):
    query: str
    top_k: int = 5
    security_filter: Optional[str] = None

class SearchResultChunk(BaseModel):
    chunk_id: int
    document_id: int
    filename: str
    content: str
    score: float
    version: int
    security_level: str

# --- Audit Logs ---
class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    username: Optional[str] = "System"
    action: str
    target_type: str
    target_id: Optional[str]
    details: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True


# --- Evaluation and Admin Schemas ---
class IngestionStats(BaseModel):
    total_documents: int
    total_chunks: int
    processing_count: int
    completed_count: int
    failed_count: int

class SearchAnalytics(BaseModel):
    query_text: str
    count: int
    avg_latency_ms: float

class DashboardStats(BaseModel):
    ingestion: IngestionStats
    total_users: int
    total_messages: int
    average_eval_precision: Optional[float] = 0.0
    average_eval_recall: Optional[float] = 0.0
    average_eval_faithfulness: Optional[float] = 0.0
