from datetime import date

import httpx
import pytest

from base import HttpClient
from collector_proposicoes import (
    EXPORT_URL,
    ProposicoesCollector,
    autoria_url,
    parse_autoria_listing,
    parse_export_csv,
    tipo_do_titulo,
)


@pytest.mark.parametrize(
    "titulo,tipo",
    [
        ("Projeto de Lei Nº 8412/2026", "Projeto de Lei"),
        ("Parecer Nº 1 ao Projeto de Lei Nº 1717/2026", "Parecer"),
        ("Emenda Nº 1 ao Projeto de Lei Nº 1717/2026", "Emenda"),
        ("Indicação Nº 1292/2026", "Indicação"),
        ("Autógrafo ao(à) Projeto de Lei Nº 1686/2026", "Autógrafo ao(à) Projeto de Lei"),
    ],
)
def test_tipo_do_titulo(titulo, tipo):
    assert tipo_do_titulo(titulo) == tipo


def test_parse_export_csv(fixture_text):
    result = parse_export_csv(fixture_text("proposicoes_export_amostra.csv"))
    # 9 linhas: 1 duplicata exata e 2 sem número/ano são descartadas.
    assert len(result) == 6
    assert result.skipped == 2

    pl = next(r for r in result if r.titulo == "Projeto de Lei Nº 8412/2026")
    assert (pl.tipo, pl.numero, pl.ano) == ("Projeto de Lei", 8412, 2026)
    assert pl.data_protocolo == date(2026, 7, 23)
    assert pl.ementa.startswith("DISPÕE SOBRE A PREVENÇÃO")

    pareceres = [r for r in result if r.tipo == "Parecer"]
    assert len(pareceres) == 2  # mesmo (tipo, número, ano), títulos diferentes


def test_parse_autoria_listing(fixture_text):
    page = parse_autoria_listing(fixture_text("proposicoes_autoria_pg1.html"))
    assert page.items[0] == (60920, "Requerimento Nº 183/2026", "Aprovado")
    assert len(page.items) == 3
    assert page.last_page == 102  # fixture tirada da listagem sem filtro de legislatura


def _q(conn, sql, params=()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def _seed(conn):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO legislaturas (numero, inicio, fim) VALUES (2, '2025-01-01', '2028-12-31') RETURNING id"
        )
        leg = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO vereadores (gwlegis_id, nome, nome_parlamentar, partido, legislatura_id, fonte_url) "
            "VALUES (9, 'Dionísio Ailton Pereira', 'Dionísio', 'REPUBLICANOS', %s, 'x') RETURNING id",
            (leg,),
        )
        vid = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO sessoes (numero, ano, tipo, data_inicio, fonte_url) "
            "VALUES (36, 2026, 'Sessão Ordinária', '2026-10-06 19:00Z', 'x') RETURNING id"
        )
        sid = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO votacoes (sessao_id, descricao, fonte_url) VALUES "
            "(%s, 'Projeto de Lei Nº 8412/2026 — 2ª Votação', 'x'), "
            "(%s, 'Requerimento Nº 183/2026', 'x'), "
            "(%s, 'Moção Nº 999/2026', 'x')",
            (sid, sid, sid),
        )
    conn.commit()
    return vid


def _http(fixture_text, autoria_pages: dict[int, str] | None = None):
    routes = {EXPORT_URL: fixture_text("proposicoes_export_amostra.csv")}
    for pg, html in (autoria_pages or {}).items():
        routes[autoria_url(9, 2, pg)] = html

    def handler(request):
        url = str(request.url)
        return httpx.Response(200, text=routes[url]) if url in routes else httpx.Response(404)

    return HttpClient(transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None)


def _listing(items: list[tuple[int, str]], last_page: int = 1) -> str:
    body = "".join(
        f'<div item><div titulo><span class="txt"><a href="https://x.test/proposicao/{i}">{t}</a>'
        f'<span class="votado">Aprovado</span></span></div></div>'
        for i, t in items
    )
    return f'<html><body>{body}<div paginacao><a href="?pg={last_page}">{last_page}</a></div></body></html>'


def test_collect_importa_export_e_e_idempotente(db_conn, fixture_text):
    _seed(db_conn)
    pages = {1: _listing([])}
    for _ in range(2):
        n = ProposicoesCollector().run(db_conn, _http(fixture_text, pages))
    assert n == 6
    assert _q(db_conn, "SELECT count(*) FROM proposicoes") == [(6,)]


def test_autoria_grava_id_situacao_e_vinculo(db_conn, fixture_text):
    vid = _seed(db_conn)
    pages = {1: fixture_text("proposicoes_autoria_pg1.html")}
    ProposicoesCollector(max_paginas_autoria=1).run(db_conn, _http(fixture_text, pages))

    assert _q(
        db_conn,
        "SELECT p.gwlegis_id, p.status FROM proposicoes p JOIN proposicao_autores a ON a.proposicao_id = p.id "
        "WHERE a.vereador_id = %s",
        (vid,),
    ) == [(60920, "Aprovado")]
    [(detalhes,)] = _q(db_conn, "SELECT detalhes FROM coleta_logs")
    # Os 2 requerimentos que não estão na amostra do export ficam registrados.
    assert "2 itens de autoria sem proposição correspondente" in detalhes


def test_autoria_incremental_para_em_pagina_conhecida(db_conn, fixture_text):
    _seed(db_conn)
    hits: list[str] = []
    pages = {
        1: _listing([(60920, "Requerimento Nº 183/2026")], last_page=3),
        2: _listing([(60001, "Projeto de Lei Nº 8412/2026")], last_page=3),
        3: _listing([(60002, "Projeto de Lei Nº 1717/2026")], last_page=3),
    }
    routes = {EXPORT_URL: fixture_text("proposicoes_export_amostra.csv")}
    routes.update({autoria_url(9, 2, pg): html for pg, html in pages.items()})

    def handler(request):
        hits.append(str(request.url))
        return httpx.Response(200, text=routes[str(request.url)])

    def http():
        return HttpClient(transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None)

    ProposicoesCollector().run(db_conn, http())
    assert _q(db_conn, "SELECT count(*) FROM proposicao_autores") == [(3,)]

    hits.clear()
    ProposicoesCollector().run(db_conn, http())
    # Página 1 só tem item já vinculado → para nela.
    assert [h for h in hits if h != EXPORT_URL] == [autoria_url(9, 2, 1)]


def test_liga_votacoes_as_proposicoes_pelo_documento(db_conn, fixture_text):
    _seed(db_conn)
    ProposicoesCollector().run(db_conn, _http(fixture_text, {1: _listing([])}))
    assert _q(
        db_conn,
        "SELECT v.descricao, p.titulo FROM votacoes v LEFT JOIN proposicoes p ON p.id = v.proposicao_id "
        "ORDER BY v.descricao",
    ) == [
        ("Moção Nº 999/2026", None),
        ("Projeto de Lei Nº 8412/2026 — 2ª Votação", "Projeto de Lei Nº 8412/2026"),
        ("Requerimento Nº 183/2026", "Requerimento Nº 183/2026"),
    ]


def test_export_vazio_falha_sem_apagar(db_conn, fixture_text):
    _seed(db_conn)
    ProposicoesCollector().run(db_conn, _http(fixture_text, {1: _listing([])}))

    def handler(request):
        return httpx.Response(200, text="<html>erro</html>")

    http = HttpClient(transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None)
    with pytest.raises(ValueError):
        ProposicoesCollector().run(db_conn, http)
    assert _q(db_conn, "SELECT count(*) FROM proposicoes") == [(6,)]


def test_varredura_completa_retoma_backfill_interrompido(db_conn, fixture_text):
    _seed(db_conn)
    pages = {
        1: _listing([(60920, "Requerimento Nº 183/2026")], last_page=2),
        2: _listing([(60001, "Projeto de Lei Nº 8412/2026")], last_page=2),
    }
    # 1ª execução "morre" na página 2 (404 → registra parcial).
    ProposicoesCollector().run(db_conn, _http(fixture_text, {1: pages[1]}))
    assert _q(db_conn, "SELECT count(*) FROM proposicao_autores") == [(1,)]

    # Incremental: página 1 já conhecida → não chega à 2.
    ProposicoesCollector().run(db_conn, _http(fixture_text, pages))
    assert _q(db_conn, "SELECT count(*) FROM proposicao_autores") == [(1,)]

    # Varredura completa (semanal) vai até o fim.
    ProposicoesCollector(autoria_completa=True).run(db_conn, _http(fixture_text, pages))
    assert _q(db_conn, "SELECT count(*) FROM proposicao_autores") == [(2,)]


def test_reexecucao_nao_regrava_linhas_iguais(db_conn, fixture_text):
    _seed(db_conn)
    ProposicoesCollector().run(db_conn, _http(fixture_text, {1: _listing([])}))
    antes = _q(db_conn, "SELECT id, atualizado_em, xmin::text FROM proposicoes ORDER BY id")
    ProposicoesCollector().run(db_conn, _http(fixture_text, {1: _listing([])}))
    depois = _q(db_conn, "SELECT id, atualizado_em, xmin::text FROM proposicoes ORDER BY id")
    assert antes == depois  # nenhuma linha reescrita


def test_votacao_repetida_sem_legenda_tambem_liga(db_conn, fixture_text):
    _seed(db_conn)
    with db_conn.cursor() as cur:
        cur.execute("UPDATE votacoes SET descricao = 'Requerimento Nº 183/2026 (item 4)' WHERE descricao = 'Requerimento Nº 183/2026'")
    db_conn.commit()
    ProposicoesCollector().run(db_conn, _http(fixture_text, {1: _listing([])}))
    assert _q(
        db_conn,
        "SELECT p.titulo FROM votacoes v JOIN proposicoes p ON p.id = v.proposicao_id "
        "WHERE v.descricao = 'Requerimento Nº 183/2026 (item 4)'",
    ) == [("Requerimento Nº 183/2026",)]


@pytest.mark.parametrize(
    "a,b",
    [
        (
            "Substitutivo Nº 1 ao Projeto de Lei Nº 8125/2025",
            "Substitutivo Nº 01/2026 ao(à) Projeto de Lei Nº 8125/2025",
        ),
        (
            "Parecer Nº 2 ao Substitutivo Nº 1 ao Projeto de Lei Nº 8125/2025",
            "Parecer Nº 02/2026 ao(à) Substitutivo Nº 01/2026 ao(à) Projeto de Lei Nº 8125/2025",
        ),
        ("Projeto de Lei Nº 8412/2026", "Projeto de Lei Nº 8412/2026"),
        ("Emenda Nº 1 à Emenda Nº 2 ao Projeto de Lei Nº 7/2026", "Emenda Nº 01/2026 ao(à) Emenda Nº 02/2026 ao(à) Projeto de Lei Nº 7/2026"),
    ],
)
def test_titulo_normalizado_iguala_as_duas_grafias_do_portal(a, b):
    from collector_proposicoes import normalizar_titulo

    assert normalizar_titulo(a) == normalizar_titulo(b)


def test_titulo_normalizado_nao_confunde_documentos_diferentes():
    from collector_proposicoes import normalizar_titulo

    assert normalizar_titulo("Projeto de Lei Nº 8125/2025") != normalizar_titulo("Projeto de Lei Nº 8125/2026")
    assert normalizar_titulo("Indicação Nº 1/2026") != normalizar_titulo("Indicação Nº 10/2026")


def test_autoria_casa_titulo_com_grafia_diferente(db_conn, fixture_text):
    vid = _seed(db_conn)
    # No export: "Emenda Nº 1 ao Projeto de Lei Nº 1717/2026"; a listagem pode trazer "Nº 01/2026 ao(à)".
    pages = {1: _listing([(70001, "Emenda Nº 01/2026 ao(à) Projeto de Lei Nº 1717/2026")])}
    ProposicoesCollector().run(db_conn, _http(fixture_text, pages))
    assert _q(
        db_conn,
        "SELECT p.titulo FROM proposicao_autores a JOIN proposicoes p ON p.id = a.proposicao_id WHERE a.vereador_id = %s",
        (vid,),
    ) == [("Emenda Nº 1 ao Projeto de Lei Nº 1717/2026",)]


def test_texto_de_busca_sem_acento_e_minusculo():
    from collector_proposicoes import texto_busca

    assert texto_busca("Projeto de Lei Nº 8412/2026", "DISPÕE SOBRE O ASSÉDIO MORAL") == (
        "projeto de lei nº 8412/2026 dispoe sobre o assedio moral"
    )
    assert texto_busca("Indicação Nº 5/2026", None) == "indicacao nº 5/2026"


def test_collect_grava_coluna_busca_mesmo_em_linhas_existentes(db_conn, fixture_text):
    _seed(db_conn)
    ProposicoesCollector().run(db_conn, _http(fixture_text, {1: _listing([])}))
    with db_conn.cursor() as cur:  # simula linha antiga, anterior à coluna
        cur.execute("UPDATE proposicoes SET busca = NULL")
    db_conn.commit()
    ProposicoesCollector().run(db_conn, _http(fixture_text, {1: _listing([])}))
    assert _q(db_conn, "SELECT busca FROM proposicoes WHERE titulo = 'Projeto de Lei Nº 8412/2026'") == [
        ("projeto de lei nº 8412/2026 dispoe sobre a prevencao e o combate ao assedio moral nas relacoes de trabalho no ambito da administracao publica direta e indireta do municipio de pouso alegre e da outras providencias.",)
    ]


# Mesmas entradas/saídas de web/src/lib/busca-texto.test.ts (PARIDADE).
@pytest.mark.parametrize(
    "entrada,esperado",
    [
        ("ASSÉDIO", "assedio"),
        ("Ação Nº 5", "acao nº 5"),
        ("CONCESSÃO à ÇÉU", "concessao a ceu"),
        ("1ª Sessão", "1ª sessao"),
        ("Lívia Ü", "livia u"),
    ],
)
def test_paridade_da_normalizacao_com_a_web(entrada, esperado):
    from collector_proposicoes import texto_busca

    assert texto_busca(entrada, None) == esperado
