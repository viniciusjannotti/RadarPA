import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { montarServiceWorker, versaoDoBuild } from "@/lib/service-worker";

const TEMPLATE = fs.readFileSync(path.resolve(__dirname, "../../scripts/sw.template.js"), "utf8");

describe("service worker", () => {
  it("cada build ganha uma versão própria de cache", () => {
    const sw = montarServiceWorker(TEMPLATE, "radarpa-abc123");
    expect(sw).toContain('const VERSAO = "radarpa-abc123";');
    expect(sw).not.toContain("__VERSAO__");
  });

  it("template sem o marcador é erro (evita publicar SW sem versão)", () => {
    expect(() => montarServiceWorker("const x = 1;", "v")).toThrow(/__VERSAO__/);
  });

  it("versão usa o commit quando disponível e só tem caracteres seguros", () => {
    expect(versaoDoBuild({ VERCEL_GIT_COMMIT_SHA: "0d294e7abcdef" }, () => 1)).toBe("radarpa-0d294e7abcde");
    expect(versaoDoBuild({}, () => 1791495096955)).toBe("radarpa-1791495096955");
    expect(versaoDoBuild({ VERCEL_GIT_COMMIT_SHA: "x\";alert(1)//" }, () => 7)).toBe("radarpa-7");
  });

  it("só guarda respostas 200 e não deixa falha de cache derrubar a resposta", () => {
    expect(TEMPLATE).toContain("res.status === 200");
    expect(TEMPLATE).toMatch(/event\.waitUntil\(\s*caches\s*\.open\(VERSAO\)[\s\S]*?\.catch\(/);
  });
});
