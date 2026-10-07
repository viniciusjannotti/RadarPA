import { type NextRequest, NextResponse } from "next/server";
import { readAuthConfig } from "@/lib/auth/config";
import { authDecision, LOGIN_PATH } from "@/lib/auth/decision";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

const NO_STORE = { "Cache-Control": "private, no-store" };

// Primeira barreira de autenticação. Páginas, Route Handlers e Server Functions
// verificam a sessão de novo perto dos dados (lib/auth/session.ts).
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  let valid = false;
  try {
    const cfg = readAuthConfig();
    valid = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, cfg.secret, cfg.version);
  } catch (err) {
    console.error("[auth] configuração inválida:", (err as Error).message);
  }

  // Logado abrindo /login vai para a home — mas não intercepta o POST de uma
  // Server Action (ex.: login enviado de outra aba), que quebraria se redirecionado.
  if (valid && pathname === LOGIN_PATH && !request.headers.has("next-action")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  switch (authDecision(pathname, valid)) {
    case "allow":
      return NextResponse.next();
    case "unauthorized":
      return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers: NO_STORE });
    case "redirect": {
      const url = new URL(LOGIN_PATH, request.url);
      if (pathname !== "/") url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url, { headers: NO_STORE });
    }
  }
}

export const config = {
  matcher: [
    // Tudo, exceto assets estáticos (CSS/JS/imagens) e arquivos públicos exatos do PWA.
    "/((?!_next/static/|_next/image|icons/|(?:favicon\\.ico|sw\\.js|robots\\.txt)$).*)",
  ],
};
