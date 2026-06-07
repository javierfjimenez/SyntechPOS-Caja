/**
 * Firma HMAC de eventos (eventos-sync §3) — réplica TS de EventSignature.php.
 * El evento se firma AL CREARSE (offline), no al enviarse.
 *
 * cadena_canonica = ulid \n type \n schema_version \n occurred_at \n json_canonico(payload)
 * json_canonico   = claves ordenadas ascendente byte a byte en TODOS los
 *                   niveles, sin espacios, UTF-8 sin escapar
 *                   (= JSON.stringify con claves pre-ordenadas)
 *
 * Validada byte a byte contra docs/fixtures/firma-hmac.json.
 */

export interface Envelope {
  ulid: string;
  type: string;
  schema_version: number;
  occurred_at: string;
  payload: Record<string, unknown>;
  signature: string;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep); // listas conservan su orden
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort() // orden byte a byte (code units ASCII ≈ strcmp para claves JSON)
        .map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function canonicalString(envelope: Omit<Envelope, "signature">): string {
  return [
    envelope.ulid,
    envelope.type,
    String(envelope.schema_version),
    envelope.occurred_at,
    canonicalJson(envelope.payload),
  ].join("\n");
}

export async function signEnvelope(
  secret: string,
  envelope: Omit<Envelope, "signature">,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(canonicalString(envelope)),
  );
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Construye el sobre completo, firmado al crearse */
export async function buildEnvelope(
  secret: string,
  fields: { ulid: string; type: string; occurred_at: string; payload: Record<string, unknown> },
): Promise<Envelope> {
  const unsigned = { ...fields, schema_version: 1 };
  return { ...unsigned, signature: await signEnvelope(secret, unsigned) };
}
