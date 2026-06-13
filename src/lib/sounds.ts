/**
 * Sonidos de caja (feedback audible sin mirar la pantalla — clave para la
 * velocidad de escaneo). WebAudio puro, SIN assets que empaquetar. Cada tono
 * es fire-and-forget y JAMÁS bloquea: si no hay audio, no pasa nada.
 *
 * Configurable: la preferencia vive en el store `terminal` (local por caja) y
 * sincroniza este flag vía setSoundsEnabled. Default ON.
 */

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundsEnabled(on: boolean): void {
  enabled = on;
}

export function soundsEnabled(): boolean {
  return enabled;
}

interface Tone {
  freq: number;
  start: number; // segundos desde ahora
  dur: number; // segundos
  type?: OscillatorType;
  gain?: number;
}

function play(tones: Tone[]): void {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? "sine";
      osc.frequency.value = tone.freq;
      const peak = tone.gain ?? 0.07;
      const s = t0 + tone.start;
      const e = s + tone.dur;
      // envolvente rápida para evitar clics
      gain.gain.setValueAtTime(0.0001, s);
      gain.gain.exponentialRampToValueAtTime(peak, s + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, e);
      osc.connect(gain).connect(ctx.destination);
      osc.start(s);
      osc.stop(e + 0.02);
    }
  } catch {
    // sin audio (o navegador sin gesto previo) no se bloquea nada
  }
}

/** Producto agregado / +1: blip corto y agudo. */
export function soundAdd(): void {
  play([{ freq: 1180, start: 0, dur: 0.06, type: "sine", gain: 0.06 }]);
}

/** Producto quitado / −1: tono corto y grave (se distingue del agregar). */
export function soundRemove(): void {
  play([{ freq: 460, start: 0, dur: 0.07, type: "sine", gain: 0.06 }]);
}

/** Error / código no reconocido (ui-caja §9.2): doble beep grave. */
export function soundError(): void {
  play([
    { freq: 220, start: 0, dur: 0.1, type: "square", gain: 0.07 },
    { freq: 196, start: 0.13, dur: 0.13, type: "square", gain: 0.07 },
  ]);
}

/** Venta cobrada: arpegio ascendente (E5 → B5 → E6). */
export function soundSuccess(): void {
  play([
    { freq: 659.25, start: 0, dur: 0.09, type: "triangle", gain: 0.06 },
    { freq: 987.77, start: 0.1, dur: 0.09, type: "triangle", gain: 0.06 },
    { freq: 1318.51, start: 0.2, dur: 0.14, type: "triangle", gain: 0.06 },
  ]);
}
