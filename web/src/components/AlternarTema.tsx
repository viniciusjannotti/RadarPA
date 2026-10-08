"use client";

import { useEffect, useSyncExternalStore } from "react";
import { COR_BARRA, proximoTema, TEMA_STORAGE_KEY, temaValido, type Tema } from "@/lib/tema";

// O tema "vive" no atributo data-theme do <html> (o script do <head> já aplicou o salvo).
const ouvintes = new Set<() => void>();

function lerTema(): Tema {
  return temaValido(document.documentElement.dataset.theme);
}

function aplicarTema(tema: Tema) {
  if (tema === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_BARRA[tema]);
  try {
    localStorage.setItem(TEMA_STORAGE_KEY, tema);
  } catch {
    // modo privado/armazenamento bloqueado: o tema vale só nesta aba
  }
  ouvintes.forEach((f) => f());
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

export function AlternarTema() {
  // No servidor (e na hidratação) assume o padrão; depois reflete o tema real.
  const tema = useSyncExternalStore(assinar, lerTema, () => "dark" as Tema);

  // O script do <head> pode rodar antes da <meta name="theme-color"> existir:
  // garante a cor da barra do sistema depois que a página montou.
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_BARRA[tema]);
  }, [tema]);
  const destino = proximoTema(tema);
  return (
    <button
      type="button"
      onClick={() => aplicarTema(destino)}
      aria-label={destino === "light" ? "Usar tema claro" : "Usar tema escuro"}
      className="grid size-11 place-items-center rounded-full text-lg text-muted transition hover:bg-surface-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span aria-hidden>{tema === "dark" ? "☀️" : "🌙"}</span>
    </button>
  );
}
