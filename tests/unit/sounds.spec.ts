import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  setSoundsEnabled,
  soundAdd,
  soundError,
  soundRemove,
  soundSuccess,
  soundsEnabled,
} from "@/lib/sounds";

/**
 * Los sonidos no se pueden "oír" en test, pero sí verificamos que respetan el
 * toggle y que cada efecto programa la cantidad correcta de osciladores, con
 * un AudioContext falso. JAMÁS deben lanzar (no bloquean la caja).
 */

const osciladores: unknown[] = [];

class FakeParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class FakeOsc {
  type = "sine";
  frequency = { value: 0 };
  connect(target: unknown) {
    return target;
  }
  start() {}
  stop() {}
}
class FakeGain {
  gain = new FakeParam();
  connect(target: unknown) {
    return target;
  }
}
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    const o = new FakeOsc();
    osciladores.push(o);
    return o;
  }
  createGain() {
    return new FakeGain();
  }
}

// @ts-expect-error inyecta el AudioContext falso en el entorno de test
globalThis.AudioContext = FakeAudioContext;

beforeEach(() => {
  osciladores.length = 0;
  setSoundsEnabled(true);
});

describe("toggle de sonidos", () => {
  it("setSoundsEnabled refleja el estado", () => {
    setSoundsEnabled(false);
    expect(soundsEnabled()).toBe(false);
    setSoundsEnabled(true);
    expect(soundsEnabled()).toBe(true);
  });

  it("desactivado: ningún sonido programa osciladores", () => {
    setSoundsEnabled(false);
    soundAdd();
    soundRemove();
    soundError();
    soundSuccess();
    expect(osciladores).toHaveLength(0);
  });
});

describe("cada efecto programa sus tonos", () => {
  it("agregar y quitar = 1 tono cada uno", () => {
    soundAdd();
    expect(osciladores).toHaveLength(1);
    osciladores.length = 0;
    soundRemove();
    expect(osciladores).toHaveLength(1);
  });

  it("error = 2 tonos (doble beep)", () => {
    soundError();
    expect(osciladores).toHaveLength(2);
  });

  it("éxito = 3 tonos (arpegio)", () => {
    soundSuccess();
    expect(osciladores).toHaveLength(3);
  });
});

describe("nunca lanzan (la caja no se bloquea)", () => {
  it("sin AudioContext en el entorno tampoco lanza", async () => {
    // módulo fresco (ctx=null) para ejercer de verdad `new AudioContext()`
    vi.resetModules();
    const original = globalThis.AudioContext;
    // @ts-expect-error simula un entorno sin WebAudio
    delete globalThis.AudioContext;
    const fresh = await import("@/lib/sounds");
    expect(() => {
      fresh.soundAdd();
      fresh.soundSuccess();
    }).not.toThrow();
    globalThis.AudioContext = original;
  });
});
