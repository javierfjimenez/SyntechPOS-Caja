/** Beep de "código no reconocido" (ui-caja §9.2) — WebAudio, sin assets. */

let ctx: AudioContext | null = null;

export function beep(): void {
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // sin audio no se bloquea nada
  }
}
