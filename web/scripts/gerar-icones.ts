// Gera os PNGs do PWA a partir de public/icons/icon.svg.
// Uso: npx tsx scripts/gerar-icones.ts  (rode de novo se o SVG mudar; os PNGs são versionados)
import path from "node:path";
import sharp from "sharp";

const DIR = path.resolve(__dirname, "..", "public", "icons");
const SVG = path.join(DIR, "icon.svg");

async function main() {
  for (const size of [192, 512]) {
    await sharp(SVG, { density: 384 }).resize(size, size).png().toFile(path.join(DIR, `icon-${size}.png`));
  }
  await sharp(SVG, { density: 384 }).resize(180, 180).png().toFile(path.join(DIR, "apple-touch-icon.png"));

  // Maskable: o Android recorta em círculo/squircle; o desenho fica dentro da zona
  // segura (80% central), sobre fundo da cor do tema.
  const miolo = await sharp(SVG, { density: 384 }).resize(384, 384).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: "#070d1a" } })
    .composite([{ input: miolo, gravity: "center" }])
    .png()
    .toFile(path.join(DIR, "icon-maskable-512.png"));

  console.log("Ícones gerados em", DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
