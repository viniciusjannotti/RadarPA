"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const ITEMS = [
  { href: "/dashboard", label: "Início", icon: "🏠" },
  { href: "/vereadores", label: "Vereadores", icon: "👥" },
  { href: "/sessoes", label: "Sessões", icon: "📋" },
  { href: "/busca", label: "Busca", icon: "🔍" },
  { href: "/notas", label: "Notas", icon: "📝" },
] as const;

export function BottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[var(--nav-bg)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      {/* O caminho atual só existe em runtime; o fallback é a mesma barra sem item ativo. */}
      <Suspense fallback={<NavList pathname={null} />}>
        <ActiveNavList />
      </Suspense>
    </nav>
  );
}

function ActiveNavList() {
  return <NavList pathname={usePathname()} />;
}

function NavList({ pathname }: { pathname: string | null }) {
  return (
    <ul className="mx-auto grid max-w-2xl grid-cols-5">
      {ITEMS.map((item) => {
        const active =
          pathname !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                active ? "text-accent" : "text-muted hover:text-fg"
              }`}
            >
              <span aria-hidden className={`text-lg leading-none ${active ? "" : "grayscale"}`}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
