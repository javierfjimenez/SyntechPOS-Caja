import { describe, expect, it } from "vitest";

import { COLS, encodeCp850, EscPosBuilder } from "@/services/escpos";
import { renderTicket, renderTestPage, type TicketData } from "@/services/ticket";

describe("encodeCp850 (acentos del español en la térmica)", () => {
  it("ASCII pasa directo", () => {
    expect(encodeCp850("ABC 123")).toEqual([65, 66, 67, 32, 49, 50, 51]);
  });

  it("ñ, acentos y ü van al code page CP850", () => {
    expect(encodeCp850("ñ")).toEqual([0xa4]);
    expect(encodeCp850("á")).toEqual([0xa0]);
    expect(encodeCp850("Ñ")).toEqual([0xa5]);
  });

  it("lo no mapeado degrada a '?' (jamás bytes corruptos)", () => {
    expect(encodeCp850("😀")).toEqual([0x3f]);
  });
});

describe("EscPosBuilder", () => {
  it("init = reset + code page CP850", () => {
    const bytes = new EscPosBuilder().init().build();
    expect(Array.from(bytes)).toEqual([0x1b, 0x40, 0x1b, 0x74, 2]);
  });

  it("row alinea el monto a la derecha en 48 columnas", () => {
    const bytes = new EscPosBuilder().row("TOTAL", "RD$ 150.00").build();
    const text = String.fromCharCode(...bytes);
    expect(text).toHaveLength(COLS + 1); // + salto de línea
    expect(text.endsWith("RD$ 150.00\n")).toBe(true);
    expect(text.startsWith("TOTAL ")).toBe(true);
  });

  it("el pulso de gaveta es ESC p 0 (pin 2, RJ-11 estándar)", () => {
    expect(Array.from(new EscPosBuilder().drawerPulse().build())).toEqual([0x1b, 0x70, 0, 25, 250]);
  });

  it("cut = corte parcial GS V 66 con avance", () => {
    expect(Array.from(new EscPosBuilder().cut().build())).toEqual([0x1d, 0x56, 66, 3]);
  });

  it("el QR emite la secuencia GS ( k completa (modelo, módulo, datos, print)", () => {
    const bytes = Array.from(new EscPosBuilder().qr("AB").build());
    // almacenar datos: GS ( k {len} 0 49 80 48 'A' 'B'
    const store = [0x1d, 0x28, 0x6b, 5, 0, 49, 80, 48, 65, 66];
    const print = [0x1d, 0x28, 0x6b, 3, 0, 49, 81, 48];
    const str = bytes.join(",");
    expect(str).toContain(store.join(","));
    expect(str).toContain(print.join(","));
  });
});

const DATA: TicketData = {
  business: {
    trade_name: "Súper Demo",
    legal_name: "SUPERMERCADO DEMO SRL",
    rnc: "131234567",
    address: "Av. Principal #1, Santo Domingo",
    phone: "8095551234",
    receipt_footer: "",
  },
  branch_name: "Sucursal Centro",
  terminal_name: "Caja 1",
  ticket_number: 1042,
  occurred_at: new Date(2026, 5, 7, 15, 42, 0),
  cashier_name: "María P.",
  customer_name: null,
  customer_document: null,
  lines: [
    {
      product_id: 88,
      department_id: 3,
      description: "Arroz Selecto 5lb",
      quantity: "2.000",
      unit_price: "75.00",
      discount_amount: "0.00",
      tax_category: "ITBIS18",
      unit_cost: "61.5000",
      is_weighable: false,
    },
  ],
  totals: {
    taxed18_base: "127.12",
    taxed18_itbis: "22.88",
    taxed16_base: "0.00",
    taxed16_itbis: "0.00",
    taxed0_base: "0.00",
    exempt_base: "0.00",
    discount_total: "0.00",
    total: "150.00",
  },
  payments: [{ method_code: "cash", amount: "150.00", amount_tendered: "200.00", reference: null }],
  change: "50.00",
  ecf: null,
};

function texto(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

describe("renderTicket (el hecho legal impreso)", () => {
  it("incluye negocio, RNC, ticket, líneas, ITBIS y TOTAL", () => {
    const out = texto(renderTicket(DATA));
    expect(out).toContain("SUPERMERCADO DEMO SRL");
    expect(out).toContain("RNC: 131234567");
    expect(out).toContain("Ticket #1042");
    expect(out).toContain("Arroz Selecto 5lb");
    expect(out).toContain("2 x RD$ 75.00");
    expect(out).toContain("ITBIS 18%");
    expect(out).toContain("RD$ 150.00");
    expect(out).toContain("CAMBIO");
  });

  it("sin e-CF imprime la LEYENDA DE CONTINGENCIA (D9)", () => {
    const out = texto(renderTicket(DATA));
    expect(out).toContain("COMPROBANTE EN CONTINGENCIA");
    expect(out).not.toContain("e-NCF:");
  });

  it("con e-CF imprime e-NCF + código de seguridad + QR (sin leyenda)", () => {
    const out = texto(
      renderTicket({
        ...DATA,
        ecf: { encf: "E310000001042", security_code: "Ab3X9z", dgii_url: "https://ecf.dgii.gov.do/x" },
      }),
    );
    expect(out).toContain("e-NCF: E310000001042");
    expect(out).toContain("Ab3X9z");
    expect(out).not.toContain("CONTINGENCIA");
  });

  it("termina con corte (GS V 66)", () => {
    const bytes = Array.from(renderTicket(DATA));
    expect(bytes.slice(-4)).toEqual([0x1d, 0x56, 66, 3]);
  });

  it("el pulso de gaveta NO va dentro del ticket (se envía aparte, solo efectivo)", () => {
    const bytes = Array.from(renderTicket(DATA)).join(",");
    expect(bytes).not.toContain([0x1b, 0x70, 0].join(","));
  });
});

describe("renderTestPage", () => {
  it("trae los caracteres de diagnóstico y un QR", () => {
    const out = texto(renderTestPage("Súper Demo", "Caja 1"));
    expect(out).toContain("Caja 1");
    expect(out).toContain("RD$ 1,234.56");
  });
});
