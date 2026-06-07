import { describe, expect, it } from "vitest";

import { toIsoWithOffset } from "@/lib/datetime";
import { ulid, ULID_PATTERN } from "@/lib/ulid";

describe("ulid (identidad e idempotencia de eventos)", () => {
  it("cumple el patrón del contrato (26 chars Crockford)", () => {
    for (let i = 0; i < 50; i++) {
      expect(ulid()).toMatch(ULID_PATTERN);
    }
  });

  it("ordena por tiempo (timestamps distintos)", () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    expect(b > a).toBe(true);
  });

  it("monotónico DENTRO del mismo milisegundo (el outbox jamás se desordena)", () => {
    const t = 1_700_000_000_500;
    let prev = ulid(t);
    for (let i = 0; i < 100; i++) {
      const next = ulid(t);
      expect(next > prev).toBe(true);
      prev = next;
    }
  });

  it("no se repite (10k seguidos)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      seen.add(ulid());
    }
    expect(seen.size).toBe(10_000);
  });
});

describe("toIsoWithOffset (occurred_at del contrato)", () => {
  it("cumple el patrón exacto del envelope (sin fracción, con offset)", () => {
    expect(toIsoWithOffset(new Date())).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
  });

  it("la fecha local se preserva (no se convierte a UTC)", () => {
    const d = new Date(2026, 5, 6, 14, 32, 5);
    expect(toIsoWithOffset(d)).toContain("2026-06-06T14:32:05");
  });
});
