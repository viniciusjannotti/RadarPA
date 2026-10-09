// Montagem do service worker no build (scripts/gerar-sw.ts). Fica em src/lib para ser testável.

const MARCADOR = "__VERSAO__";

export function montarServiceWorker(template: string, versao: string): string {
  if (!template.includes(MARCADOR)) {
    throw new Error(`template do service worker sem o marcador ${MARCADOR}`);
  }
  return template.replaceAll(MARCADOR, versao);
}

/** Versão do cache: commit do deploy (Vercel) ou, localmente, o horário do build. */
export function versaoDoBuild(env: Record<string, string | undefined>, agora: () => number = Date.now): string {
  const sha = env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_COMMIT_SHA ?? "";
  return /^[0-9a-f]{7,40}$/i.test(sha) ? `radarpa-${sha.slice(0, 12)}` : `radarpa-${agora()}`;
}
