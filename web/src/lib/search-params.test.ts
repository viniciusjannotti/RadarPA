import { describe, expect, it } from "vitest";
import { firstParam, intParam } from "@/lib/search-params";

describe("search params", () => {
  it("pega o primeiro valor", () => {
    expect(firstParam({ a: ["x", "y"] }, "a")).toBe("x");
    expect(firstParam({ a: "z" }, "a")).toBe("z");
    expect(firstParam({}, "a")).toBeUndefined();
  });

  it("aceita só inteiros positivos curtos", () => {
    expect(intParam({ pg: "3" }, "pg")).toBe(3);
    expect(intParam({ pg: "-1" }, "pg")).toBeUndefined();
    expect(intParam({ pg: "1e3" }, "pg")).toBeUndefined();
    expect(intParam({ pg: "99999999999999" }, "pg")).toBeUndefined();
  });
});
