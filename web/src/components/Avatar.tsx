import { portalUrl } from "@/lib/safe-url";

function iniciais(nome: string): string {
  const partes = nome.split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes.at(-1)![0] : "")).toUpperCase();
}

export function Avatar({
  nome,
  fotoUrl,
  size = 56,
}: {
  nome: string;
  fotoUrl: string | null;
  size?: number;
}) {
  const src = portalUrl(fotoUrl); // mesmo host liberado em img-src no CSP
  const style = { width: size, height: size };
  if (!src) {
    return (
      <span
        aria-hidden
        style={style}
        className="grid shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent"
      >
        {iniciais(nome)}
      </span>
    );
  }
  return (
    // Foto externa já servida em tamanho pequeno; sem o otimizador do Next (menos superfície).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      style={style}
      className="shrink-0 rounded-full border border-line object-cover"
    />
  );
}
