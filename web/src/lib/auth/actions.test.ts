import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Estado simulado de headers/cookies do Next para chamar a Server Action fora do servidor.
const jar = new Map<string, string>();
let requestHeaders = new Headers();

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

class RedirectError extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

// Contador em memória no lugar do banco (o limitador real tem teste próprio em *.db-test).
const falhas = new Map<string, number>();
let limiterQuebrado = false;
vi.mock("@/lib/auth/login-limiter", () => ({
  loginLimiter: {
    check: async (ip: string) => {
      if (limiterQuebrado) throw new Error("banco fora");
      const allowed = (falhas.get(ip) ?? 0) < 5;
      return { allowed, retryAfterMs: allowed ? 0 : 15 * 60 * 1000 };
    },
    fail: async (ip: string) => void falhas.set(ip, (falhas.get(ip) ?? 0) + 1),
    reset: async (ip: string) => void falhas.delete(ip),
  },
}));

const { login, logout } = await import("@/lib/auth/actions");
const { SESSION_COOKIE } = await import("@/lib/auth/token");

function form(password: string, next = "") {
  const fd = new FormData();
  fd.set("password", password);
  fd.set("next", next);
  return fd;
}

describe("login (Server Action)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("JWT_SECRET", "s".repeat(48));
    vi.stubEnv("ADMIN_PASSWORD", "senha-forte-12");
    vi.spyOn(console, "error").mockImplementation(() => {});
    jar.clear();
    falhas.clear();
    limiterQuebrado = false;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function attempt(password: string, next = "") {
    const p = login(undefined, form(password, next));
    await vi.runAllTimersAsync();
    return p;
  }

  it("senha errada devolve erro genérico e não cria sessão", async () => {
    requestHeaders = new Headers({ "x-real-ip": "10.0.0.1" });
    const r = await attempt("errada-errada");
    expect(r?.error).toMatch(/Não foi possível entrar/);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("senha certa cria a sessão e redireciona para o next sanitizado", async () => {
    requestHeaders = new Headers({ "x-real-ip": "10.0.0.2" });
    await expect(attempt("senha-forte-12", "/sessoes/1")).rejects.toMatchObject({
      url: "/sessoes/1",
    });
    expect(jar.get(SESSION_COOKIE)).toBeTruthy();

    jar.clear();
    await expect(attempt("senha-forte-12", "/\t/evil.com")).rejects.toMatchObject({ url: "/" });
  });

  it("bloqueia o IP após 5 falhas, mesmo com a senha certa", async () => {
    requestHeaders = new Headers({ "x-forwarded-for": "6.6.6.6, 10.0.0.3" });
    for (let i = 0; i < 5; i++) await attempt("errada-errada");
    expect((await attempt("senha-forte-12"))?.error).toMatch(/Muitas tentativas/);

    // Outro IP (último salto diferente) não é afetado: sem lockout global do dono.
    requestHeaders = new Headers({ "x-forwarded-for": "6.6.6.6, 10.0.0.4" });
    await expect(attempt("senha-forte-12")).rejects.toBeInstanceOf(RedirectError);
  });

  it("com o rate limit indisponível, recusa o login (fail closed)", async () => {
    requestHeaders = new Headers({ "x-real-ip": "10.0.0.6" });
    limiterQuebrado = true;
    const r = await attempt("senha-forte-12");
    expect(r?.error).toMatch(/Não foi possível entrar/);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("configuração ausente não lança e não revela o motivo", async () => {
    requestHeaders = new Headers({ "x-real-ip": "10.0.0.5" });
    vi.stubEnv("ADMIN_PASSWORD", "");
    const r = await attempt("qualquer-coisa");
    expect(r?.error).toMatch(/Não foi possível entrar/);
    expect(r?.error).not.toMatch(/configur/i);
  });

  it("logout apaga o cookie e vai para o login", async () => {
    jar.set(SESSION_COOKIE, "x");
    await expect(logout()).rejects.toMatchObject({ url: "/login" });
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});
