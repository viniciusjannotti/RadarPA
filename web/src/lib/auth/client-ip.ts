import { isIP } from "node:net";

/**
 * IP do cliente para o rate limit. O primeiro salto do X-Forwarded-For é escrito pelo
 * próprio cliente (forjável); o último é o adicionado pelo proxy da plataforma.
 * Qualquer coisa que não seja um IP vira um balde único, o que também limita a memória.
 */
export function clientIpFrom(headers: Headers): string {
  const candidates = [
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",").at(-1),
  ];
  for (const raw of candidates) {
    const ip = raw?.trim();
    if (ip && isIP(ip)) return ip;
  }
  return "desconhecido";
}
