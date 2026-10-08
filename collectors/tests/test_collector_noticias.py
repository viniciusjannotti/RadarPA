from datetime import datetime, timedelta, timezone

import httpx
import pytest

from base import HttpClient
from collector_noticias import RSS_URL, NoticiasCollector, parse_rss


def test_parse_rss(fixture_text):
    itens = parse_rss(fixture_text("noticias_rss.xml"))
    assert len(itens) == 5
    primeira = itens[0]
    assert primeira.titulo.startswith("Prorrogado o prazo para escolas")
    assert primeira.url == (
        "https://www.pousoalegre.mg.leg.br/comunicacao/noticias/"
        "prorrogado-o-prazo-para-escolas-inscreverem-alunos-para-participar-de-livro-digital-da-camara"
    )
    assert primeira.data_publicacao == datetime(2026, 10, 8, 16, 33, 24, tzinfo=timezone(timedelta(hours=-3)))
    assert primeira.resumo is None  # <description> vazio


def test_parse_rss_usa_link_e_descarta_url_suspeita():
    xml = """<?xml version="1.0"?><rss><channel>
      <item><title>Com link</title><link>https://www.pousoalegre.mg.leg.br/a</link>
            <description>Resumo &lt;b&gt;curto&lt;/b&gt;</description></item>
      <item><title>Fora do site</title><guid>https://evil.example/x</guid></item>
      <item><title>JS</title><guid>javascript:alert(1)</guid></item>
      <item><title></title><guid>https://www.pousoalegre.mg.leg.br/sem-titulo</guid></item>
      <item><title>Sem data</title><guid>https://www.pousoalegre.mg.leg.br/b</guid><pubDate>ontem</pubDate></item>
    </channel></rss>"""
    itens = parse_rss(xml)
    assert [i.titulo for i in itens] == ["Com link", "Sem data"]
    assert itens[0].url == "https://www.pousoalegre.mg.leg.br/a"
    assert itens[0].resumo == "Resumo curto"  # HTML do resumo vira texto
    assert itens[1].data_publicacao is None


def test_parse_rss_invalido_levanta():
    with pytest.raises(ValueError):
        parse_rss("<html>Ops! Algo inesperado aconteceu.</html>")


def _http(text):
    return HttpClient(
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, text=text) if str(r.url) == RSS_URL else httpx.Response(404)
        ),
        min_interval=0,
        sleep=lambda s: None,
    )


def test_collect_upsert_por_url(db_conn, fixture_text):
    rss = fixture_text("noticias_rss.xml")
    for _ in range(2):
        assert NoticiasCollector().run(db_conn, _http(rss)) == 5
    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*), count(DISTINCT url), min(fonte_url) FROM noticias")
        assert cur.fetchone() == (5, 5, RSS_URL)

    # Título corrigido na fonte → atualiza a mesma notícia.
    NoticiasCollector().run(db_conn, _http(rss.replace("Prorrogado o prazo", "PRORROGADO o prazo", 1)))
    with db_conn.cursor() as cur:
        cur.execute("SELECT titulo FROM noticias WHERE titulo LIKE 'PRORROGADO%'")
        assert cur.fetchone() is not None


def test_feed_vazio_falha(db_conn):
    with pytest.raises(ValueError):
        NoticiasCollector().run(db_conn, _http('<?xml version="1.0"?><rss><channel></channel></rss>'))


def test_pubdate_sem_fuso_vira_utc():
    xml = """<?xml version="1.0"?><rss><channel>
      <item><title>X</title><guid>https://www.pousoalegre.mg.leg.br/x</guid>
            <pubDate>Thu, 08 Oct 2026 16:33:24 -0000</pubDate></item>
    </channel></rss>"""
    [n] = parse_rss(xml)
    assert n.data_publicacao == datetime(2026, 10, 8, 16, 33, 24, tzinfo=timezone.utc)
