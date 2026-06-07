import { describe, expect, it } from "vitest";

import { formatMoney, formatTime } from "@/lib/format";

describe("formatMoney (DISENO §4: RD$ 1,234.56, sin pasar por floats)", () => {
  it("agrupa miles con coma y conserva dos decimales", () => {
    expect(formatMoney("1234.56")).toBe("RD$ 1,234.56");
    expect(formatMoney("1234567.89")).toBe("RD$ 1,234,567.89");
  });

  it("maneja cero y montos pequeños", () => {
    expect(formatMoney("0.00")).toBe("RD$ 0.00");
    expect(formatMoney("75.00")).toBe("RD$ 75.00");
  });

  it("completa decimales faltantes sin redondear", () => {
    expect(formatMoney("150")).toBe("RD$ 150.00");
    expect(formatMoney("150.5")).toBe("RD$ 150.50");
  });

  it("no pierde precisión con montos grandes (más allá del float seguro)", () => {
    expect(formatMoney("9007199254740993.99")).toBe("RD$ 9,007,199,254,740,993.99");
  });

  it("soporta negativos (diferencias de arqueo)", () => {
    expect(formatMoney("-50.00")).toBe("-RD$ 50.00");
  });
});

describe("formatTime (12h con a.m./p.m., costumbre RD)", () => {
  it("formatea tarde y mañana", () => {
    expect(formatTime(new Date(2026, 5, 6, 15, 42))).toBe("3:42 p.m.");
    expect(formatTime(new Date(2026, 5, 6, 9, 5))).toBe("9:05 a.m.");
  });

  it("medianoche y mediodía no muestran 0", () => {
    expect(formatTime(new Date(2026, 5, 6, 0, 0))).toBe("12:00 a.m.");
    expect(formatTime(new Date(2026, 5, 6, 12, 0))).toBe("12:00 p.m.");
  });
});
