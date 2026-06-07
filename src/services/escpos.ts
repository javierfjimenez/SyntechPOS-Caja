/**
 * Builder ESC/POS de bajo nivel (impresoras térmicas 80mm, comandos
 * estándar — compatible Epson y genéricas tipo Xprinter/2Connect).
 * Produce bytes puros: testeable sin impresora.
 */

const ESC = 0x1b;
const GS = 0x1d;

/** UTF-8 → CP850 (acentos y ñ del español). Sin mapeo → '?' */
const CP850: Record<string, number> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9,
  ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a, "°": 0xf8, "·": 0xfa,
};

export function encodeCp850(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);
    } else {
      out.push(CP850[ch] ?? 0x3f); // '?'
    }
  }
  return out;
}

export const COLS = 48; // 80mm, fuente A

export class EscPosBuilder {
  private bytes: number[] = [];

  /** ESC @ — reset + ESC t 2 — code page CP850 */
  init(): this {
    this.bytes.push(ESC, 0x40, ESC, 0x74, 2);
    return this;
  }

  raw(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }

  text(s: string): this {
    this.bytes.push(...encodeCp850(s));
    return this;
  }

  /** texto + salto de línea */
  line(s = ""): this {
    return this.text(s).raw(0x0a);
  }

  /** 0 = izquierda · 1 = centro · 2 = derecha */
  align(n: 0 | 1 | 2): this {
    return this.raw(ESC, 0x61, n);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** GS ! — multiplicador de tamaño (1-8): el TOTAL legible a 1 metro */
  size(width: 1 | 2, height: 1 | 2): this {
    return this.raw(GS, 0x21, ((width - 1) << 4) | (height - 1));
  }

  feed(lines = 1): this {
    return this.raw(ESC, 0x64, lines); // ESC d n
  }

  /** GS V 66 — corte parcial con avance */
  cut(): this {
    return this.raw(GS, 0x56, 66, 3);
  }

  /** ESC p 0 — pulso al pin 2 de la gaveta (estándar RJ-11) */
  drawerPulse(): this {
    return this.raw(ESC, 0x70, 0, 25, 250);
  }

  /**
   * QR nativo (GS ( k, modelo 2): tamaño de módulo, corrección M, datos.
   * Las genéricas modernas lo soportan; si la 2Connect no, el fallback a
   * imagen raster se agrega al probar con el hardware (4.11).
   */
  qr(data: string, moduleSize = 6): this {
    const bytes = encodeCp850(data);
    const len = bytes.length + 3;
    return this
      .raw(GS, 0x28, 0x6b, 4, 0, 49, 65, 50, 0) // modelo 2
      .raw(GS, 0x28, 0x6b, 3, 0, 49, 67, moduleSize) // tamaño de módulo
      .raw(GS, 0x28, 0x6b, 3, 0, 49, 69, 49) // corrección M
      .raw(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 49, 80, 48, ...bytes) // datos
      .raw(GS, 0x28, 0x6b, 3, 0, 49, 81, 48); // imprimir
  }

  /** "izquierda … derecha" rellenando a COLS (montos alineados) */
  row(left: string, right: string, cols = COLS): this {
    const space = cols - left.length - right.length;
    return this.line(space > 0 ? left + " ".repeat(space) + right : `${left} ${right}`.slice(0, cols));
  }

  separator(char = "-", cols = COLS): this {
    return this.line(char.repeat(cols));
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
