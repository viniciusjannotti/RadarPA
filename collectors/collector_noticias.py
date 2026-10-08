"""Coletor de notícias do site institucional (RSS 2.0 do Plone), para o Dashboard.

O feed traz as ~25 notícias mais recentes. Usa <link> se houver; o feed do Plone
hoje só traz a URL em <guid>. Upsert por URL; só aceita https do próprio site.
"""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET  # expat do Python 3.12 não expande entidades externas
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from base import Collector, HttpClient
from collector_sessoes import normalize_text
from config import SITE_BASE

log = logging.getLogger("radarpa")

RSS_URL = f"{SITE_BASE}/rss.xml"
SITE_HOST = urlsplit(SITE_BASE).hostname


@dataclass(frozen=True)
class NoticiaRow:
    titulo: str
    url: str
    data_publicacao: datetime | None
    resumo: str | None


def _texto(el: ET.Element | None) -> str:
    return normalize_text(el.text or "") if el is not None else ""


def _url_do_site(raw: str) -> str | None:
    parts = urlsplit(raw.strip())
    return raw.strip() if parts.scheme == "https" and parts.hostname == SITE_HOST else None


def _data(raw: str) -> datetime | None:
    try:
        dt = parsedate_to_datetime(raw) if raw else None
    except (TypeError, ValueError):
        return None
    # "-0000" (fuso desconhecido) vira datetime ingênuo; trata como UTC em vez de
    # deixar o Postgres interpretar no fuso da sessão.
    if dt is not None and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def parse_rss(xml: str) -> list[NoticiaRow]:
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise ValueError(f"RSS inválido: {exc}") from exc
    channel = root.find("channel")
    if root.tag != "rss" or channel is None:
        raise ValueError("documento não é um RSS 2.0")

    itens = []
    for item in channel.findall("item"):
        titulo = _texto(item.find("title"))
        url = _url_do_site(_texto(item.find("link")) or _texto(item.find("guid")))
        if not titulo or not url:
            continue
        resumo_html = _texto(item.find("description"))
        resumo = normalize_text(BeautifulSoup(resumo_html, "html.parser").get_text(" ")) if resumo_html else ""
        itens.append(
            NoticiaRow(
                titulo=titulo,
                url=url,
                data_publicacao=_data(_texto(item.find("pubDate"))),
                resumo=resumo or None,
            )
        )
    return itens


class NoticiasCollector(Collector):
    name = "collector_noticias"

    def collect(self, conn, http: HttpClient) -> int:
        self.parcial, self.detalhes = False, None
        itens = parse_rss(http.get(RSS_URL).content.decode("utf-8"))
        if not itens:
            raise ValueError("RSS sem notícias válidas")
        with conn.cursor() as cur:
            for n in itens:
                cur.execute(
                    """
                    INSERT INTO noticias (titulo, url, data_publicacao, resumo, fonte_url)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (url) DO UPDATE SET
                        titulo = EXCLUDED.titulo,
                        data_publicacao = EXCLUDED.data_publicacao,
                        resumo = EXCLUDED.resumo,
                        coletado_em = NOW()
                    """,
                    (n.titulo, n.url, n.data_publicacao, n.resumo, RSS_URL),
                )
        return len(itens)


if __name__ == "__main__":
    from run_all import run_single

    run_single(NoticiasCollector())
