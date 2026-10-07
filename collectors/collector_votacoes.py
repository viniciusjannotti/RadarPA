"""Coletor de votações (boletim unificado) e presença por sessão.

Os boletins em CSV só existem a partir de 2026 e os ids deles não são o id da
sessão: o coletor abre a página de cada sessão para achar os links. Visita apenas
sessões nunca verificadas ou recentes (o boletim pode ser corrigido dias depois).

No boletim de votação os vereadores aparecem abreviados ("Davi A.", "Rogerinho P.");
`abbreviate` reproduz a regra do portal para casar com os nomes cadastrados.
"""

from __future__ import annotations

import csv
import io
import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from base import Collector, HttpClient
from collector_sessoes import normalize_text, session_url
from config import GWLEGIS_BASE

log = logging.getLogger("radarpa")

SP = ZoneInfo("America/Sao_Paulo")
BOLETINS_DESDE = datetime(2026, 1, 1, tzinfo=SP)  # sessões anteriores não têm boletim
RECHECK_DIAS = 14
MAX_SESSOES_POR_EXECUCAO = 80

_VOTACAO_RE = re.compile(r"/doc/boletim-votacao-unificado/(\d+)")
_PRESENCA_RE = re.compile(r"/doc/boletim-presenca/(\d+)")
_STOPWORDS = {"da", "de", "do", "das", "dos", "e"}

# Coluna do CSV → valor gravado em votos.voto
CATEGORIAS = {
    "Votos Favoráveis": "sim",
    "Votos Contrários": "nao",
    "Votos Não votou": "nao_votou",
    "Vereadores Ausentes": "ausente",
    "Vereadores Ausentes do Plenário": "ausente_plenario",
    "Vereadores Ausentes na votação": "ausente_votacao",
}


def votacao_url(doc_id: int) -> str:
    return f"{GWLEGIS_BASE}/doc/boletim-votacao-unificado/{doc_id}?ocultar_dados_oficio_sigiloso=1&formato=csv"


def presenca_url(doc_id: int) -> str:
    return f"{GWLEGIS_BASE}/doc/boletim-presenca/{doc_id}?formato=csv"


def abbreviate(nome: str) -> str:
    """'Rogerinho da Policlínica' → 'Rogerinho P.'; nomes de uma palavra ficam iguais."""
    tokens = normalize_text(nome).split(" ")
    if len(tokens) == 1:
        return tokens[0]
    nxt = next((t for t in tokens[1:] if t.lower() not in _STOPWORDS), tokens[1])
    return f"{tokens[0]} {nxt[0].upper()}."


def build_abbrev_map(nomes_por_id: dict[int, str | list[str]]) -> dict[str, int]:
    """Abreviação → id do vereador. Cada vereador pode ter vários nomes (parlamentar e
    civil); só é ambígua a abreviação que aponta para vereadores diferentes."""
    seen: dict[str, int | None] = {}
    for vid, nomes in nomes_por_id.items():
        for nome in [nomes] if isinstance(nomes, str) else nomes:
            ab = abbreviate(nome)
            if ab in seen and seen[ab] != vid:
                seen[ab] = None
            elif ab not in seen:
                seen[ab] = vid
    return {ab: vid for ab, vid in seen.items() if vid is not None}


@dataclass(frozen=True)
class SessionDocs:
    votacao_id: int | None
    presenca_id: int | None


@dataclass
class VotacaoRow:
    ordem: int | None
    documento: str
    autoria: str | None
    assunto: str | None
    legenda: str | None
    resultado: str | None
    tipo_aprovacao: str | None
    tipo_votacao: str | None
    data: datetime | None
    votos: dict[str, list[str]] = field(default_factory=dict)
    sufixo: str = ""  # " (item N)" quando o mesmo documento+legenda se repete na sessão

    @property
    def descricao(self) -> str:
        base = f"{self.documento} — {self.legenda}" if self.legenda else self.documento
        return base + self.sufixo


def parse_session_docs(html: str) -> SessionDocs:
    soup = BeautifulSoup(html, "html.parser")
    votacao = presenca = None
    for a in soup.select('a[href*="/doc/"]'):
        href = a["href"]
        if votacao is None and (m := _VOTACAO_RE.search(href)):
            votacao = int(m.group(1))
        if presenca is None and (m := _PRESENCA_RE.search(href)):
            presenca = int(m.group(1))
    return SessionDocs(votacao, presenca)


def _rows(text: str, required: set[str]) -> list[dict[str, str]]:
    """Linhas do CSV; erro se faltar coluna esperada (ex.: o portal devolveu HTML de erro)."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")), delimiter=";")
    faltando = required - set(reader.fieldnames or [])
    if faltando:
        raise ValueError(f"boletim sem as colunas {sorted(faltando)}")
    return list(reader)


def _opt(s: str | None) -> str | None:
    s = normalize_text(s or "")
    return s or None


def _names(s: str | None) -> list[str]:
    return [n for n in (normalize_text(x) for x in (s or "").split(",")) if n]


def _data_votacao(data: str, horario: str) -> datetime | None:
    try:
        return datetime.strptime(f"{data.strip()} {horario.strip()}", "%d/%m/%Y %Hh%M").replace(tzinfo=SP)
    except ValueError:
        return None


def parse_votacao_csv(text: str) -> list[VotacaoRow]:
    result = []
    for r in _rows(text, {"Documento", "Ordem", "Resultado"}):
        documento = _opt(r.get("Documento"))
        if not documento:
            continue
        ordem = r.get("Ordem", "").strip()
        result.append(
            VotacaoRow(
                ordem=int(ordem) if ordem.isdigit() else None,
                documento=documento,
                autoria=_opt(r.get("Autoria")),
                assunto=_opt(r.get("Assunto")),
                legenda=_opt(r.get("Legenda")),
                resultado=_opt(r.get("Resultado")),
                tipo_aprovacao=_opt(r.get("Tipo de Aprovação")),
                tipo_votacao=_opt(r.get("Tipo de Votação")),
                data=_data_votacao(r.get("Data", ""), r.get("Horário", "")),
                votos={cat: _names(r.get(col)) for col, cat in CATEGORIAS.items()},
            )
        )
    # descricao é a chave única por sessão: itens repetidos ganham o número na pauta.
    repetidas = Counter(r.descricao for r in result)
    for r in result:
        if repetidas[r.descricao] > 1:
            r.sufixo = f" (item {r.ordem})"
    return result


def parse_presenca_csv(text: str) -> list[tuple[str, str]]:
    return [
        (normalize_text(r["Parlamentar"]), normalize_text(r["Status"]).upper())
        for r in _rows(text, {"Parlamentar", "Status"})
        if r.get("Parlamentar")
    ]


class VotacoesCollector(Collector):
    name = "collector_votacoes"

    def __init__(
        self,
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        max_sessoes: int = MAX_SESSOES_POR_EXECUCAO,
    ):
        self.now = now
        self.max_sessoes = max_sessoes

    def collect(self, conn, http: HttpClient) -> int:
        self.parcial, self.detalhes = False, None
        now = self.now()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, gwlegis_id FROM sessoes
                WHERE gwlegis_id IS NOT NULL
                  AND data_inicio >= %s AND data_inicio <= %s
                  AND (boletins_verificados_em IS NULL OR data_inicio >= %s)
                ORDER BY data_inicio DESC  -- recentes primeiro: pendências antigas não travam a fila
                LIMIT %s
                """,
                (BOLETINS_DESDE, now, now - timedelta(days=RECHECK_DIAS), self.max_sessoes),
            )
            sessoes = cur.fetchall()
            # Boletins usam ora o nome parlamentar, ora o civil (início de 2026).
            cur.execute("SELECT id, nome_parlamentar, nome FROM vereadores")
            nomes = {vid: [parl, civil] for vid, parl, civil in cur.fetchall()}
        conn.commit()

        por_abrev = build_abbrev_map(nomes)
        por_nome = {normalize_text(n): vid for vid, ns in nomes.items() for n in ns}
        desconhecidos: set[str] = set()
        gravadas = falhas = 0

        for sessao_id, gwlegis_id in sessoes:
            try:
                docs = parse_session_docs(http.get(session_url(gwlegis_id)).text)
                nesta: set[str] = set()
                with conn.cursor() as cur:
                    if docs.votacao_id is not None:
                        rows = parse_votacao_csv(http.get(votacao_url(docs.votacao_id)).text)
                        if not rows:  # nunca substituir dados bons por um boletim vazio
                            raise ValueError("boletim de votação sem linhas")
                        self._replace_votacoes(cur, sessao_id, rows, docs.votacao_id, por_abrev, nesta)
                    if docs.presenca_id is not None:
                        presencas = parse_presenca_csv(http.get(presenca_url(docs.presenca_id)).text)
                        if not presencas:
                            raise ValueError("boletim de presença sem linhas")
                        self._replace_presencas(cur, sessao_id, presencas, docs.presenca_id, por_nome, nesta)
                    # Com nome não reconhecido, a sessão volta na próxima execução
                    # (dados incompletos até o nome ser mapeado em nomes_civis.py).
                    if not nesta:
                        cur.execute(
                            "UPDATE sessoes SET boletins_verificados_em = %s WHERE id = %s",
                            (now, sessao_id),
                        )
                desconhecidos |= nesta
                conn.commit()
                if docs.votacao_id is not None or docs.presenca_id is not None:
                    gravadas += 1
            except Exception as exc:
                conn.rollback()
                falhas += 1
                log.warning("boletins da sessão %s falharam: %s", gwlegis_id, exc)

        notas = [f"{len(sessoes)} sessões verificadas"]
        if desconhecidos:
            notas.append(f"nomes não reconhecidos: {', '.join(sorted(desconhecidos))}")
        if falhas:
            self.parcial = True
            notas.append(f"{falhas} sessões com falha (serão tentadas de novo)")
        self.detalhes = "; ".join(notas)
        return gravadas

    @staticmethod
    def _replace_votacoes(cur, sessao_id, rows, doc_id, por_abrev, desconhecidos) -> None:
        fonte = votacao_url(doc_id)
        ids = []
        for r in rows:
            cur.execute(
                """
                INSERT INTO votacoes (sessao_id, descricao, ordem, legenda, autoria, assunto,
                    resultado, tipo_aprovacao, tipo_votacao, data, fonte_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (sessao_id, descricao) DO UPDATE SET
                    ordem = EXCLUDED.ordem, legenda = EXCLUDED.legenda,
                    autoria = EXCLUDED.autoria, assunto = EXCLUDED.assunto,
                    resultado = EXCLUDED.resultado, tipo_aprovacao = EXCLUDED.tipo_aprovacao,
                    tipo_votacao = EXCLUDED.tipo_votacao, data = EXCLUDED.data,
                    fonte_url = EXCLUDED.fonte_url, coletado_em = NOW()
                RETURNING id
                """,
                (sessao_id, r.descricao, r.ordem, r.legenda, r.autoria, r.assunto, r.resultado,
                 r.tipo_aprovacao, r.tipo_votacao, r.data, fonte),
            )
            votacao_id = cur.fetchone()[0]
            ids.append(votacao_id)
            cur.execute("DELETE FROM votos WHERE votacao_id = %s", (votacao_id,))
            for categoria, nomes in r.votos.items():
                for nome in nomes:
                    vid = por_abrev.get(nome)
                    if vid is None:
                        desconhecidos.add(nome)
                        continue
                    cur.execute(
                        "INSERT INTO votos (votacao_id, vereador_id, voto, fonte_url) "
                        "VALUES (%s, %s, %s, %s) ON CONFLICT (votacao_id, vereador_id) DO NOTHING",
                        (votacao_id, vid, categoria, fonte),
                    )
        # Itens que saíram do boletim (correção na fonte) saem daqui também.
        cur.execute(
            "DELETE FROM votos WHERE votacao_id IN "
            "(SELECT id FROM votacoes WHERE sessao_id = %s AND NOT (id = ANY(%s)))",
            (sessao_id, ids),
        )
        cur.execute("DELETE FROM votacoes WHERE sessao_id = %s AND NOT (id = ANY(%s))", (sessao_id, ids))

    @staticmethod
    def _replace_presencas(cur, sessao_id, presencas, doc_id, por_nome, desconhecidos) -> None:
        fonte = presenca_url(doc_id)
        cur.execute("DELETE FROM sessao_presencas WHERE sessao_id = %s", (sessao_id,))
        for nome, situacao in presencas:
            vid = por_nome.get(nome)
            if vid is None:
                desconhecidos.add(nome)
                continue
            cur.execute(
                "INSERT INTO sessao_presencas (sessao_id, vereador_id, presente, situacao, fonte_url) "
                "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (sessao_id, vereador_id) DO NOTHING",
                (sessao_id, vid, situacao == "PRESENTE", situacao, fonte),
            )


if __name__ == "__main__":
    from run_all import run_single

    run_single(VotacoesCollector())
