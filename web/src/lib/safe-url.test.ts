import { describe, expect, it } from "vitest";
import { portalUrl, safeExternalUrl } from "@/lib/safe-url";

describe("portalUrl", () => {
  it("aceita só https do portal da Câmara", () => {
    expect(portalUrl("https://cmpousoalegre.gwlegis.com.br/arquivo/x.pdf")).toBe(
      "https://cmpousoalegre.gwlegis.com.br/arquivo/x.pdf",
    );
    expect(portalUrl("https://evil.com/x.pdf")).toBeNull();
    expect(portalUrl("https://cmpousoalegre.gwlegis.com.br.evil.com/x")).toBeNull();
    expect(portalUrl("http://cmpousoalegre.gwlegis.com.br/x")).toBeNull();
    expect(portalUrl(null)).toBeNull();
  });
});

describe("safeExternalUrl", () => {
  it("aceita https", () => {
    expect(safeExternalUrl("https://www.pousoalegre.mg.leg.br/ata.pdf")).toBe(
      "https://www.pousoalegre.mg.leg.br/ata.pdf",
    );
  });

  it("rejeita esquemas perigosos, http e lixo", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl(" JavaScript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,x")).toBeNull();
    expect(safeExternalUrl("http://exemplo.com")).toBeNull();
    expect(safeExternalUrl("/relativo")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});
