from abc import ABC, abstractmethod
import json
import logging
import requests
from typing import Optional, Dict, Any
try:
    from ..config import AI_PROVIDER, MODEL_NAME, AI_BASE_URL
except (ImportError, ValueError):
    from config import AI_PROVIDER, MODEL_NAME, AI_BASE_URL


logger = logging.getLogger(__name__)

class AIProvider(ABC):
    @abstractmethod
    def available(self) -> bool:
        pass

    @abstractmethod
    def complete_json(self, system: str, user: str) -> Optional[Dict[str, Any]]:
        pass

class NullProvider(AIProvider):
    def available(self) -> bool:
        return False

    def complete_json(self, system: str, user: str) -> Optional[Dict[str, Any]]:
        return None

class OllamaProvider(AIProvider):
    def __init__(self, base_url: str = AI_BASE_URL, model: str = MODEL_NAME):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def available(self) -> bool:
        if not self.model:
            return False
        try:
            res = requests.get(f"{self.base_url}/api/tags", timeout=2.0)
            if res.status_code == 200:
                tags = res.json().get("models", [])
                names = [m.get("name") for m in tags]
                return any(self.model in name for name in names) if names else True
            return False
        except Exception:
            return False

    def complete_json(self, system: str, user: str) -> Optional[Dict[str, Any]]:
        if not self.model:
            return None
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user}
            ],
            "format": "json",
            "stream": False
        }
        try:
            res = requests.post(f"{self.base_url}/api/chat", json=payload, timeout=20.0)
            if res.status_code == 200:
                body = res.json()
                content = body.get("message", {}).get("content", "")
                if content:
                    return json.loads(content)
            return None
        except Exception as e:
            logger.warning(f"Ollama call failed or timed out: {e}")
            return None

def get_provider() -> AIProvider:
    if AI_PROVIDER == "ollama":
        return OllamaProvider()
    return NullProvider()
