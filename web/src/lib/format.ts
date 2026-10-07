// Datas sempre exibidas no fuso da Câmara, não no do servidor (Railway roda em UTC).
const TZ = "America/Sao_Paulo";

const dataFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const horaFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const diaSemanaFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long" });

type MaybeDate = Date | null | undefined;

export function formatData(d: MaybeDate): string {
  return d ? dataFmt.format(d) : "—";
}

export function formatHora(d: MaybeDate): string {
  return d ? horaFmt.format(d) : "—";
}

export function formatDataHora(d: MaybeDate): string {
  return d ? `${formatData(d)} ${formatHora(d)}` : "—";
}

export function formatDiaSemana(d: Date): string {
  const s = diaSemanaFmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function tipoCurto(tipo: string): string {
  return tipo.replace(/^Sessão\s+/i, "");
}
