import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import vector from "../../docs/fixtures/firma-hmac.json";
import { canonicalJson, canonicalString, signEnvelope } from "@/services/event-signing";

/**
 * Cobertura INNEGOCIABLE (CLAUDE.md): la firma TS debe reproducir BYTE A BYTE
 * el vector compartido con el servidor (docs/fixtures/firma-hmac.json).
 * Si esto rompe, el servidor pondrá los eventos en cuarentena con alerta crítica.
 */

const envelope = vector.envelope as {
  ulid: string;
  type: string;
  schema_version: number;
  occurred_at: string;
  payload: Record<string, unknown>;
};

describe("firma HMAC contra el vector canónico", () => {
  it("la cadena canónica produce el sha256 del vector (bytes idénticos)", () => {
    const canonical = canonicalString(envelope);
    const sha = createHash("sha256").update(canonical, "utf8").digest("hex");
    expect(sha).toBe(vector.cadena_canonica_sha256);
  });

  it("la firma HMAC-SHA256 es exactamente la esperada", async () => {
    expect(await signEnvelope(vector.secret, envelope)).toBe(vector.signature_esperada);
  });
});

describe("canonicalJson (precisión del contrato)", () => {
  it("ordena claves ascendente en TODOS los niveles, sin espacios", () => {
    expect(canonicalJson({ b: 1, a: { z: null, m: [{ y: 2, x: 1 }] } })).toBe(
      '{"a":{"m":[{"x":1,"y":2}],"z":null},"b":1}',
    );
  });

  it("las listas conservan su orden (solo se ordenan las claves)", () => {
    expect(canonicalJson({ lines: [3, 1, 2] })).toBe('{"lines":[3,1,2]}');
  });

  it("UTF-8 sin escapar (ñ, tildes) — como JSON_UNESCAPED_UNICODE", () => {
    expect(canonicalJson({ d: "Piña 1lb" })).toBe('{"d":"Piña 1lb"}');
  });

  it("slashes sin escapar — como JSON_UNESCAPED_SLASHES", () => {
    expect(canonicalJson({ u: "a/b" })).toBe('{"u":"a/b"}');
  });
});
