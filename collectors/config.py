"""Configuração compartilhada pelos coletores."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Em dev reaproveita o .env do app web; no GitHub Actions as variáveis vêm do ambiente.
load_dotenv(Path(__file__).resolve().parent.parent / "web" / ".env")

USER_AGENT = "RadarPA/1.0 (+uso-pessoal)"

# Rate limit: no máximo 1 requisição por segundo (ver plano, seção 2).
MIN_INTERVAL_SECONDS = 1.0
MAX_RETRIES = 4
BACKOFF_BASE_SECONDS = 2.0
TIMEOUT_SECONDS = 30.0

GWLEGIS_BASE = "https://cmpousoalegre.gwlegis.com.br"
SITE_BASE = "https://www.pousoalegre.mg.leg.br"

# Únicos hosts que os coletores podem acessar (inclusive via redirect).
ALLOWED_HOSTS = {"cmpousoalegre.gwlegis.com.br", "www.pousoalegre.mg.leg.br"}


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL não definida")
    return url
