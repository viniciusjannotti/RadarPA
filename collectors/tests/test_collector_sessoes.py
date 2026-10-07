from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from base import HttpClient
from collector_sessoes import (
    EXPORT_URL,
    SessoesCollector,
    listing_url,
    parse_export_csv,
    parse_listing,
    session_url,
)

SP = ZoneInfo("America/Sao_Paulo")


def test_parse_export_csv(fixture_text):
    rows = parse_export_csv(fixture_text("sessoes_export_amostra.csv"))
    assert len(rows) == 6

    first = rows[0]
    assert (first.numero, first.ano, first.tipo) == (36, 2026, "Sessão Ordinária")
    assert first.data_inicio == datetime(2026, 10, 6, 16, 0, tzinfo=SP)
    assert first.data_fim == datetime(2026, 10, 6, 19, 2, tzinfo=SP)
    assert first.status == "Encerrada"
    assert first.titulo == "36ª Sessão Ordinária de 06/10/2026"

    tipos = {r.tipo for r in rows}
    assert tipos == {"Sessão Ordinária", "Sessão Extraordinária", "Sessão Itinerante"}


def test_parse_export_csv_aceita_bom_e_termino_vazio():
    text = (
        "﻿Número,Tipo,Componentes,Início,Término,Status,Título\n"
        '37/2026,"Sessão Ordinária",N/D,"13/10/2026 16:00",,Agendada,"37ª Sessão Ordinária de 13/10/2026"\n'
    )
    [row] = parse_export_csv(text)
    assert row.data_fim is None
    assert row.status == "Agendada"


HEADER = "Número,Tipo,Componentes,Início,Término,Status,Título\n"


def test_parse_export_csv_deduplica_chave_e_ignora_linhas_ruins():
    text = (
        HEADER
        + '36/2026,"Sessão Ordinária",N/D,"06/10/2026 16:00",,Encerrada,"36ª  Sessão Ordinária de 06/10/2026"\n'
        + '36/2026,"Sessão Ordinária",N/D,"06/10/2026 16:00",,Cancelada,"36ª Sessão Ordinária de 06/10/2026"\n'
        + 'lixo,"Sessão Ordinária",N/D,"06/10/2026 16:00",,Encerrada,"x"\n'
        + '37/2026,"Sessão Ordinária",N/D,,,Encerrada,"y"\n'
    )
    result = parse_export_csv(text)
    assert len(result) == 1
    assert result[0].status == "Cancelada"  # a última ocorrência vence
    assert result.skipped == 2


def test_parse_export_csv_normaliza_espacos_no_titulo():
    text = HEADER + '1/2026,"Sessão Ordinária",N/D,"03/02/2026 16:00",,Encerrada,"1ª Sessão  Ordinária de 03/02/2026 "\n'
    [row] = parse_export_csv(text)
    assert row.titulo == "1ª Sessão Ordinária de 03/02/2026"


def test_parse_listing(fixture_text):
    page = parse_listing(fixture_text("sessoes_lista_pg1.html"))
    assert page.items[:3] == [
        (1472, "36ª Sessão Ordinária de 06/10/2026"),
        (1471, "35ª Sessão Ordinária de 29/09/2026"),
        (1470, "34ª Sessão Ordinária de 22/09/2026"),
    ]
    assert page.last_page == 95


def _sessoes(conn):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT numero, ano, tipo, gwlegis_id, status, fonte_url FROM sessoes "
            "ORDER BY data_inicio DESC"
        )
        return cur.fetchall()


def _http(routes: dict[str, str]):
    def handler(request: httpx.Request):
        url = str(request.url)
        if url not in routes:
            return httpx.Response(404)
        return httpx.Response(200, text=routes[url])

    return HttpClient(
        transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None
    )


def test_collect_faz_upsert_e_resolve_ids(db_conn, fixture_text):
    http = _http(
        {
            EXPORT_URL: fixture_text("sessoes_export_amostra.csv"),
            listing_url(1): fixture_text("sessoes_lista_pg1.html"),
        }
    )
    n = SessoesCollector(max_pages=1).run(db_conn, http)
    assert n == 6

    rows = _sessoes(db_conn)
    assert len(rows) == 6
    assert rows[0][:4] == (36, 2026, "Sessão Ordinária", 1472)
    assert rows[0][5] == session_url(1472)
    # Sessões fora da 1ª página da listagem ficam sem id até um backfill.
    assert rows[-1][3] is None
    assert rows[-1][5] == EXPORT_URL


def test_collect_e_idempotente_e_atualiza_status(db_conn, fixture_text):
    csv_text = fixture_text("sessoes_export_amostra.csv")
    routes = {EXPORT_URL: csv_text, listing_url(1): fixture_text("sessoes_lista_pg1.html")}
    SessoesCollector(max_pages=1).run(db_conn, _http(routes))

    routes[EXPORT_URL] = csv_text.replace(",Encerrada,", ",Cancelada,", 1)
    SessoesCollector(max_pages=1).run(db_conn, _http(routes))

    rows = _sessoes(db_conn)
    assert len(rows) == 6
    assert rows[0][4] == "Cancelada"



def _listing_html(items: list[tuple[int, str]], last_page: int) -> str:
    links = "".join(
        f'<div item><div titulo><span class="txt">'
        f'<a href="https://x.test/sessao-plenaria/{i}">{t}</a></span></div></div>'
        for i, t in items
    )
    pag = f'<div paginacao><a href="https://x.test/sessoes-plenarias?pg={last_page}">{last_page}</a></div>'
    return f"<html><body>{links}{pag}</body></html>"


def _csv(rows: list[tuple[int, str]]) -> str:
    """rows: (numero, data dd/mm/2026)"""
    return HEADER + "".join(
        f'{n}/2026,"Sessão Ordinária",N/D,"{d} 16:00",,Encerrada,"{n}ª Sessão Ordinária de {d}"\n'
        for n, d in rows
    )


def _ids(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT numero, gwlegis_id FROM sessoes ORDER BY numero DESC")
        return cur.fetchall()


def test_retoma_backfill_interrompido(db_conn):
    """Página 1 já conhecida, mas há sessões mais antigas sem id → continua paginando."""
    csv_text = _csv([(3, "17/02/2026"), (2, "10/02/2026"), (1, "03/02/2026")])
    pages = {
        listing_url(1): _listing_html([(103, "3ª Sessão Ordinária de 17/02/2026")], 3),
        listing_url(2): _listing_html([(102, "2ª Sessão Ordinária de 10/02/2026")], 3),
        listing_url(3): _listing_html([(101, "1ª Sessão Ordinária de 03/02/2026")], 3),
    }
    routes = {EXPORT_URL: csv_text, listing_url(1): pages[listing_url(1)]}
    # 1ª execução "morre" depois da página 1 (página 2 dá 404).
    SessoesCollector().run(db_conn, _http(routes))
    assert _ids(db_conn) == [(3, 103), (2, None), (1, None)]

    routes.update(pages)
    SessoesCollector().run(db_conn, _http(routes))
    assert _ids(db_conn) == [(3, 103), (2, 102), (1, 101)]


def test_nao_pagina_por_sessoes_sem_id_mais_novas_que_a_listagem(db_conn):
    """Uma sessão nova (ainda não listada) não força varrer todas as páginas."""
    csv_text = _csv([(4, "24/02/2026"), (3, "17/02/2026")])
    hit: list[str] = []
    routes = {
        EXPORT_URL: csv_text,
        listing_url(1): _listing_html([(103, "3ª Sessão Ordinária de 17/02/2026")], 50),
    }

    def handler(request):
        hit.append(str(request.url))
        url = str(request.url)
        return httpx.Response(200, text=routes[url]) if url in routes else httpx.Response(404)

    http = HttpClient(transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None)
    SessoesCollector().run(db_conn, http)
    SessoesCollector().run(db_conn, HttpClient(transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None))
    assert listing_url(2) not in hit
    assert _ids(db_conn) == [(4, None), (3, 103)]


def test_titulo_ambiguo_e_id_reatribuido_nao_abortam(db_conn):
    csv_text = _csv([(2, "10/02/2026"), (1, "03/02/2026")])
    routes = {
        EXPORT_URL: csv_text,
        listing_url(1): _listing_html([(101, "2ª Sessão Ordinária de 10/02/2026")], 1),
    }
    SessoesCollector().run(db_conn, _http(routes))
    assert _ids(db_conn) == [(2, 101), (1, None)]

    # O portal passou a listar o id 101 para outra sessão: o id migra, sem UniqueViolation.
    routes[listing_url(1)] = _listing_html(
        [(101, "1ª Sessão Ordinária de 03/02/2026"), (999, "Título que não existe")], 1
    )
    SessoesCollector().run(db_conn, _http(routes))
    assert _ids(db_conn) == [(2, None), (1, 101)]

    # Dois registros com o mesmo título: ambíguo → nenhum recebe o id, e a coleta segue.
    with db_conn.cursor() as cur:
        cur.execute("UPDATE sessoes SET titulo = 'Duplicado' WHERE numero IN (1, 2)")
    db_conn.commit()
    routes[EXPORT_URL] = HEADER  # export vazio: não sobrescreve os títulos acima
    routes[listing_url(1)] = _listing_html([(555, "Duplicado")], 1)
    SessoesCollector().run(db_conn, _http(routes))
    assert 555 not in [i for _, i in _ids(db_conn)]


def test_falha_na_resolucao_registra_sucesso_parcial(db_conn):
    routes = {EXPORT_URL: _csv([(1, "03/02/2026")])}  # listagem → 404
    n = SessoesCollector().run(db_conn, _http(routes))
    assert n == 1
    with db_conn.cursor() as cur:
        cur.execute("SELECT status, registros, detalhes FROM coleta_logs")
        status, registros, detalhes = cur.fetchone()
    assert (status, registros) == ("parcial", 1)
    assert "ids" in detalhes


def test_grava_url_da_sessao_como_fonte_quando_id_resolvido(db_conn):
    routes = {
        EXPORT_URL: _csv([(1, "03/02/2026")]),
        listing_url(1): _listing_html([(101, "1ª Sessão Ordinária de 03/02/2026")], 1),
    }
    SessoesCollector().run(db_conn, _http(routes))
    with db_conn.cursor() as cur:
        cur.execute("SELECT fonte_url FROM sessoes")
        assert cur.fetchone()[0].endswith("/sessao-plenaria/101")
