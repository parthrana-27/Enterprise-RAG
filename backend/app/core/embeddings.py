import numpy as np
import logging
from typing import List
from app.core.config import settings

logger = logging.getLogger("embeddings")

# Lazy-loaded local transformer
_model_instance = None

def get_local_model():
    global _model_instance
    if _model_instance is None:
        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"Loading local embedding model: {settings.EMBEDDING_MODEL_NAME}")
            _model_instance = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
        except Exception as e:
            logger.warning(f"Failed to load sentence-transformers: {e}. Fallback to dummy embeddings.")
            _model_instance = "fallback"
    return _model_instance

def get_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Generates embeddings for a list of strings using the configured LLM provider or local fallback.
    """
    if not texts:
        return []

    # 1. Try OpenAI if API key exists
    if settings.OPENAI_API_KEY:
        try:
            import httpx
            headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}
            data = {"input": texts, "model": "text-embedding-3-small"}
            response = httpx.post("https://api.openai.com/1/embeddings", json=data, headers=headers, timeout=30.0)
            if response.status_code == 200:
                result = response.json()
                return [item["embedding"] for item in result["data"]]
            else:
                logger.error(f"OpenAI embedding error: {response.text}")
        except Exception as e:
            logger.error(f"Failed calling OpenAI embeddings: {e}")

    # 2. Try Gemini / Google GenAI if API key exists
    if settings.GEMINI_API_KEY:
        try:
            import httpx
            # Call Google Generative Language API
            url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={settings.GEMINI_API_KEY}"
            embeddings = []
            for text in texts:
                data = {
                    "model": "models/text-embedding-004",
                    "content": {"parts": [{"text": text}]}
                }
                response = httpx.post(url, json=data, timeout=30.0)
                if response.status_code == 200:
                    val = response.json()
                    embeddings.append(val["embedding"]["values"])
                else:
                    logger.error(f"Gemini embedding error: {response.text}")
                    break
            if len(embeddings) == len(texts):
                return embeddings
        except Exception as e:
            logger.error(f"Failed calling Gemini embeddings: {e}")

    # 3. Fallback to Local Sentence Transformers
    model = get_local_model()
    if model != "fallback":
        try:
            # Generate local embeddings
            vectors = model.encode(texts)
            return [v.tolist() for v in vectors]
        except Exception as e:
            logger.error(f"SentenceTransformers encode error: {e}")

    # 4. Final Fallback: Generate deterministic pseudo-random dummy embeddings (so the app works without crash)
    logger.warning("Using dummy/simulated embeddings.")
    dummy_embeddings = []
    for text in texts:
        # Generate a seed based on the text hash so it's deterministic for the same text
        seed = abs(hash(text)) % (2**32 - 1)
        rng = np.random.default_rng(seed)
        vec = rng.uniform(-1.0, 1.0, settings.EMBEDDING_DIMENSION)
        # Normalize vector
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        dummy_embeddings.append(vec.tolist())
    
    return dummy_embeddings

def get_single_embedding(text: str) -> List[float]:
    return get_embeddings([text])[0]
