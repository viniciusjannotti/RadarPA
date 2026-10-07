import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara a senha digitada com a configurada em tempo constante.
 * Os dois lados passam por SHA-256 para terem o mesmo tamanho (timingSafeEqual exige isso
 * e, sem o hash, o tamanho da senha vazaria pelo tempo de resposta).
 */
export function passwordMatches(input: string, expected: string): boolean {
  if (!input) return false;
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
