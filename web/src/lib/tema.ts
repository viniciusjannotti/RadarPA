export type Tema = "dark" | "light";

export const TEMA_STORAGE_KEY = "radarpa-tema";

export const COR_BARRA: Record<Tema, string> = { dark: "#070d1a", light: "#f3f6fb" };

export function temaValido(v: unknown): Tema {
  return v === "light" ? "light" : "dark"; // escuro é o padrão (plano, seção 7)
}

export function proximoTema(atual: Tema): Tema {
  return atual === "dark" ? "light" : "dark";
}

/**
 * Script inline do <head>: aplica o tema salvo antes da primeira pintura (sem
 * "piscar" o escuro para quem escolheu o claro). Texto fixo, sem dados do usuário.
 */
export const SCRIPT_TEMA_INICIAL = `try{var t=localStorage.getItem(${JSON.stringify(
  TEMA_STORAGE_KEY,
)});if(t==="light"){document.documentElement.dataset.theme="light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=${JSON.stringify(
  COR_BARRA.light,
)}}}catch(e){}`;
