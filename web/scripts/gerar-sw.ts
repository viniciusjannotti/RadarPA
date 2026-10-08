// Gera public/sw.js a partir de scripts/sw.template.js com uma versão única por build.
// Roda no `npm run build` (antes do next build). public/sw.js não é versionado no git.
import fs from "node:fs";
import path from "node:path";
import { montarServiceWorker, versaoDoBuild } from "../src/lib/service-worker";

const raiz = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(raiz, "scripts", "sw.template.js"), "utf8");
const versao = versaoDoBuild(process.env);
fs.writeFileSync(path.join(raiz, "public", "sw.js"), montarServiceWorker(template, versao));
console.log(`public/sw.js gerado (cache ${versao})`);
