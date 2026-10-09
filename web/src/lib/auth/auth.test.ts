import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { clientIpFrom } from "@/lib/auth/client-ip";
import { readAuthConfig } from "@/lib/auth/config";
import { authDecision, safeNextPath } from "@/lib/auth/decision";
import { passwordMatches } from "@/lib/auth/password";
import {
  SESSION_TTL_SECONDS,
  sessionVersion,
  signSession,
  verifySession,
} from "@/lib/auth/token";

const SECRET = "x".repeat(48);
const PASSWORD = "senha-forte-12";

describe("readAuthConfig", () => {
  it("exige JWT_SECRET com 32+ caracteres e ADMIN_PASSWORD com 12+", () => {
    expect(() => readAuthConfig({ JWT_SECRET: "curto", ADMIN_PASSWORD: PASSWORD })).toThrow(
      /JWT_SECRET/,
    );
    expect(() => readAuthConfig({ JWT_SECRET: SECRET, ADMIN_PASSWORD: "curta-11ch" })).toThrow(
      /ADMIN_PASSWORD/,
    );
    expect(() => readAuthConfig({ JWT_SECRET: SECRET })).toThrow(/ADMIN_PASSWORD/);
    const cfg = readAuthConfig({ JWT_SECRET: SECRET, ADMIN_PASSWORD: PASSWORD });
    expect(cfg.adminPassword).toBe(PASSWORD);
    expect(cfg.secret).toBeInstanceOf(Uint8Array);
    expect(cfg.version).toBe(sessionVersion(cfg.secret, PASSWORD));
  });
});

describe("token de sessão", () => {
  const key = new TextEncoder().encode(SECRET);
  const ver = sessionVersion(key, PASSWORD);

  it("assina e valida", async () => {
    const token = await signSession(key, ver);
    expect(await verifySession(token, key, ver)).toBe(true);
  });

  it("rejeita token expirado", async () => {
    const past = Math.floor(Date.now() / 1000) - SESSION_TTL_SECONDS - 10;
    const token = await signSession(key, ver, past);
    expect(await verifySession(token, key, ver)).toBe(false);
  });

  it("rejeita outra chave, lixo e ausência", async () => {
    const token = await signSession(new TextEncoder().encode("y".repeat(48)), ver);
    expect(await verifySession(token, key, ver)).toBe(false);
    expect(await verifySession("abc.def.ghi", key, ver)).toBe(false);
    expect(await verifySession(undefined, key, ver)).toBe(false);
  });

  it("trocar a ADMIN_PASSWORD revoga as sessões existentes", async () => {
    const token = await signSession(key, ver);
    expect(await verifySession(token, key, sessionVersion(key, "outra-senha-forte"))).toBe(false);
  });

  it("rejeita token com outro subject ou outro algoritmo", async () => {
    const base = () =>
      new SignJWT({ ver }).setIssuer("radarpa").setAudience("radarpa").setExpirationTime("1h");

    const outroSub = await base()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("intruso")
      .sign(key);
    expect(await verifySession(outroSub, key, ver)).toBe(false);

    const hs512 = await base().setProtectedHeader({ alg: "HS512" }).setSubject("admin").sign(key);
    expect(await verifySession(hs512, key, ver)).toBe(false);
  });
});

describe("passwordMatches", () => {
  it("compara em tempo constante, inclusive com tamanhos diferentes", () => {
    expect(passwordMatches(PASSWORD, PASSWORD)).toBe(true);
    expect(passwordMatches("senha-fraca-1", PASSWORD)).toBe(false);
    expect(passwordMatches("s", PASSWORD)).toBe(false);
    expect(passwordMatches("", PASSWORD)).toBe(false);
  });
});

describe("clientIpFrom", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("prefere X-Real-IP e depois o último salto do X-Forwarded-For (o do proxy)", () => {
    expect(clientIpFrom(h({ "x-real-ip": "200.1.2.3", "x-forwarded-for": "6.6.6.6" }))).toBe(
      "200.1.2.3",
    );
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6, 200.1.2.3" }))).toBe("200.1.2.3");
    expect(clientIpFrom(h({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("valores que não são IP caem num balde compartilhado de tamanho fixo", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "a".repeat(5000) }))).toBe("desconhecido");
    expect(clientIpFrom(h({}))).toBe("desconhecido");
  });
});

describe("authDecision", () => {
  it("libera o login e rotas públicas", () => {
    expect(authDecision("/login", false)).toBe("allow");
    expect(authDecision("/manifest.webmanifest", false)).toBe("allow");
    // Página que o service worker mostra sem rede: não pode depender de sessão.
    expect(authDecision("/offline", false)).toBe("allow");
  });

  it("libera tudo com sessão válida", () => {
    expect(authDecision("/sessoes", true)).toBe("allow");
    expect(authDecision("/api/sessoes", true)).toBe("allow");
  });

  it("sem sessão: API recebe 401 e páginas vão para o login", () => {
    expect(authDecision("/api/sessoes", false)).toBe("unauthorized");
    expect(authDecision("/sessoes/1", false)).toBe("redirect");
    expect(authDecision("/", false)).toBe("redirect");
  });

  it("não confunde prefixos", () => {
    expect(authDecision("/login-falso", false)).toBe("redirect");
    expect(authDecision("/apix", false)).toBe("redirect");
  });
});

describe("safeNextPath", () => {
  it("aceita só caminhos internos", () => {
    expect(safeNextPath("/sessoes/1?pg=2")).toBe("/sessoes/1?pg=2");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });

  it("não é enganado por caracteres de controle", () => {
    for (const ch of ["\t", "\n", "\r", "\u0000"]) {
      expect(safeNextPath(`/${ch}/evil.com`)).toBe("/");
    }
    // Codificado é só um caminho interno estranho (o navegador não o decodifica no redirect).
    expect(safeNextPath("/%09/evil.com")).toBe("/%09/evil.com");
  });

  it("não volta para a API e descarta o parâmetro interno _rsc", () => {
    expect(safeNextPath("/api/sessoes")).toBe("/");
    expect(safeNextPath("/sessoes?pg=2&_rsc=abc")).toBe("/sessoes?pg=2");
  });
});
