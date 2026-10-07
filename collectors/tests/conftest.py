import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def fixture_text():
    def read(name: str) -> str:
        return (FIXTURES / name).read_text(encoding="utf-8")

    return read


@pytest.fixture
def db_conn():
    """Conexão com o banco descartável criado por `npm run test:py` (em web/)."""
    url = os.environ.get("DATABASE_URL", "")
    parsed = urlsplit(url)
    if parsed.path != "/radarpa_test" or parsed.hostname not in ("localhost", "127.0.0.1"):
        pytest.skip("sem banco de teste local — rode `npm run test:py` em web/")

    from psycopg2 import sql

    from base import connect

    conn = connect(url)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT tablename FROM pg_tables "
            "WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'"
        )
        tables = [sql.Identifier(t) for (t,) in cur.fetchall()]
        cur.execute(
            sql.SQL("TRUNCATE {} RESTART IDENTITY CASCADE").format(sql.SQL(", ").join(tables))
        )
    conn.commit()
    try:
        yield conn
    finally:
        conn.close()
