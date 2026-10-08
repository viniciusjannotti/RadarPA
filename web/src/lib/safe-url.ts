export const PORTAL_HOST = "cmpousoalegre.gwlegis.com.br";

/** https do portal da Câmara (fotos, anexos); o mesmo host liberado no CSP. */
export function portalUrl(raw: string | null | undefined): string | null {
  const safe = safeExternalUrl(raw);
  return safe && new URL(safe).hostname === PORTAL_HOST ? safe : null;
}

/** URLs vindas das fontes coletadas só viram link se forem https absolutas. */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
