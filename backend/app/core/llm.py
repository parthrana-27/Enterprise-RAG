import json
import logging
import httpx
from typing import Generator, List, Dict, Any
from app.core.config import settings

logger = logging.getLogger("llm")

def stream_gemini(prompt: str, system_instruction: str = "") -> Generator[str, None, None]:
    """Streams completions from Google's Gemini API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key={settings.GEMINI_API_KEY}"
    
    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048
        }
    }
    
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    try:
        with httpx.stream("POST", url, json=payload, timeout=60.0) as r:
            if r.status_code != 200:
                logger.error(f"Gemini API returned status {r.status_code}: {r.read().decode('utf-8')}")
                yield f"[Error: Gemini API status {r.status_code}]"
                return

            buffer = ""
            for chunk in r.iter_text():
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    # Remove "data: " prefix if present in Server-Sent Events structure
                    if line.startswith("data:"):
                        line = line[5:].strip()
                    
                    try:
                        # Sometimes Gemini returns chunks enclosed in array brackets or raw json chunks
                        # If a line starts with a comma or square bracket, clean it up
                        if line.startswith(","):
                            line = line[1:].strip()
                        if line.startswith("[") or line.endswith("]"):
                            line = line.replace("[", "").replace("]", "").strip()
                        
                        if not line:
                            continue
                            
                        data = json.loads(line)
                        text = data["candidates"][0]["content"]["parts"][0]["text"]
                        yield text
                    except Exception:
                        pass
    except Exception as e:
        logger.error(f"Gemini streaming exception: {e}")
        yield f"[Streaming Error: {str(e)}]"

def stream_openai(prompt: str, system_instruction: str = "") -> Generator[str, None, None]:
    """Streams completions from OpenAI's Chat Completion API."""
    url = "https://api.openai.com/1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": "gpt-4o-mini",
        "messages": messages,
        "temperature": 0.2,
        "stream": True
    }

    try:
        with httpx.stream("POST", url, headers=headers, json=payload, timeout=60.0) as r:
            if r.status_code != 200:
                logger.error(f"OpenAI API returned status {r.status_code}: {r.read().decode('utf-8')}")
                yield f"[Error: OpenAI API status {r.status_code}]"
                return

            for line in r.iter_lines():
                if line.startswith("data:"):
                    line_data = line[5:].strip()
                    if line_data == "[DONE]":
                        break
                    try:
                        data = json.loads(line_data)
                        content = data["choices"][0]["delta"].get("content", "")
                        if content:
                            yield content
                    except Exception:
                        pass
    except Exception as e:
        logger.error(f"OpenAI streaming exception: {e}")
        yield f"[Streaming Error: {str(e)}]"

def stream_ollama(prompt: str, system_instruction: str = "") -> Generator[str, None, None]:
    """Streams completions from Ollama API."""
    url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/generate"
    
    payload = {
        "model": settings.OLLAMA_MODEL,
        "prompt": prompt,
        "system": system_instruction,
        "options": {
            "temperature": 0.2
        }
    }
    
    try:
        with httpx.stream("POST", url, json=payload, timeout=60.0) as r:
            if r.status_code != 200:
                logger.error(f"Ollama API returned status {r.status_code}: {r.read().decode('utf-8')}")
                yield f"[Error: Ollama API status {r.status_code}]"
                return

            for line in r.iter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if "response" in data:
                            yield data["response"]
                    except Exception:
                        pass
    except Exception as e:
        logger.error(f"Ollama streaming exception: {e}")
        yield f"[Streaming Error: {str(e)}]"

def simulate_llm(prompt: str, context_chunks: List[Dict[str, Any]]) -> Generator[str, None, None]:
    """Simulates a highly realistic, context-grounded RAG response generator for local demo mode."""
    import time
    
    yield "🧠 [Demo Mode: Simulating RAG Reasoning Engine...]\n\n"
    time.sleep(0.4)
    
    if not context_chunks:
        answer = "I could not find any relevant documents in the enterprise repository. As an assistant configured to respond only using internal knowledge, I cannot answer this query without context. Please upload files containing the relevant information."
    else:
        # Construct an answer using the provided contexts
        filenames = list(set([c["filename"] for c in context_chunks]))
        file_list = ", ".join(filenames)
        
        answer = f"Based on the retrieved enterprise documents ({file_list}), here is the synthesis of the information:\n\n"
        
        # Summarize/extract snippet facts
        facts = []
        for c in context_chunks:
            text = c["content"].strip()
            # Grab the first sentence or two
            sentences = [s.strip() for s in text.split(".") if s.strip()]
            if sentences:
                facts.append(f"- According to {c['filename']} (v{c['version']}): \"{sentences[0]}.\"")
        
        answer += "\n".join(facts[:3])
        answer += "\n\nIf you need further details, please review the citation links below or refine your query."
    
    # Stream token by token
    tokens = answer.split(" ")
    for t in tokens:
        yield t + " "
        time.sleep(0.04)

def llm_generate_stream(prompt: str, system_instruction: str = "", context_chunks: List[Dict[str, Any]] = None) -> Generator[str, None, None]:
    """Central entrypoint for generating streaming answers."""
    if settings.GEMINI_API_KEY:
        yield from stream_gemini(prompt, system_instruction)
    elif settings.OPENAI_API_KEY:
        yield from stream_openai(prompt, system_instruction)
    elif settings.OLLAMA_BASE_URL:
        yield from stream_ollama(prompt, system_instruction)
    else:
        yield from simulate_llm(prompt, context_chunks or [])
