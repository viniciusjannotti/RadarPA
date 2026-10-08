import httpx
import pytest

from base import Collector, HttpClient, normalize_database_url
from config import USER_AGENT


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def make_client(handler, clock=None, **kw):
    clock = clock or FakeClock()
    transport = httpx.MockTransport(handler)
    kw.setdefault("allowed_hosts", set())  # sem restrição de host, salvo quando o teste pede
    return (
        HttpClient(
            transport=transport,
            min_interval=1.0,
            sleep=clock.sleep,
            monotonic=clock.monotonic,
            **kw,
        ),
        clock,
    )


def test_envia_user_agent_identificado():
    seen = {}

    def handler(request):
        seen["ua"] = request.headers["user-agent"]
        return httpx.Response(200, text="ok")

    client, _ = make_client(handler)
    client.get("https://example.test/a")
    assert seen["ua"] == USER_AGENT
    assert USER_AGENT.startswith("RadarPA/1.0")


def test_respeita_intervalo_minimo_entre_requisicoes():
    client, clock = make_client(lambda r: httpx.Response(200))
    client.get("https://example.test/a")
    client.get("https://example.test/b")
    client.get("https://example.test/c")
    # A primeira não espera; as seguintes esperam 1s cada.
    assert clock.sleeps == [1.0, 1.0]


def test_retry_com_backoff_exponencial_em_erro_5xx():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503)
        return httpx.Response(200, text="ok")

    client, clock = make_client(handler, max_retries=3, backoff_base=2.0)
    resp = client.get("https://example.test/a")
    assert resp.text == "ok"
    assert calls["n"] == 3
    # backoffs 2s e 4s (além do rate limit, que já é coberto pelo backoff)
    assert 2.0 in clock.sleeps and 4.0 in clock.sleeps


def test_respeita_retry_after_em_429():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, headers={"Retry-After": "7"})
        return httpx.Response(200)

    client, clock = make_client(handler, max_retries=2, backoff_base=2.0)
    client.get("https://cmpousoalegre.gwlegis.com.br/a")
    assert 7.0 in clock.sleeps


def test_bloqueia_redirect_para_host_fora_da_lista():
    def handler(request):
        if request.url.host == "cmpousoalegre.gwlegis.com.br":
            return httpx.Response(302, headers={"Location": "http://169.254.169.254/x"})
        return httpx.Response(200, text="segredo")

    client, _ = make_client(handler, allowed_hosts={"cmpousoalegre.gwlegis.com.br"})
    with pytest.raises(httpx.HTTPError):
        client.get("https://cmpousoalegre.gwlegis.com.br/a")


def test_desiste_apos_max_retries():
    client, _ = make_client(lambda r: httpx.Response(500), max_retries=2)
    with pytest.raises(httpx.HTTPStatusError):
        client.get("https://example.test/a")


def test_nao_faz_retry_em_404():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(404)

    client, _ = make_client(handler, max_retries=3)
    with pytest.raises(httpx.HTTPStatusError):
        client.get("https://example.test/a")
    assert calls["n"] == 1


@pytest.mark.parametrize(
    "url,expected",
    [
        (
            "postgresql://u:p@h:5432/db?schema=public",
            "postgresql://u:p@h:5432/db",
        ),
        (
            "postgresql://u:p@h:5432/db?sslmode=require&schema=public",
            "postgresql://u:p@h:5432/db?sslmode=require",
        ),
        ("postgresql://u:p@h/db", "postgresql://u:p@h/db"),
    ],
)
def test_normaliza_url_do_prisma_para_psycopg2(url, expected):
    assert normalize_database_url(url) == expected


class OkCollector(Collector):
    name = "ok_collector"

    def collect(self, conn, http):
        return 7


class BoomCollector(Collector):
    name = "boom_collector"

    def collect(self, conn, http):
        raise RuntimeError("falhou feio")


def _logs(conn):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT coletor, status, registros, erro, fim IS NOT NULL "
            "FROM coleta_logs ORDER BY id"
        )
        return cur.fetchall()


def test_run_registra_sucesso_em_coleta_logs(db_conn):
    assert OkCollector().run(db_conn, http=None) == 7
    assert _logs(db_conn) == [("ok_collector", "sucesso", 7, None, True)]


def test_run_registra_erro_e_relanca(db_conn):
    with pytest.raises(RuntimeError):
        BoomCollector().run(db_conn, http=None)
    [(nome, status, registros, erro, terminou)] = _logs(db_conn)
    assert (nome, status, registros, terminou) == ("boom_collector", "erro", 0, True)
    assert "falhou feio" in erro


def test_execucao_anterior_morta_vira_interrompida(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO coleta_logs (coletor, inicio, status) VALUES "
            "('ok_collector', NOW() - INTERVAL '1 day', 'executando'), "
            "('outro_coletor', NOW() - INTERVAL '1 day', 'executando')"
        )
    db_conn.commit()
    OkCollector().run(db_conn, http=None)
    with db_conn.cursor() as cur:
        cur.execute("SELECT coletor, status, fim IS NOT NULL FROM coleta_logs ORDER BY id")
        rows = cur.fetchall()
    assert rows == [
        ("ok_collector", "interrompido", True),
        ("outro_coletor", "executando", False),  # só mexe nas execuções do próprio coletor
        ("ok_collector", "sucesso", True),
    ]


def test_execucao_recente_em_andamento_nao_e_marcada(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO coleta_logs (coletor, inicio, status) VALUES "
            "('ok_collector', NOW() - INTERVAL '10 minutes', 'executando')"
        )
    db_conn.commit()
    OkCollector().run(db_conn, http=None)
    with db_conn.cursor() as cur:
        cur.execute("SELECT status FROM coleta_logs ORDER BY id")
        assert [s for (s,) in cur.fetchall()] == ["executando", "sucesso"]
