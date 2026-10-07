"""Coletor de vereadores, Mesa Diretora e comissões (scraping HTML leve, semanal).

- /vereadores: legislatura atual + cards com id, foto, nome parlamentar, partido,
  status e cargo na Mesa (quando houver).
- /vereador/{id}: só o e-mail (ofuscado pelo Cloudflare em data-cfemail).
- /comissoes: comissões da legislatura atual com seus membros.

Mesa e membros de comissão são substituídos a cada coleta para refletir a fonte.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from base import Collector, HttpClient
from collector_sessoes import normalize_text
from config import GWLEGIS_BASE
from nomes_civis import NOMES_CIVIS

log = logging.getLogger("radarpa")

VEREADORES_URL = f"{GWLEGIS_BASE}/vereadores"
COMISSOES_URL = f"{GWLEGIS_BASE}/comissoes"
_VEREADOR_ID_RE = re.compile(r"/vereador/(\d+)")
_COMISSAO_ID_RE = re.compile(r"/comissao/(\d+)")
_LEGISLATURA_RE = re.compile(r"(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})")
# Endereço simples, sem query (?cc=, ?bcc=) nem separadores que virariam parâmetros no mailto:.
_EMAIL_RE = re.compile(r"[^@\s?&,;<>\"']+@[^@\s?&,;<>\"']+\.[^@\s?&,;<>\"']+")


def perfil_url(gwlegis_id: int) -> str:
    return f"{GWLEGIS_BASE}/vereador/{gwlegis_id}"


@dataclass(frozen=True)
class LegislaturaInfo:
    numero: int  # id da legislatura no portal
    inicio: date
    fim: date
    descricao: str


@dataclass(frozen=True)
class VereadorInfo:
    gwlegis_id: int
    nome_parlamentar: str
    partido: str
    foto_url: str | None
    cargo_mesa: str | None
    status: str


@dataclass(frozen=True)
class VereadoresPage:
    legislatura: LegislaturaInfo
    vereadores: list[VereadorInfo]


@dataclass(frozen=True)
class PerfilInfo:
    email: str | None


@dataclass(frozen=True)
class MembroInfo:
    vereador_gwlegis_id: int
    cargo: str


@dataclass(frozen=True)
class ComissaoInfo:
    gwlegis_id: int
    sigla: str
    nome: str
    tipo: str
    ativa: bool
    membros: list[MembroInfo] = field(default_factory=list)


def decode_cfemail(encoded: str) -> str | None:
    """Desfaz a ofuscação de e-mail do Cloudflare (XOR com o primeiro byte)."""
    try:
        key = int(encoded[:2], 16)
        chars = [chr(int(encoded[i : i + 2], 16) ^ key) for i in range(2, len(encoded), 2)]
    except ValueError:
        return None
    email = "".join(chars)
    return email if "@" in email else None


def clean_email(email: str | None) -> str | None:
    email = (email or "").strip()
    return email if _EMAIL_RE.fullmatch(email) else None


def _parse_br_date(s: str) -> date:
    return datetime.strptime(s, "%d/%m/%Y").date()


def parse_vereadores(html: str) -> VereadoresPage:
    soup = BeautifulSoup(html, "html.parser")

    titulo = soup.select_one("div[lista-legislaturas] .titulo-legislatura")
    descricao = normalize_text(titulo.get_text(" ")).replace("Legislatura:", "").strip()
    m = _LEGISLATURA_RE.search(descricao)
    if not m:
        raise ValueError(f"legislatura não reconhecida: {descricao!r}")
    inicio, fim = _parse_br_date(m.group(1)), _parse_br_date(m.group(2))

    option = soup.select_one("select option[selected]") or next(
        (o for o in soup.select("select option") if normalize_text(o.get_text()) == descricao),
        None,
    )
    if option is None or not option.get("value", "").isdigit():
        raise ValueError("id da legislatura não encontrado")

    vereadores = []
    for card in soup.select("div[lista-vereadores] a.vereador[href]"):
        vid = _VEREADOR_ID_RE.search(card["href"])
        nome = card.select_one("[nome]")
        if not vid or not nome:
            continue
        cargo = card.select_one(".cargo")
        img = card.select_one("img[src]")
        partido = card.select_one("[partido]")
        status = card.select_one(".status")
        vereadores.append(
            VereadorInfo(
                gwlegis_id=int(vid.group(1)),
                nome_parlamentar=normalize_text(nome.get_text()),
                partido=normalize_text(partido.get_text()) if partido else "",
                foto_url=urljoin(GWLEGIS_BASE + "/", img["src"]) if img else None,
                cargo_mesa=(normalize_text(cargo.get_text()) or None) if cargo else None,
                status=normalize_text(status.get_text()).lower() if status else "ativo",
            )
        )

    return VereadoresPage(
        legislatura=LegislaturaInfo(int(option["value"]), inicio, fim, descricao),
        vereadores=vereadores,
    )


def parse_perfil(html: str) -> PerfilInfo:
    soup = BeautifulSoup(html, "html.parser")
    for topico in soup.select("div[topico]"):
        if "Email" in topico.get_text():
            cf = topico.select_one("[data-cfemail]")
            if cf:
                return PerfilInfo(email=clean_email(decode_cfemail(cf["data-cfemail"])))
            mailto = topico.select_one('a[href^="mailto:"]')
            if mailto:
                return PerfilInfo(email=clean_email(mailto["href"][len("mailto:") :]))
    return PerfilInfo(email=None)


def parse_comissoes(html: str) -> list[ComissaoInfo]:
    soup = BeautifulSoup(html, "html.parser")
    result = []
    for link in soup.select('div[item] > div[titulo] span.txt > a[href*="/comissao/"]'):
        cid = _COMISSAO_ID_RE.search(link["href"])
        if not cid:
            continue
        item = link.find_parent("div", attrs={"item": True})
        titulo = normalize_text(link.get_text())
        sigla, _, nome = titulo.partition(" - ")
        if not nome:
            sigla, nome = "", titulo

        tipo = ""
        for d in item.select("div[detalhes] > div"):
            if "Tipo:" in d.get_text():
                tipo = normalize_text(d.select_one("span").get_text())

        situacao = item.select_one("span.txt .votado")
        membros = []
        for a in item.select("div[box-membros] a[href]"):
            vid = _VEREADOR_ID_RE.search(a["href"])
            if not vid:
                continue
            cargo_el = a.select_one("[cargo]")
            cargo = normalize_text(cargo_el.get_text()).lower() if cargo_el else ""
            membros.append(MembroInfo(int(vid.group(1)), cargo or "membro"))

        result.append(
            ComissaoInfo(
                gwlegis_id=int(cid.group(1)),
                sigla=sigla.strip(),
                nome=nome.strip(),
                tipo=tipo or "Permanente",
                # "Inativa" também contém "ativa": compara o texto inteiro.
                ativa=situacao is not None and normalize_text(situacao.get_text()).lower() == "ativa",
                membros=membros,
            )
        )
    return result


class VereadoresCollector(Collector):
    name = "collector_vereadores"

    def collect(self, conn, http: HttpClient) -> int:
        self.parcial, self.detalhes = False, None
        page = parse_vereadores(http.get(VEREADORES_URL).text)
        comissoes = parse_comissoes(http.get(COMISSOES_URL).text)
        # Página que parseia vazia = HTML do portal mudou. Falhar evita apagar Mesa/comissões.
        if not page.vereadores:
            raise ValueError("nenhum vereador reconhecido na listagem (layout do portal mudou?)")
        if not comissoes:
            raise ValueError("nenhuma comissão reconhecida (layout do portal mudou?)")

        emails: dict[int, str | None] = {}
        falhas = 0
        for v in page.vereadores:
            try:
                emails[v.gwlegis_id] = parse_perfil(http.get(perfil_url(v.gwlegis_id)).text).email
            except Exception as exc:  # um perfil fora do ar não invalida o resto
                falhas += 1
                log.warning("perfil do vereador %s falhou: %s", v.gwlegis_id, exc)

        with conn.cursor() as cur:
            leg_id = self._upsert_legislatura(cur, page.legislatura)
            ids = {v.gwlegis_id: self._upsert_vereador(cur, v, emails, leg_id) for v in page.vereadores}
            # Quem saiu da listagem (renúncia, fim de legislatura) deixa de aparecer como ativo.
            cur.execute(
                "UPDATE vereadores SET status = 'inativo', atualizado_em = NOW() "
                "WHERE gwlegis_id IS NOT NULL AND NOT (gwlegis_id = ANY(%s)) AND status <> 'inativo'",
                (list(ids),),
            )
            self._replace_mesa(cur, page.vereadores, ids, leg_id)
            self._replace_comissoes(cur, comissoes, ids)

        notas = [f"{len(comissoes)} comissões"]
        if falhas:
            self.parcial = True
            notas.append(f"{falhas} perfis com falha (e-mail não atualizado)")
        self.detalhes = "; ".join(notas)
        return len(page.vereadores)

    @staticmethod
    def _upsert_legislatura(cur, leg: LegislaturaInfo) -> int:
        cur.execute(
            """
            INSERT INTO legislaturas (numero, inicio, fim, descricao) VALUES (%s, %s, %s, %s)
            ON CONFLICT (numero) DO UPDATE SET
                inicio = EXCLUDED.inicio, fim = EXCLUDED.fim, descricao = EXCLUDED.descricao
            RETURNING id
            """,
            (leg.numero, leg.inicio, leg.fim, leg.descricao),
        )
        return cur.fetchone()[0]

    @staticmethod
    def _upsert_vereador(cur, v: VereadorInfo, emails: dict[int, str | None], leg_id: int) -> int:
        # Sem perfil coletado nesta rodada, mantém o e-mail que já estava no banco.
        has_email = v.gwlegis_id in emails
        cur.execute(
            """
            INSERT INTO vereadores
                (gwlegis_id, nome, nome_parlamentar, partido, foto_url, email, status,
                 legislatura_id, fonte_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (gwlegis_id) DO UPDATE SET
                nome = EXCLUDED.nome,
                nome_parlamentar = EXCLUDED.nome_parlamentar,
                partido = EXCLUDED.partido,
                foto_url = EXCLUDED.foto_url,
                email = CASE WHEN %s THEN EXCLUDED.email ELSE vereadores.email END,
                status = EXCLUDED.status,
                legislatura_id = EXCLUDED.legislatura_id,
                fonte_url = EXCLUDED.fonte_url,
                coletado_em = NOW(),
                atualizado_em = NOW()
            RETURNING id
            """,
            (
                v.gwlegis_id,
                # O perfil do portal não traz o nome civil; vem da tabela conferida.
                NOMES_CIVIS.get(v.gwlegis_id, v.nome_parlamentar),
                v.nome_parlamentar,
                v.partido,
                v.foto_url,
                emails.get(v.gwlegis_id),
                v.status,
                leg_id,
                perfil_url(v.gwlegis_id),
                has_email,
            ),
        )
        return cur.fetchone()[0]

    @staticmethod
    def _replace_mesa(cur, vereadores: list[VereadorInfo], ids: dict[int, int], leg_id: int) -> None:
        cur.execute("DELETE FROM mesa_diretora WHERE legislatura_id = %s", (leg_id,))
        for v in vereadores:
            if v.cargo_mesa:
                cur.execute(
                    "INSERT INTO mesa_diretora (vereador_id, cargo, legislatura_id, fonte_url) "
                    "VALUES (%s, %s, %s, %s)",
                    (ids[v.gwlegis_id], v.cargo_mesa, leg_id, VEREADORES_URL),
                )

    @staticmethod
    def _replace_comissoes(cur, comissoes: list[ComissaoInfo], ids: dict[int, int]) -> None:
        # Comissões que sumiram da fonte não têm mais membros atuais.
        cur.execute(
            "DELETE FROM comissao_membros WHERE comissao_id IN ("
            "  SELECT id FROM comissoes WHERE gwlegis_id IS NOT NULL AND NOT (gwlegis_id = ANY(%s)))",
            ([c.gwlegis_id for c in comissoes],),
        )
        for c in comissoes:
            tipo = c.tipo.lower()
            cur.execute(
                """
                INSERT INTO comissoes (gwlegis_id, sigla, nome, tipo, fonte_url)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (gwlegis_id) DO UPDATE SET
                    sigla = EXCLUDED.sigla, nome = EXCLUDED.nome, tipo = EXCLUDED.tipo,
                    fonte_url = EXCLUDED.fonte_url, coletado_em = NOW()
                RETURNING id
                """,
                (c.gwlegis_id, c.sigla, c.nome, tipo, f"{GWLEGIS_BASE}/comissao/{c.gwlegis_id}"),
            )
            (comissao_id,) = cur.fetchone()
            cur.execute("DELETE FROM comissao_membros WHERE comissao_id = %s", (comissao_id,))
            if not c.ativa:
                continue
            for m in c.membros:
                vereador_id = ids.get(m.vereador_gwlegis_id)
                if vereador_id is None:
                    log.warning("comissão %s cita vereador desconhecido %s", c.sigla, m.vereador_gwlegis_id)
                    continue
                cur.execute(
                    "INSERT INTO comissao_membros (comissao_id, vereador_id, cargo, fonte_url) "
                    "VALUES (%s, %s, %s, %s) ON CONFLICT (comissao_id, vereador_id) DO NOTHING",
                    (comissao_id, vereador_id, m.cargo, COMISSOES_URL),
                )


if __name__ == "__main__":
    from run_all import run_single

    run_single(VereadoresCollector())
