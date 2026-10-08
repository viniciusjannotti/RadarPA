"""Orquestrador: roda os coletores em sequência; a falha de um não impede os demais."""

from __future__ import annotations

import logging
import sys

from base import Collector, HttpClient, connect

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("radarpa")


def all_collectors() -> list[Collector]:
    from datetime import date

    from collector_proposicoes import ProposicoesCollector
    from collector_sessoes import SessoesCollector
    from collector_vereadores import VereadoresCollector
    from collector_votacoes import VotacoesCollector

    # Vereadores antes de qualquer coletor que referencie vereadores (votos, autoria);
    # votações depois das sessões (precisa do gwlegis_id de cada sessão); proposições
    # por último (liga as votações já gravadas às proposições).
    # Aos domingos a autoria faz varredura completa (retoma backfills interrompidos).
    return [
        VereadoresCollector(),
        SessoesCollector(),
        VotacoesCollector(),
        ProposicoesCollector(autoria_completa=date.today().weekday() == 6),
    ]


def run_collectors(collectors: list[Collector], conn=None, http: HttpClient | None = None) -> int:
    """Devolve o número de coletores que falharam (a falha já fica em coleta_logs)."""
    own_conn, own_http = conn is None, http is None
    conn = conn or connect()
    http = http or HttpClient()
    failures = 0
    try:
        for collector in collectors:
            try:
                collector.run(conn, http)
            except Exception:
                failures += 1
    finally:
        if own_http:
            http.close()
        if own_conn:
            conn.close()
    return failures


def run_single(collector: Collector) -> None:
    sys.exit(1 if run_collectors([collector]) else 0)


if __name__ == "__main__":
    sys.exit(1 if run_collectors(all_collectors()) else 0)
