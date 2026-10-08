import Link from "next/link";
import { logout } from "@/lib/auth/actions";
import { AlternarTema } from "@/components/AlternarTema";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-30 border-b border-line bg-[var(--nav-bg)] pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span
              aria-hidden
              className="relative grid size-7 place-items-center rounded-full border border-accent-2/60"
            >
              <span className="size-2 rounded-full bg-accent-2 shadow-[0_0_10px_var(--accent-2)]" />
            </span>
            Radar <span className="text-accent">PA</span>
          </Link>
          <div className="ml-auto" />
          <AlternarTema />
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-muted transition hover:text-fg"
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
      <BottomNav />
    </div>
  );
}
