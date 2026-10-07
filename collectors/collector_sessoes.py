"""Coletor de sessões plenárias.

1. Importa o export CSV do GWLegis (todas as sessões desde 2000) com upsert por
   (numero, tipo, ano).
2. O CSV não traz o ID interno do GWLegis (necessário para pauta/boletins), então
   percorre a listagem HTML paginada (mais recente primeiro) e casa id ↔ sessão pelo
   título normalizado. Continua paginando enquanto existir sessão sem id mais antiga
   que a mais antiga da página atual — assim um backfill interrompido é retomado, e
   uma sessão nova ainda não listada não força varrer todas as páginas.
"""

from __future__ import annotations

import csv
import io
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from psycopg2.extras import execute_values

from base import Collector, HttpClient
from config import GWLEGIS_BASE

log = logging.getLogger("radarpa")

SP = ZoneInfo("America/Sao_Paulo")
EXPORT_URL = f"{GWLEGIS_BASE}/exportar-sessoes-plenarias?"
_ID_RE = re.compile(r"/sessao-plenaria/(\d+)")
_PG_RE = re.compile(r"[?&]pg=(\d+)")
_NUMERO_RE = re.compile(r"^(\d+)/(\d{4})$")


def listing_url(page: int) -> str:
    return f"{GWLEGIS_BASE}/sessoes-plenarias?pg={page}"


def session_url(gwlegis_id: int) -> str:
    return f"{GWLEGIS_BASE}/sessao-plenaria/{gwlegis_id}"


def normalize_text(s: str) -> str:
    """Colapsa qualquer espaço (inclusive nbsp) — o CSV e o HTML diferem nisso."""
    return " ".join(s.split())


@dataclass(frozen=True)
class SessaoRow:
    numero: int
    ano: int
    tipo: str
    data_inicio: datetime
    data_fim: datetime | None
    status: str
    titulo: str

    @property
    def key(self) -> tuple[int, str, int]:
        return (self.numero, self.tipo, self.ano)


class ParsedExport(list):
    """Lista de SessaoRow com a contagem de linhas descartadas."""

    skipped: int = 0


@dataclass(frozen=True)
class ListingPage:
    items: list[tuple[int, str]]
    last_page: int


def _parse_dt(value: str) -> datetime | None:
    value = value.strip()
    if not value:
        return None
    return datetime.strptime(value, "%d/%m/%Y %H:%M").replace(tzinfo=SP)


def parse_export_csv(text: str) -> ParsedExport:
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    by_key: dict[tuple[int, str, int], SessaoRow] = {}
    skipped = 0
    for line_no, r in enumerate(reader, start=2):
        try:
            m = _NUMERO_RE.match(r["Número"].strip())
            inicio = _parse_dt(r["Início"])
            if not m or inicio is None:
                raise ValueError("número ou início inválido")
            row = SessaoRow(
                numero=int(m.group(1)),
                ano=int(m.group(2)),
                tipo=normalize_text(r["Tipo"]),
                data_inicio=inicio,
                data_fim=_parse_dt(r["Término"] or ""),
                status=normalize_text(r["Status"]),
                titulo=normalize_text(r["Título"]),
            )
        except (ValueError, KeyError, AttributeError) as exc:
            skipped += 1
            log.warning("linha %d do export de sessões ignorada: %s", line_no, exc)
            continue
        # A mesma chave repetida no export derrubaria o INSERT ... ON CONFLICT do lote.
        by_key[row.key] = row

    result = ParsedExport(by_key.values())
    result.skipped = skipped
    return result


def parse_listing(html: str) -> ListingPage:
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for a in soup.select('span.txt > a[href*="/sessao-plenaria/"]'):
        m = _ID_RE.search(a["href"])
        if m:
            items.append((int(m.group(1)), normalize_text(a.get_text())))

    pages = [1]
    pag = soup.select_one("div[paginacao]")
    if pag:
        pages += [int(m.group(1)) for a in pag.select("a[href]") if (m := _PG_RE.search(a["href"]))]
    return ListingPage(items=items, last_page=max(pages))


class SessoesCollector(Collector):
    name = "collector_sessoes"

    def __init__(self, max_pages: int | None = None):
        self.max_pages = max_pages

    def collect(self, conn, http: HttpClient) -> int:
        self.parcial, self.detalhes = False, None
        resp = http.get(EXPORT_URL)
        rows = parse_export_csv(resp.content.decode("utf-8-sig"))
        self._upsert(conn, rows)
        conn.commit()

        notas = []
        if rows.skipped:
            notas.append(f"{rows.skipped} linhas do export ignoradas")
        try:
            resolvidos, paginas = self._resolve_ids(conn, http)
            notas.append(f"{resolvidos} ids resolvidos em {paginas} páginas")
        except Exception as exc:  # o import do CSV já foi gravado; registra como parcial
            conn.rollback()
            self.parcial = True
            notas.append(f"falha ao resolver ids: {type(exc).__name__}: {exc}")
            log.warning("collector_sessoes: resolução de ids falhou: %s", exc)
        self.detalhes = "; ".join(notas)
        return len(rows)

    @staticmethod
    def _upsert(conn, rows: list[SessaoRow]) -> None:
        if not rows:
            return
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO sessoes
                    (numero, ano, tipo, data_inicio, data_fim, status, titulo, fonte_url)
                VALUES %s
                ON CONFLICT (numero, tipo, ano) DO UPDATE SET
                    data_inicio = EXCLUDED.data_inicio,
                    data_fim    = EXCLUDED.data_fim,
                    status      = EXCLUDED.status,
                    titulo      = EXCLUDED.titulo,
                    coletado_em = NOW()
                """,
                [
                    (r.numero, r.ano, r.tipo, r.data_inicio, r.data_fim, r.status, r.titulo, EXPORT_URL)
                    for r in rows
                ],
            )

    def _resolve_ids(self, conn, http: HttpClient) -> tuple[int, int]:
        """Devolve (ids gravados, páginas visitadas)."""
        page, last, total = 1, None, 0
        while (self.max_pages is None or page <= self.max_pages) and (last is None or page <= last):
            listing = parse_listing(http.get(listing_url(page)).text)
            last = listing.last_page
            with conn.cursor() as cur:
                total += sum(self._assign(cur, gid, titulo) for gid, titulo in listing.items)
                more = self._has_older_unresolved(cur, [gid for gid, _ in listing.items])
            conn.commit()
            if not more:
                break
            page += 1
        return total, page

    @staticmethod
    def _assign(cur, gwlegis_id: int, titulo: str) -> int:
        cur.execute("SELECT id, gwlegis_id FROM sessoes WHERE titulo = %s", (titulo,))
        matches = cur.fetchall()
        if len(matches) != 1:
            if len(matches) > 1:
                log.warning("título ambíguo na listagem, ignorado: %r", titulo)
            return 0
        sessao_id, atual = matches[0]
        if atual == gwlegis_id:
            return 0
        # A listagem é a fonte da verdade: se outro registro tinha esse id, ele o perde.
        cur.execute(
            "UPDATE sessoes SET gwlegis_id = NULL WHERE gwlegis_id = %s AND id <> %s",
            (gwlegis_id, sessao_id),
        )
        cur.execute(
            "UPDATE sessoes SET gwlegis_id = %s, fonte_url = %s WHERE id = %s",
            (gwlegis_id, session_url(gwlegis_id), sessao_id),
        )
        return 1

    @staticmethod
    def _has_older_unresolved(cur, page_ids: list[int]) -> bool:
        """Há sessão sem id mais antiga que a sessão mais antiga desta página?

        Se nenhuma sessão da página casou, não dá para saber onde estamos: continua.
        """
        if not page_ids:
            return False
        cur.execute(
            "SELECT min(data_inicio) FROM sessoes WHERE gwlegis_id = ANY(%s)", (page_ids,)
        )
        (oldest,) = cur.fetchone()
        if oldest is None:
            cur.execute("SELECT EXISTS (SELECT 1 FROM sessoes WHERE gwlegis_id IS NULL)")
        else:
            cur.execute(
                "SELECT EXISTS (SELECT 1 FROM sessoes WHERE gwlegis_id IS NULL "
                "AND data_inicio < %s)",
                (oldest,),
            )
        return cur.fetchone()[0]


if __name__ == "__main__":
    from run_all import run_single

    run_single(SessoesCollector())
