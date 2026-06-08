import { describe, expect, it } from "vitest";

import {
  clear,
  initialCalc,
  pressBackspace,
  pressDigit,
  pressDot,
  pressEquals,
  pressOp,
  pressPercent,
  type CalcState,
  type Op,
} from "@/lib/calculator";

/** Teclea una secuencia compacta: dígitos, ops (+ - * /), '.', '=', '%', 'C', '<' */
function type(seq: string): CalcState {
  let s = initialCalc;
  for (const ch of seq) {
    if (/[0-9]/.test(ch)) s = pressDigit(s, ch);
    else if (ch === ".") s = pressDot(s);
    else if (ch === "=") s = pressEquals(s);
    else if (ch === "%") s = pressPercent(s);
    else if (ch === "C") s = clear();
    else if (ch === "<") s = pressBackspace(s);
    else if ("+-*/".includes(ch)) s = pressOp(s, ch as Op);
  }
  return s;
}

describe("calculadora — entrada", () => {
  it("dígitos reemplazan el cero inicial", () => {
    expect(type("0").display).toBe("0");
    expect(type("42").display).toBe("42");
  });

  it("decimales: un solo punto", () => {
    expect(type("3.14").display).toBe("3.14");
    expect(type("3..14").display).toBe("3.14");
  });

  it("backspace borra el último dígito; vacío vuelve a 0", () => {
    expect(type("123<").display).toBe("12");
    expect(type("5<").display).toBe("0");
  });
});

describe("calculadora — operaciones (sin floats)", () => {
  it("suma básica del wireframe: 1500 + 200 = 1700", () => {
    expect(type("1500+200=").display).toBe("1700");
  });

  it("resta, multiplicación y división enteras", () => {
    expect(type("1000-250=").display).toBe("750");
    expect(type("12*12=").display).toBe("144");
    expect(type("100/4=").display).toBe("25");
  });

  it("decimales exactos: 0.1 + 0.2 = 0.3 (jamás 0.30000000004)", () => {
    expect(type("0.1+0.2=").display).toBe("0.3");
  });

  it("división con redondeo half-up a 6 decimales", () => {
    expect(type("10/3=").display).toBe("3.333333");
    expect(type("2/3=").display).toBe("0.666667");
  });

  it("operadores encadenados sin '=' evalúan lo pendiente", () => {
    expect(type("2+3+4=").display).toBe("9");
    expect(type("10-2-3=").display).toBe("5");
  });

  it("cambiar de operador antes de teclear no acumula de más", () => {
    // 5 + (cambio a ×) 3 = → 15, no 5+3
    expect(type("5+*3=").display).toBe("15");
  });
});

describe("calculadora — porcentaje", () => {
  it("% solo sobre un número = dividir entre 100", () => {
    expect(type("50%").display).toBe("0.5");
  });

  it("% en contexto de operación: 200 + 5% = porcentaje del acumulador", () => {
    // 5% de 200 = 10
    expect(type("200+5%").display).toBe("10");
  });
});

describe("calculadora — errores y reset", () => {
  it("división por cero → Error recuperable con C", () => {
    const err = type("5/0=");
    expect(err.display).toBe("Error");
    expect(err.error).toBe(true);
    // en error, los dígitos no hacen nada hasta limpiar
    expect(pressDigit(err, "7").display).toBe("Error");
    expect(clear().display).toBe("0");
  });

  it("C reinicia todo", () => {
    expect(type("123+456C").display).toBe("0");
  });

  it("seguir operando tras '=' arranca número nuevo", () => {
    // 2+3=5, luego teclear 8 reemplaza (no "58")
    let s = type("2+3=");
    s = pressDigit(s, "8");
    expect(s.display).toBe("8");
  });
});
