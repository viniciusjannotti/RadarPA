"""Coletor de proposições.

1. Export CSV do GWLegis (~60 mil proposições desde 1948, uma requisição): upsert
   por (tipo, numero, ano, titulo). O tipo vem do título ("Parecer Nº 1 ao ...").
2. Autoria: o export não traz autor, então percorre a listagem filtrada por
   vereador na legislatura atual e casa pelo título. A listagem também dá o id do
   portal e a situação ("Aprovado"). Diariamente é incremental (para na 1ª página
   sem vínculo novo); a varredura completa (semanal) retoma backfills interrompidos.
3. Liga cada votação à proposição votada quando o documento casa com um título único.
"""

from __future__ import annotations

import csv
import io
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime

from bs4 import BeautifulSoup
from psycopg2.extras import execute_values

from base import Collector, HttpClient
from collector_sessoes import normalize_text
from config import GWLEGIS_BASE

log = logging.getLogger("radarpa")

EXPORT_URL = f"{GWLEGIS_BASE}/exportar-proposicoes?"
_TIPO_RE = re.compile(r"^(.*?)\s+N[ºo°]\s*\d", re.IGNORECASE)
_ID_RE = re.compile(r"/proposicao/(\d+)")
_PG_RE = re.compile(r"[?&]pg=(\d+)")
MAX_PAGINAS_AUTORIA = 60
BATCH = 2000


def autoria_url(vereador_gwlegis_id: int, legislatura: int, page: int) -> str:
    return (
        f"{GWLEGIS_BASE}/proposicoes?autoria=parlamentar_{vereador_gwlegis_id}"
        f"&legislatura={legislatura}&pg={page}"
    )


_CONECTOR_RE = re.compile(r"\s+(?:ao\(à\)|à|ao)\s+")
_NUM_ACESSORIO_RE = re.compile(r"nº\s*0*(\d+)/\d{4}(?= ao )")
_NUM_RE = re.compile(r"nº\s*0*(\d+)")
_NUMERO_VARIANTE_RE = re.compile(r"\bn(?:º|°|o\.?)\s*(?=\d)")  # "Nº", "N°", "No.", "No"
_DOC_SUFIXO_RE = re.compile(r"\s*\(item \d+\)$")


def normalizar_titulo(titulo: str) -> str:
    """Chave de casamento entre as duas grafias do portal: a listagem escreve
    "Substitutivo Nº 1 ao Projeto de Lei Nº 8125/2025" e o export,
    "Substitutivo Nº 01/2026 ao(à) Projeto de Lei Nº 8125/2025"."""
    t = _NUMERO_VARIANTE_RE.sub("nº ", normalize_text(titulo).lower())
    t = _CONECTOR_RE.sub(" ao ", t)
    t = _NUM_ACESSORIO_RE.sub(r"nº \1", t)  # documento acessório: some o "/ano" dele
    return _NUM_RE.sub(r"nº \1", t)  # zeros à esquerda


def indice_de_titulos(cur) -> dict[str, int]:
    """título normalizado → id da proposição; títulos ambíguos ficam de fora."""
    cur.execute("SELECT id, titulo FROM proposicoes")
    idx: dict[str, int | None] = {}
    for pid, titulo in cur.fetchall():
        k = normalizar_titulo(titulo)
        idx[k] = None if k in idx else pid
    return {k: v for k, v in idx.items() if v is not None}


def tipo_do_titulo(titulo: str) -> str:
    m = _TIPO_RE.match(titulo)
    return normalize_text(m.group(1) if m else titulo)


@dataclass(frozen=True)
class ProposicaoRow:
    tipo: str
    numero: int
    ano: int
    titulo: str
    ementa: str | None
    data_protocolo: date | None
    link: str | None

    @property
    def key(self) -> tuple[str, int, int, str]:
        return (self.tipo, self.numero, self.ano, self.titulo)


class ParsedExport(list):
    skipped: int = 0


@dataclass(frozen=True)
class AutoriaPage:
    items: list[tuple[int, str, str | None]]  # (gwlegis_id, titulo, situacao)
    last_page: int


def _date(s: str) -> date | None:
    try:
        return datetime.strptime(s.strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


def parse_export_csv(text: str) -> ParsedExport:
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))  # BOM: chamadores podem não decodificar com utf-8-sig
    faltando = {"Número", "Ano", "Título"} - set(reader.fieldnames or [])
    if faltando:
        raise ValueError(f"export de proposições sem as colunas {sorted(faltando)}")

    by_key: dict[tuple, ProposicaoRow] = {}
    skipped = 0
    for r in reader:
        numero, ano, titulo = r["Número"].strip(), r["Ano"].strip(), normalize_text(r["Título"])
        # Há linhas sem número/ano (ex.: "Autógrafo ao(à) ...") e anos truncados ("25").
        if not (numero.isdigit() and re.fullmatch(r"\d{4}", ano) and titulo):
            skipped += 1
            continue
        row = ProposicaoRow(
            tipo=tipo_do_titulo(titulo),
            numero=int(numero),
            ano=int(ano),
            titulo=titulo,
            ementa=normalize_text(r.get("Ementa") or "") or None,
            data_protocolo=_date(r.get("Data") or ""),
            link=(r.get("Link do Anexo") or "").strip() or None,
        )
        by_key[row.key] = row  # duplicatas exatas existem no export
    result = ParsedExport(by_key.values())
    result.skipped = skipped
    return result


def parse_autoria_listing(html: str) -> AutoriaPage:
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for a in soup.select('span.txt > a[href*="/proposicao/"]'):
        m = _ID_RE.search(a["href"])
        if not m:
            continue
        situacao = a.parent.select_one(".votado")
        items.append(
            (
                int(m.group(1)),
                normalize_text(a.get_text()),
                normalize_text(situacao.get_text()) or None if situacao else None,
            )
        )
    pages = [1]
    pag = soup.select_one("div[paginacao]")
    if pag:
        pages += [int(m.group(1)) for x in pag.select("a[href]") if (m := _PG_RE.search(x["href"]))]
    return AutoriaPage(items=items, last_page=max(pages))


class ProposicoesCollector(Collector):
    name = "collector_proposicoes"

    def __init__(self, autoria_completa: bool = False, max_paginas_autoria: int = MAX_PAGINAS_AUTORIA):
        self.autoria_completa = autoria_completa
        self.max_paginas_autoria = max_paginas_autoria

    def collect(self, conn, http: HttpClient) -> int:
        self.parcial, self.detalhes = False, None
        rows = parse_export_csv(http.get(EXPORT_URL).content.decode("utf-8-sig"))
        if not rows:
            raise ValueError("export de proposições sem linhas válidas")
        with conn.cursor() as cur:
            self._upsert(cur, rows)
        conn.commit()

        notas = []
        if rows.skipped:
            notas.append(f"{rows.skipped} linhas do export sem número/ano")

        vinculos, sem_match, falhas = self._autoria(conn, http)
        notas.append(f"{vinculos} vínculos de autoria novos")
        if sem_match:
            notas.append(f"{sem_match} itens de autoria sem proposição correspondente")
        if falhas:
            self.parcial = True
            notas.append(f"autoria de {falhas} vereadores com falha")

        with conn.cursor() as cur:
            ligadas = self._ligar_votacoes(cur)
        conn.commit()
        notas.append(f"{ligadas} votações ligadas a proposições")

        self.detalhes = "; ".join(notas)
        return len(rows)

    @staticmethod
    def _upsert(cur, rows: list[ProposicaoRow]) -> None:
        for i in range(0, len(rows), BATCH):
            execute_values(
                cur,
                """
                INSERT INTO proposicoes
                    (tipo, numero, ano, titulo, ementa, data_protocolo, link, fonte_url)
                VALUES %s
                ON CONFLICT (tipo, numero, ano, titulo) DO UPDATE SET
                    ementa = EXCLUDED.ementa,
                    data_protocolo = EXCLUDED.data_protocolo,
                    link = EXCLUDED.link,
                    coletado_em = NOW(),
                    atualizado_em = NOW()
                -- Só reescreve o que mudou: evita regravar ~60 mil linhas (e os índices
                -- trigram) a cada execução e mantém atualizado_em significativo.
                WHERE (proposicoes.ementa, proposicoes.data_protocolo, proposicoes.link)
                    IS DISTINCT FROM (EXCLUDED.ementa, EXCLUDED.data_protocolo, EXCLUDED.link)
                """,
                [
                    (r.tipo, r.numero, r.ano, r.titulo, r.ementa, r.data_protocolo, r.link, EXPORT_URL)
                    for r in rows[i : i + BATCH]
                ],
            )

    def _autoria(self, conn, http: HttpClient) -> tuple[int, int, int]:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT v.id, v.gwlegis_id, l.numero,
                       EXTRACT(YEAR FROM l.inicio)::int, EXTRACT(YEAR FROM l.fim)::int
                FROM vereadores v JOIN legislaturas l ON l.id = v.legislatura_id
                WHERE v.status = 'ativo' AND v.gwlegis_id IS NOT NULL
                ORDER BY v.gwlegis_id
                """
            )
            vereadores = cur.fetchall()
        conn.commit()

        with conn.cursor() as cur:
            indice = indice_de_titulos(cur)
        conn.commit()

        vinculos = sem_match = falhas = 0
        for vereador_id, gwlegis_id, legislatura, _ano_ini, _ano_fim in vereadores:
            page, last = 1, None
            try:
                while page <= self.max_paginas_autoria and (last is None or page <= last):
                    listing = parse_autoria_listing(
                        http.get(autoria_url(gwlegis_id, legislatura, page)).text
                    )
                    last = listing.last_page
                    novos = 0
                    with conn.cursor() as cur:
                        for pid, titulo, situacao in listing.items:
                            r = self._vincular(cur, indice, vereador_id, pid, titulo, situacao)
                            if r is None:
                                sem_match += 1
                            else:
                                novos += r
                    conn.commit()
                    vinculos += novos
                    # Itens sem proposição correspondente não contam como novidade de
                    # propósito: muitos nunca vão casar (não estão no export) e fariam a
                    # coleta diária varrer todas as páginas. A varredura de domingo cobre.
                    if not novos and not self.autoria_completa:
                        break
                    page += 1
            except Exception as exc:
                conn.rollback()
                falhas += 1
                log.warning("autoria do vereador %s falhou na página %s: %s", gwlegis_id, page, exc)
        return vinculos, sem_match, falhas

    @staticmethod
    def _vincular(cur, indice, vereador_id, gwlegis_id, titulo, situacao) -> int | None:
        """1 = vínculo novo, 0 = já existia, None = proposição não encontrada/ambígua."""
        proposicao_id = indice.get(normalizar_titulo(titulo))
        if proposicao_id is None:
            return None
        # O id do portal pertence a esta proposição; se estava em outra, sai de lá.
        cur.execute(
            "UPDATE proposicoes SET gwlegis_id = NULL WHERE gwlegis_id = %s AND id <> %s",
            (gwlegis_id, proposicao_id),
        )
        cur.execute(
            "UPDATE proposicoes SET gwlegis_id = %s, status = COALESCE(%s, status) WHERE id = %s",
            (gwlegis_id, situacao, proposicao_id),
        )
        cur.execute(
            "INSERT INTO proposicao_autores (proposicao_id, vereador_id, tipo) VALUES (%s, %s, 'autor') "
            "ON CONFLICT (proposicao_id, vereador_id, tipo) DO NOTHING",
            (proposicao_id, vereador_id),
        )
        return cur.rowcount

    @staticmethod
    def _ligar_votacoes(cur) -> int:
        """Liga votações ainda sem proposição pelo documento votado:
        "Projeto de Lei Nº 8412/2026 — 2ª Votação (item 3)" → "Projeto de Lei Nº 8412/2026"."""
        cur.execute("SELECT id, descricao FROM votacoes WHERE proposicao_id IS NULL")
        pendentes = cur.fetchall()
        if not pendentes:
            return 0
        indice = indice_de_titulos(cur)
        pares = []
        for votacao_id, descricao in pendentes:
            doc = _DOC_SUFIXO_RE.sub("", descricao.split(" — ", 1)[0])
            proposicao_id = indice.get(normalizar_titulo(doc))
            if proposicao_id is not None:
                pares.append((proposicao_id, votacao_id))
        if pares:
            execute_values(
                cur,
                "UPDATE votacoes v SET proposicao_id = d.pid FROM (VALUES %s) AS d(pid, vid) WHERE v.id = d.vid",
                pares,
            )
        return len(pares)

if __name__ == "__main__":
    import sys

    from run_all import run_single

    run_single(ProposicoesCollector(autoria_completa="--completo" in sys.argv))
