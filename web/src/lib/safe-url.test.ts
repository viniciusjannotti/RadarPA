import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "@/lib/safe-url";

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
