import pytest
import numpy as np

# Mocking settings and components to run without real DB if needed
from app.core.config import settings
from app.services.document.pipeline import recursive_character_splitter
from app.services.retrieval.router import normalize_scores
from app.services.auth.router import get_password_hash, verify_password, create_access_token, has_required_role

# 1. Test Text Ingestion and Splitter
def test_recursive_splitter():
    text = "This is sentence one. This is sentence two.\n\nThis is a separate paragraph that is quite long."
    chunks = recursive_character_splitter(text, chunk_size=40, chunk_overlap=10)
    
    assert len(chunks) > 0
    # Every chunk must be within target limits
    for chunk in chunks:
        assert len(chunk) <= 50  # account for slight variance or overlap padding
    
    # Make sure text parts are preserved
    joined_text = " ".join(chunks)
    assert "sentence" in joined_text

# 2. Test Authorization and Password Hashing
def test_password_handling():
    pwd = "securepassword123"
    hashed = get_password_hash(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("wrongpassword", hashed) is False

def test_role_hierarchy():
    # Admin (Level 3) should satisfy Manager (Level 2) and Employee (Level 1)
    assert has_required_role("Admin", "Manager") is True
    assert has_required_role("Admin", "Employee") is True
    assert has_required_role("Admin", "Admin") is True

    # Manager (Level 2) should satisfy Employee but not Admin
    assert has_required_role("Manager", "Employee") is True
    assert has_required_role("Manager", "Admin") is False

    # Employee (Level 1) should not satisfy Manager or Admin
    assert has_required_role("Employee", "Manager") is False
    assert has_required_role("Employee", "Admin") is False

# 3. Test Retrieval Normalization & Linear combination
def test_score_normalization():
    results = [
        {"id": 1, "raw_score": 10.0},
        {"id": 2, "raw_score": 5.0},
        {"id": 3, "raw_score": 0.0}
    ]
    normalized = normalize_scores(results, "raw_score")
    
    assert normalized[0]["norm_raw_score"] == 1.0  # Max score normalizes to 1.0
    assert normalized[1]["norm_raw_score"] == 0.5  # Mid score normalizes to 0.5
    assert normalized[2]["norm_raw_score"] == 0.0  # Min score normalizes to 0.0

# 4. Test Token Generation
def test_token_creation():
    data = {"sub": "test_user", "role": "Employee", "uid": 99}
    token = create_access_token(data)
    assert isinstance(token, str)
    assert len(token) > 20
