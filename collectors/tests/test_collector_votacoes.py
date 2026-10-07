from datetime import datetime, timedelta, timezone

import httpx
import pytest

from base import HttpClient
from collector_sessoes import session_url
from collector_votacoes import (
    VotacoesCollector,
    abbreviate,
    build_abbrev_map,
    parse_presenca_csv,
    parse_session_docs,
    parse_votacao_csv,
    presenca_url,
    votacao_url,
)

NOMES = [
    "Oliveira",
    "Odair Quincote",
    "Delegado Renato Gavião",
    "Davi Andrade",
    "Ely da Autopeças",
    "Dr. Edson",
    "Dionísio",
    "Elizelto Guido",
    "Fred Coutinho",
    "Hélio Carlos de Oliveira",
    "Israel Russo",
    "Leandro Morais",
    "Lívia Macedo",
    "Miguel Tomatinho do Hospital",
    "Rogerinho da Policlínica",
]


@pytest.mark.parametrize(
    "nome,abrev",
    [
        ("Davi Andrade", "Davi A."),
        ("Delegado Renato Gavião", "Delegado R."),
        ("Dr. Edson", "Dr. E."),
        ("Ely da Autopeças", "Ely A."),
        ("Rogerinho da Policlínica", "Rogerinho P."),
        ("Miguel Tomatinho do Hospital", "Miguel T."),
        ("Hélio Carlos de Oliveira", "Hélio C."),
        ("Dionísio", "Dionísio"),
    ],
)
def test_abbreviate(nome, abrev):
    assert abbreviate(nome) == abrev


def test_build_abbrev_map_descarta_ambiguos():
    m = build_abbrev_map({1: "Ana Souza", 2: "Ana Silva", 3: "Bia Costa"})
    assert "Ana S." not in m
    assert m["Bia C."] == 3


def test_parse_session_docs(fixture_text):
    docs = parse_session_docs(fixture_text("sessao_1472_docs.html"))
    assert docs.votacao_id == 40
    assert docs.presenca_id == 160
    assert parse_session_docs("<html></html>").votacao_id is None


def test_parse_votacao_csv(fixture_text):
    rows = parse_votacao_csv(fixture_text("boletim_votacao_40.csv"))
    assert len(rows) == 13

    pl = rows[1]
    assert pl.ordem == 2
    assert pl.documento == "Projeto de Lei Nº 8412/2026"
    assert pl.autoria == "Dionísio"
    assert pl.legenda == "2ª Votação"
    assert pl.resultado == "Aprovado"
    assert pl.tipo_aprovacao == "Maioria Simples"
    assert pl.tipo_votacao == "aberta"
    assert pl.descricao == "Projeto de Lei Nº 8412/2026 — 2ª Votação"
    assert len(pl.votos["sim"]) == 11
    assert pl.votos["ausente_votacao"] == []
    assert pl.votos["nao_votou"] == ["Fred C."]
    assert pl.votos["ausente"] == ["Delegado R.", "Miguel T."]

    emenda = rows[6]
    assert emenda.votos["nao"] == ["Dionísio", "Elizelto G.", "Ely A.", "Fred C.", "Rogerinho P."]

    ata = rows[0]
    assert ata.legenda is None
    assert ata.descricao == "Ata da 35ª Sessão Ordinária de 29/09/2026"
    assert ata.votos["ausente_plenario"] == ["Hélio C."]


def test_parse_presenca_csv(fixture_text):
    rows = parse_presenca_csv(fixture_text("boletim_presenca_160.csv"))
    assert len(rows) == 15
    assert ("Davi Andrade", "PRESENTE") in rows
    assert ("Delegado Renato Gavião", "AUSENTE") in rows


# --- integração com o banco ---------------------------------------------------


def _seed(conn, sessao_inicio: datetime, verificada: datetime | None = None):
    with conn.cursor() as cur:
        for i, nome in enumerate(NOMES, start=7):
            cur.execute(
                "INSERT INTO vereadores (gwlegis_id, nome, nome_parlamentar, partido, fonte_url) "
                "VALUES (%s, %s, %s, 'X', 'x')",
                (i, nome, nome),
            )
        cur.execute(
            "INSERT INTO sessoes (gwlegis_id, numero, ano, tipo, data_inicio, fonte_url, "
            "boletins_verificados_em) VALUES (1472, 36, 2026, 'Sessão Ordinária', %s, 'x', %s) "
            "RETURNING id",
            (sessao_inicio, verificada),
        )
        sessao_id = cur.fetchone()[0]
    conn.commit()
    return sessao_id


def _http(fixture_text, hits: list[str] | None = None):
    routes = {
        session_url(1472): fixture_text("sessao_1472_docs.html"),
        votacao_url(40): fixture_text("boletim_votacao_40.csv"),
        presenca_url(160): fixture_text("boletim_presenca_160.csv"),
    }

    def handler(request):
        url = str(request.url)
        if hits is not None:
            hits.append(url)
        return httpx.Response(200, text=routes[url]) if url in routes else httpx.Response(404)

    return HttpClient(transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None)


def _q(conn, sql, params=()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


RECENTE = datetime(2026, 10, 6, 19, 0, tzinfo=timezone.utc)


def test_collect_grava_votacoes_votos_e_presenca(db_conn, fixture_text):
    sessao_id = _seed(db_conn, RECENTE)
    agora = RECENTE + timedelta(days=1)
    for _ in range(2):  # idempotente
        n = VotacoesCollector(now=lambda: agora).run(db_conn, _http(fixture_text))
    assert n == 1

    assert _q(db_conn, "SELECT count(*) FROM votacoes") == [(13,)]
    assert _q(
        db_conn,
        "SELECT v.voto, count(*) FROM votos v JOIN votacoes vt ON vt.id = v.votacao_id "
        "WHERE vt.ordem = 7 GROUP BY v.voto ORDER BY v.voto",
    ) == [("nao", 5), ("sim", 9)]
    # Todos os nomes abreviados do boletim casaram com vereadores.
    assert _q(db_conn, "SELECT count(*) FROM votos WHERE votacao_id IN (SELECT id FROM votacoes WHERE ordem = 9)") == [(15,)]

    assert _q(db_conn, "SELECT count(*), count(*) FILTER (WHERE presente) FROM sessao_presencas") == [(15, 14)]
    assert _q(
        db_conn,
        "SELECT p.situacao FROM sessao_presencas p JOIN vereadores v ON v.id = p.vereador_id "
        "WHERE v.nome_parlamentar = 'Delegado Renato Gavião'",
    ) == [("AUSENTE",)]
    assert _q(db_conn, "SELECT boletins_verificados_em IS NOT NULL FROM sessoes WHERE id = %s", (sessao_id,)) == [(True,)]


def test_so_visita_sessoes_pendentes_ou_recentes(db_conn, fixture_text):
    antiga_verificada = RECENTE - timedelta(days=60)
    _seed(db_conn, antiga_verificada, verificada=antiga_verificada + timedelta(days=1))
    hits: list[str] = []
    n = VotacoesCollector(now=lambda: RECENTE).run(db_conn, _http(fixture_text, hits))
    assert n == 0
    assert hits == []


def test_sessao_futura_ou_anterior_aos_boletins_e_ignorada(db_conn, fixture_text):
    _seed(db_conn, RECENTE + timedelta(days=3))
    hits: list[str] = []
    assert VotacoesCollector(now=lambda: RECENTE).run(db_conn, _http(fixture_text, hits)) == 0
    assert hits == []


def test_nome_desconhecido_vira_detalhe_e_nao_derruba(db_conn, fixture_text):
    _seed(db_conn, RECENTE)
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM vereadores WHERE nome_parlamentar = 'Fred Coutinho'")
    db_conn.commit()
    VotacoesCollector(now=lambda: RECENTE + timedelta(days=1)).run(db_conn, _http(fixture_text))
    [(status, detalhes)] = _q(db_conn, "SELECT status, detalhes FROM coleta_logs")
    assert status == "sucesso"
    assert "não reconhecidos" in detalhes and "Fred C." in detalhes


def test_falha_numa_sessao_marca_parcial(db_conn, fixture_text):
    _seed(db_conn, RECENTE)

    def handler(request):
        return httpx.Response(500)

    http = HttpClient(
        transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None, max_retries=0
    )
    VotacoesCollector(now=lambda: RECENTE + timedelta(days=1)).run(db_conn, http)
    [(status,)] = _q(db_conn, "SELECT status FROM coleta_logs")
    assert status == "parcial"
    # Não marcou como verificada: tenta de novo na próxima execução.
    assert _q(db_conn, "SELECT boletins_verificados_em FROM sessoes") == [(None,)]


def test_build_abbrev_map_aceita_mesmo_vereador_por_dois_nomes():
    m = build_abbrev_map({14: ["Hélio Carlos de Oliveira", "Hélio Carlos de Oliveira"], 21: ["Rogerinho da Policlínica", "Rogério Aparecido Narciso da Silva"]})
    assert m["Hélio C."] == 14
    assert m["Rogerinho P."] == 21
    assert m["Rogério A."] == 21


def test_boletim_com_nomes_civis_casa_pelo_nome_civil(db_conn, fixture_text):
    sessao_id = _seed(db_conn, RECENTE)
    with db_conn.cursor() as cur:
        cur.execute("UPDATE vereadores SET nome = 'Rogério Aparecido Narciso da Silva' WHERE nome_parlamentar = 'Rogerinho da Policlínica'")
    db_conn.commit()

    civil = fixture_text("boletim_votacao_40.csv").replace("Rogerinho P.", "Rogério A.")
    presenca = fixture_text("boletim_presenca_160.csv").replace("Rogerinho da Policlínica", "Rogério Aparecido Narciso da Silva")
    routes = {
        session_url(1472): fixture_text("sessao_1472_docs.html"),
        votacao_url(40): civil,
        presenca_url(160): presenca,
    }
    http = HttpClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, text=routes[str(r.url)])),
        min_interval=0,
        sleep=lambda s: None,
    )
    VotacoesCollector(now=lambda: RECENTE + timedelta(days=1)).run(db_conn, http)
    [(detalhes,)] = _q(db_conn, "SELECT detalhes FROM coleta_logs")
    assert "não reconhecidos" not in detalhes
    assert _q(db_conn, "SELECT count(*) FROM sessao_presencas WHERE sessao_id = %s", (sessao_id,)) == [(15,)]


def test_sessao_com_nome_desconhecido_nao_fica_verificada(db_conn, fixture_text):
    _seed(db_conn, RECENTE)
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM vereadores WHERE nome_parlamentar = 'Fred Coutinho'")
    db_conn.commit()
    VotacoesCollector(now=lambda: RECENTE + timedelta(days=1)).run(db_conn, _http(fixture_text))
    # Dados gravados, mas a sessão volta na próxima execução (para quando o nome for mapeado).
    assert _q(db_conn, "SELECT count(*) FROM votacoes") == [(13,)]
    assert _q(db_conn, "SELECT boletins_verificados_em FROM sessoes") == [(None,)]


def test_boletim_corrompido_nao_apaga_dados_e_sessao_volta(db_conn, fixture_text):
    sessao_id = _seed(db_conn, RECENTE)
    VotacoesCollector(now=lambda: RECENTE + timedelta(days=1)).run(db_conn, _http(fixture_text))
    assert _q(db_conn, "SELECT count(*) FROM votacoes") == [(13,)]
    with db_conn.cursor() as cur:
        cur.execute("UPDATE sessoes SET boletins_verificados_em = NULL")
    db_conn.commit()

    # Portal responde 200 com uma página HTML de erro no lugar dos CSVs.
    erro = "<html><body>Ops! Algo inesperado aconteceu.</body></html>"
    routes = {
        session_url(1472): fixture_text("sessao_1472_docs.html"),
        votacao_url(40): erro,
        presenca_url(160): erro,
    }
    http = HttpClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, text=routes[str(r.url)])),
        min_interval=0,
        sleep=lambda s: None,
    )
    VotacoesCollector(now=lambda: RECENTE + timedelta(days=2)).run(db_conn, http)
    assert _q(db_conn, "SELECT count(*) FROM votacoes") == [(13,)]
    assert _q(db_conn, "SELECT count(*) FROM sessao_presencas WHERE sessao_id = %s", (sessao_id,)) == [(15,)]
    assert _q(db_conn, "SELECT boletins_verificados_em FROM sessoes") == [(None,)]
    [(status,)] = _q(db_conn, "SELECT status FROM coleta_logs ORDER BY id DESC LIMIT 1")
    assert status == "parcial"


def test_itens_repetidos_na_mesma_sessao_nao_se_fundem(fixture_text):
    linhas = fixture_text("boletim_votacao_40.csv").splitlines(keepends=True)
    # Duplica o item 2 (mesmo documento e legenda) como item 14.
    dup = linhas[2].replace(";2;", ";14;", 1)
    rows = parse_votacao_csv("".join(linhas + [dup]))
    descricoes = [r.descricao for r in rows]
    assert len(set(descricoes)) == len(descricoes) == 14
    assert "Projeto de Lei Nº 8412/2026 — 2ª Votação (item 2)" in descricoes
    assert "Projeto de Lei Nº 8412/2026 — 2ª Votação (item 14)" in descricoes
