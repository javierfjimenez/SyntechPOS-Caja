/**
 * ULID (spec ulid/spec): 48 bits de timestamp + 80 de azar, Crockford base32.
 * Los ULID ordenan por tiempo — el outbox se envía en este orden (FIFO por
 * terminal, eventos-sync §1.3). Monotónico dentro del mismo milisegundo:
 * dos eventos del mismo ms jamás se desordenan.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford, sin I L O U

let lastTime = -1;
let lastRandom: number[] = [];

export function ulid(now = Date.now()): string {
  if (now === lastTime) {
    incrementRandom(); // monotonía dentro del mismo ms
  } else {
    lastTime = now;
    lastRandom = randomBytes80();
  }
  return encodeTime(now) + encodeRandom(lastRandom);
}

function encodeTime(time: number): string {
  let out = "";
  for (let i = 9; i >= 0; i--) {
    out = ALPHABET[time % 32]! + out;
    time = Math.floor(time / 32);
  }
  return out;
}

/** 16 caracteres base32 = 80 bits, guardados como 16 índices 0-31 */
function randomBytes80(): number[] {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % 32);
}

function incrementRandom(): void {
  for (let i = lastRandom.length - 1; i >= 0; i--) {
    if (lastRandom[i]! < 31) {
      lastRandom[i]!++;
      return;
    }
    lastRandom[i] = 0;
  }
  // overflow total (2^80 incrementos en 1 ms): imposible en la práctica
}

function encodeRandom(indices: number[]): string {
  return indices.map((i) => ALPHABET[i]!).join("");
}

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
