// Presente na sessão mas sem registrar voto: tratado como abstenção deliberada
// (muitas vezes para não expor posição). Faltas à sessão/votação ficam neutras.
const ABSTENCOES = new Set(["nao_votou", "ausente_plenario"]);

/** Peso de uma abstenção no lado contrário ao calcular a maioria. */
export const PESO_ABSTENCAO = 0.5;

export function ehAbstencao(voto: string): boolean {
  return ABSTENCOES.has(voto);
}

/** Maioria da votação: sim × (não + meio voto por abstenção). Empate ou nada efetivo → null. */
export function maioriaDe(votos: { voto: string }[]): "sim" | "nao" | null {
  let sim = 0;
  let contra = 0;
  for (const { voto } of votos) {
    if (voto === "sim") sim++;
    else if (voto === "nao") contra++;
    else if (ehAbstencao(voto)) contra += PESO_ABSTENCAO;
  }
  if (sim === contra) return null;
  return sim > contra ? "sim" : "nao";
}

/**
 * O vereador ficou contra a maioria clara? Voto sim/não oposto à maioria, ou
 * abstenção quando a maioria foi favorável (abstenção conta como inclinação contrária).
 */
export function ehDivergente(voto: string, votosDaVotacao: { voto: string }[]): boolean {
  const maioria = maioriaDe(votosDaVotacao);
  if (maioria === null) return false;
  if (voto === "sim" || voto === "nao") return voto !== maioria;
  return ehAbstencao(voto) && maioria === "sim";
}
