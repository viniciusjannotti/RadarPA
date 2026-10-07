from datetime import date

import httpx

from base import HttpClient
from collector_vereadores import (
    COMISSOES_URL,
    VEREADORES_URL,
    VereadoresCollector,
    decode_cfemail,
    parse_comissoes,
    parse_perfil,
    parse_vereadores,
    perfil_url,
)


def test_decode_cfemail():
    assert (
        decode_cfemail("215744530f4e4d48574448534061514e54524e404d444653440f4c460f4d44460f4353")
        == "ver.oliveira@pousoalegre.mg.leg.br"
    )
    assert decode_cfemail("zz") is None
    assert decode_cfemail("") is None


def test_parse_vereadores(fixture_text):
    page = parse_vereadores(fixture_text("vereadores_lista.html"))

    assert page.legislatura.numero == 2
    assert page.legislatura.inicio == date(2025, 1, 1)
    assert page.legislatura.fim == date(2028, 12, 31)
    assert page.legislatura.descricao == "01ª - 01/01/2025 - 31/12/2028"

    assert len(page.vereadores) == 15
    presidente = page.vereadores[0]
    assert presidente.gwlegis_id == 20
    assert presidente.nome_parlamentar == "Oliveira"
    assert presidente.partido == "REPUBLICANOS"
    assert presidente.cargo_mesa == "Presidente"
    assert presidente.status == "ativo"
    assert presidente.foto_url.startswith("https://cmpousoalegre.gwlegis.com.br/arquivo/")

    sem_cargo = [v for v in page.vereadores if v.cargo_mesa is None]
    assert len(sem_cargo) == 10
    assert {v.gwlegis_id for v in page.vereadores} == set(range(7, 22))


def test_parse_perfil(fixture_text):
    assert parse_perfil(fixture_text("vereador_20.html")).email == (
        "ver.oliveira@pousoalegre.mg.leg.br"
    )
    assert parse_perfil("<html><body>sem email</body></html>").email is None


def test_parse_comissoes(fixture_text):
    comissoes = parse_comissoes(fixture_text("comissoes.html"))
    assert len(comissoes) == 2
    csp = comissoes[0]
    assert csp.gwlegis_id == 12
    assert csp.sigla == "CSP"
    assert csp.nome == "Comissão de Segurança Pública"
    assert csp.tipo == "Permanente"
    assert csp.ativa is True
    assert [m.vereador_gwlegis_id for m in csp.membros] == [9, 10, 14]
    assert all(m.cargo == "membro" for m in csp.membros)


def _http(fixture_text, perfis_ok=True):
    lista = fixture_text("vereadores_lista.html")
    perfil = fixture_text("vereador_20.html")
    comissoes = fixture_text("comissoes.html")

    def handler(request: httpx.Request):
        url = str(request.url)
        if url == VEREADORES_URL:
            return httpx.Response(200, text=lista)
        if url == COMISSOES_URL:
            return httpx.Response(200, text=comissoes)
        if url.startswith(perfil_url(0)[:-1]):
            if not perfis_ok:
                return httpx.Response(404)
            return httpx.Response(200, text=perfil if url == perfil_url(20) else "<html></html>")
        return httpx.Response(404)

    return HttpClient(transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None)


def _q(conn, sql):
    with conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


def test_collect_grava_tudo_e_e_idempotente(db_conn, fixture_text):
    for _ in range(2):
        n = VereadoresCollector().run(db_conn, _http(fixture_text))
    assert n == 15

    assert _q(db_conn, "SELECT numero, descricao FROM legislaturas") == [
        (2, "01ª - 01/01/2025 - 31/12/2028")
    ]
    assert _q(db_conn, "SELECT count(*) FROM vereadores") == [(15,)]
    assert _q(
        db_conn,
        "SELECT nome_parlamentar, partido, email, legislatura_id IS NOT NULL, fonte_url "
        "FROM vereadores WHERE gwlegis_id = 20",
    ) == [
        (
            "Oliveira",
            "REPUBLICANOS",
            "ver.oliveira@pousoalegre.mg.leg.br",
            True,
            perfil_url(20),
        )
    ]
    assert _q(
        db_conn,
        "SELECT v.gwlegis_id, m.cargo FROM mesa_diretora m JOIN vereadores v ON v.id = m.vereador_id "
        "ORDER BY v.gwlegis_id",
    ) == [
        (8, "1º Secretário(a)"),
        (10, "2º Vice-Presidente"),
        (12, "2º Secretário(a)"),
        (19, "Vice-Presidente"),
        (20, "Presidente"),
    ]
    assert _q(db_conn, "SELECT count(*) FROM comissoes") == [(2,)]
    assert _q(db_conn, "SELECT count(*) FROM comissao_membros") == [(6,)]


def test_mesa_e_comissoes_refletem_a_fonte_atual(db_conn, fixture_text):
    VereadoresCollector().run(db_conn, _http(fixture_text))

    # Nova coleta: o presidente mudou e a CSP perdeu um membro.
    lista = fixture_text("vereadores_lista.html")
    comissoes = fixture_text("comissoes.html").replace(
        'href="https://cmpousoalegre.gwlegis.com.br/vereador/14"', 'href="#removido"', 1
    )
    lista = lista.replace('<div class="cargo">Presidente</div>', "", 1)

    def handler(request):
        url = str(request.url)
        if url == VEREADORES_URL:
            return httpx.Response(200, text=lista)
        if url == COMISSOES_URL:
            return httpx.Response(200, text=comissoes)
        return httpx.Response(200, text="<html></html>")

    http = HttpClient(transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None)
    VereadoresCollector().run(db_conn, http)

    cargos = [c for (c,) in _q(db_conn, "SELECT cargo FROM mesa_diretora")]
    assert "Presidente" not in cargos
    assert _q(db_conn, "SELECT count(*) FROM comissao_membros") == [(5,)]


def test_falha_em_um_perfil_nao_derruba_a_coleta(db_conn, fixture_text):
    n = VereadoresCollector().run(db_conn, _http(fixture_text, perfis_ok=False))
    assert n == 15
    with db_conn.cursor() as cur:
        cur.execute("SELECT status, detalhes FROM coleta_logs")
        status, detalhes = cur.fetchone()
    assert status == "parcial"
    assert "perfis" in detalhes


def _http_with(lista: str, comissoes: str):
    def handler(request):
        url = str(request.url)
        if url == VEREADORES_URL:
            return httpx.Response(200, text=lista)
        if url == COMISSOES_URL:
            return httpx.Response(200, text=comissoes)
        return httpx.Response(200, text="<html></html>")

    return HttpClient(transport=httpx.MockTransport(handler), min_interval=0, sleep=lambda s: None)


def test_vereador_que_sai_da_lista_fica_inativo(db_conn, fixture_text):
    lista = fixture_text("vereadores_lista.html")
    comissoes = fixture_text("comissoes.html")
    VereadoresCollector().run(db_conn, _http_with(lista, comissoes))

    # O card do vereador 21 some da listagem.
    import re

    sem_21 = re.sub(
        r'<a class="vereador" href="https://cmpousoalegre\.gwlegis\.com\.br/vereador/21">.*?</a>',
        "",
        lista,
        flags=re.S,
    )
    assert sem_21 != lista
    VereadoresCollector().run(db_conn, _http_with(sem_21, comissoes))
    assert _q(db_conn, "SELECT status FROM vereadores WHERE gwlegis_id = 21") == [("inativo",)]
    assert _q(db_conn, "SELECT count(*) FROM vereadores WHERE status = 'ativo'") == [(14,)]


def test_raspagem_vazia_falha_sem_apagar_mesa_nem_comissoes(db_conn, fixture_text):
    lista = fixture_text("vereadores_lista.html")
    comissoes = fixture_text("comissoes.html")
    VereadoresCollector().run(db_conn, _http_with(lista, comissoes))

    quebrada = lista.replace('class="vereador"', 'class="card-novo"')
    import pytest

    with pytest.raises(ValueError):
        VereadoresCollector().run(db_conn, _http_with(quebrada, comissoes))
    assert _q(db_conn, "SELECT count(*) FROM mesa_diretora") == [(5,)]

    with pytest.raises(ValueError):
        VereadoresCollector().run(db_conn, _http_with(lista, "<html><main></main></html>"))
    assert _q(db_conn, "SELECT count(*) FROM comissao_membros") == [(6,)]


def test_comissao_inativa_ou_ausente_perde_os_membros(db_conn, fixture_text):
    lista = fixture_text("vereadores_lista.html")
    comissoes = fixture_text("comissoes.html")
    VereadoresCollector().run(db_conn, _http_with(lista, comissoes))

    # A 1ª comissão passa a "Inativa": parse marca ativa=False e os membros saem.
    inativa = comissoes.replace("Ativa", "Inativa", 1)
    assert parse_comissoes(inativa)[0].ativa is False
    VereadoresCollector().run(db_conn, _http_with(lista, inativa))
    assert _q(db_conn, "SELECT count(*) FROM comissao_membros") == [(3,)]


def test_email_suspeito_e_descartado():
    from collector_vereadores import clean_email

    assert clean_email("ver.fulano@pousoalegre.mg.leg.br") == "ver.fulano@pousoalegre.mg.leg.br"
    assert clean_email("a@b.com?bcc=x@y.z") is None
    assert clean_email("sem-arroba") is None
    assert clean_email(None) is None
