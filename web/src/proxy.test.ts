import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAuthConfig } from "@/lib/auth/config";
import { SESSION_COOKIE, signSession } from "@/lib/auth/token";
import { config, proxy } from "@/proxy";

const ENV = { JWT_SECRET: "s".repeat(48), ADMIN_PASSWORD: "senha-forte-12" };

async function validToken() {
  const cfg = readAuthConfig(ENV);
  return signSession(cfg.secret, cfg.version);
}

function req(path: string, init: { cookie?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", `${SESSION_COOKIE}=${init.cookie}`);
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

describe("proxy", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", ENV.JWT_SECRET);
    vi.stubEnv("ADMIN_PASSWORD", ENV.ADMIN_PASSWORD);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sem sessão, página redireciona para o login preservando caminho e query", async () => {
    const res = await proxy(req("/sessoes/1?pg=2"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/sessoes/1?pg=2");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sem sessão, a raiz vai para o login sem next", async () => {
    const res = await proxy(req("/"));
    expect(new URL(res.headers.get("location")!).search).toBe("");
  });

  it("sem sessão, API recebe 401 JSON sem cache", async () => {
    const res = await proxy(req("/api/sessoes"));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "Não autenticado" });
  });

  it("com sessão válida, deixa passar", async () => {
    const res = await proxy(req("/api/sessoes", { cookie: await validToken() }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("logado em /login vai para a home, exceto POST de Server Action", async () => {
    const token = await validToken();
    const res = await proxy(req("/login", { cookie: token }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");

    const action = await proxy(req("/login", { cookie: token, headers: { "next-action": "x" } }));
    expect(action.headers.get("x-middleware-next")).toBe("1");
  });

  it("configuração inválida falha fechado", async () => {
    const token = await validToken();
    vi.stubEnv("JWT_SECRET", "curto");
    const res = await proxy(req("/api/sessoes", { cookie: token }));
    expect(res.status).toBe(401);
  });

  it("trocar a senha invalida a sessão", async () => {
    const token = await validToken();
    vi.stubEnv("ADMIN_PASSWORD", "outra-senha-forte");
    expect((await proxy(req("/api/sessoes", { cookie: token }))).status).toBe(401);
  });
});

describe("proxy matcher", () => {
  const re = new RegExp(`^${config.matcher[0]}$`);

  it("pula só assets estáticos e arquivos públicos exatos", () => {
    for (const p of ["/_next/static/x.js", "/_next/image", "/favicon.ico", "/sw.js", "/icons/a.png"]) {
      expect(re.test(p), p).toBe(false);
    }
    for (const p of ["/sessoes", "/api/sessoes", "/login", "/sw.json", "/favicon.icox", "/"]) {
      expect(re.test(p), p).toBe(true);
    }
  });
});
