import { describe, expect, it } from "vitest";

import { compareVersions, updateRequired } from "@/lib/version";

describe("compareVersions (4.12 / D14)", () => {
  it("ordena semánticamente, no alfabéticamente", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.0", "1.0.0")).toBe(-1);
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1); // 10 > 9
    expect(compareVersions("1.0", "1.0.1")).toBe(-1);
  });
});

describe("updateRequired", () => {
  it("por debajo del mínimo → actualizar (el outbox se drena ANTES)", () => {
    expect(updateRequired("0.1.0", "0.2.0")).toBe(true);
    expect(updateRequired("0.2.0", "0.2.0")).toBe(false);
    expect(updateRequired("1.0.0", "0.0.0")).toBe(false);
  });
});
