// São Paulo não tem horário de verão desde 2019: o offset é fixo em UTC−3.
const SP_OFFSET_MS = -3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const TERCA = 2; // getUTCDay() no "relógio de São Paulo"

/**
 * Próxima sessão ordinária prevista pelo padrão do plenário (toda terça), no mesmo
 * horário da última ordinária realizada. É uma estimativa: recessos e mudanças de
 * calendário não aparecem aqui — a UI rotula como "prevista".
 */
export function proximaOrdinariaPrevista(agora: Date, ultimaOrdinaria: Date): Date {
  // Trabalha no "relógio de parede" de São Paulo, representado como UTC.
  const agoraSP = new Date(agora.getTime() + SP_OFFSET_MS);
  const ultimaSP = new Date(ultimaOrdinaria.getTime() + SP_OFFSET_MS);

  const candidata = new Date(
    Date.UTC(
      agoraSP.getUTCFullYear(),
      agoraSP.getUTCMonth(),
      agoraSP.getUTCDate(),
      ultimaSP.getUTCHours(),
      ultimaSP.getUTCMinutes(),
    ),
  );
  let dias = (TERCA - candidata.getUTCDay() + 7) % 7;
  if (dias === 0 && candidata.getTime() <= agoraSP.getTime()) dias = 7;

  return new Date(candidata.getTime() + dias * DIA_MS - SP_OFFSET_MS);
}
