import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, cast, Date
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import ChatMessage, ChatSession, User
from app.services.auth.router import RoleChecker
from app.core.config import settings

router = APIRouter(prefix="/evaluate", tags=["evaluation"])

@router.get("/metrics")
def get_evaluation_metrics(
    days: int = Query(7, description="Number of historical days to pull"),
    current_user: User = Depends(RoleChecker([settings.ROLE_MANAGER, settings.ROLE_ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Returns aggregated evaluation metrics over the past N days.
    Generates daily averages for faithfulness, precision, recall, and token counts.
    """
    cutoff_date = datetime.datetime.utcnow() - datetime.timedelta(days=days)
    
    # 1. Fetch message metrics grouped by day
    # We query chat_messages where role is 'assistant'
    results = db.query(
        cast(ChatMessage.created_at, Date).label("date"),
        func.count(ChatMessage.id).label("total_queries"),
        func.avg(ChatMessage.eval_precision).label("avg_precision"),
        func.avg(ChatMessage.eval_recall).label("avg_recall"),
        func.avg(ChatMessage.eval_faithfulness).label("avg_faithfulness"),
        func.avg(ChatMessage.latency_ms).label("avg_latency_ms"),
        func.sum(ChatMessage.token_cost).label("total_token_cost")
    ).filter(
        ChatMessage.role == "assistant",
        ChatMessage.created_at >= cutoff_date
    ).group_by(
        cast(ChatMessage.created_at, Date)
    ).order_by(
        "date"
    ).all()
    
    # Format results as a list of dicts for charting libraries (e.g. Recharts)
    chart_data = []
    
    # Build list of dates in the range to ensure no gaps
    date_list = [datetime.date.today() - datetime.timedelta(days=x) for x in range(days)]
    date_list.reverse()
    
    results_map = {r.date: r for r in results}
    
    for d in date_list:
        if d in results_map:
            row = results_map[d]
            chart_data.append({
                "date": d.strftime("%Y-%m-%d"),
                "queries": row.total_queries,
                "precision": round(row.avg_precision or 0.0, 2),
                "recall": round(row.avg_recall or 0.0, 2),
                "faithfulness": round(row.avg_faithfulness or 0.0, 2),
                "latency_ms": round(row.avg_latency_ms or 0.0, 0),
                "cost": round(row.total_token_cost or 0.0, 5)
            })
        else:
            # Empty state for that day
            chart_data.append({
                "date": d.strftime("%Y-%m-%d"),
                "queries": 0,
                "precision": 1.0,
                "recall": 1.0,
                "faithfulness": 1.0,
                "latency_ms": 0.0,
                "cost": 0.0
            })
            
    # Calculate overall summary metrics
    summary = db.query(
        func.count(ChatMessage.id).label("total_queries"),
        func.avg(ChatMessage.eval_precision).label("avg_precision"),
        func.avg(ChatMessage.eval_recall).label("avg_recall"),
        func.avg(ChatMessage.eval_faithfulness).label("avg_faithfulness"),
        func.avg(ChatMessage.latency_ms).label("avg_latency_ms"),
        func.sum(ChatMessage.token_cost).label("total_token_cost")
    ).filter(
        ChatMessage.role == "assistant"
    ).first()
    
    # Hallucination rate is defined as (1.0 - faithfulness) * 100
    avg_faithfulness = summary.avg_faithfulness or 1.0
    hallucination_rate = round((1.0 - avg_faithfulness) * 100, 1)

    return {
        "summary": {
            "total_queries": summary.total_queries or 0,
            "avg_precision": round(summary.avg_precision or 0.0, 2),
            "avg_recall": round(summary.avg_recall or 0.0, 2),
            "avg_faithfulness": round(avg_faithfulness, 2),
            "avg_latency_ms": round(summary.avg_latency_ms or 0.0, 0),
            "total_token_cost": round(summary.total_token_cost or 0.0, 4),
            "hallucination_rate_percent": max(0.0, hallucination_rate)
        },
        "history": chart_data
    }
