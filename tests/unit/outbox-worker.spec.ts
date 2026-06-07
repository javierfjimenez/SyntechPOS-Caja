import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import { BASE_DELAY_MS, MAX_DELAY_MS, backoffDelayMs } from "@/lib/backoff";
import type { OutboxRow } from "@/db/outbox";
import { drainOutbox, type DrainDeps } from "@/services/outbox-worker";

/**
 * Cobertura INNEGOCIABLE (CLAUDE.md): outbox — idempotencia y ORDEN.
 */

const row = (ulid: string, attempts = 0): OutboxRow => ({
  ulid,
  payload: JSON.stringify({ ulid, type: "sale.completed", schema_version: 1, occurred_at: "x", payload: {}, signature: "f".repeat(64) }),
  attempts,
});

function makeDeps(queue: OutboxRow[][], post: DrainDeps["post"]): DrainDeps & {
  confirmed: string[][];
  retried: { ulids: string[]; at: Date }[];
} {
  const confirmed: string[][] = [];
  const retried: { ulids: string[]; at: Date }[] = [];
  return {
    dueBatch: async () => queue.shift() ?? [],
    post,
    markConfirmed: async (ulids) => {
      confirmed.push(ulids);
    },
    markRetry: async (ulids, at) => {
      retried.push({ ulids, at });
    },
    now: () => 1_000_000,
    random: () => 0.5, // jitter neutro
    confirmed,
    retried,
  };
}

const ok = (ulids: string[], status = "processed") => async () => ({
  results: ulids.map((ulid) => ({ ulid, status: status as never })),
  min_client_version: "0.0.0",
  server_time: "2026-06-07T12:00:00-04:00",
});

describe("drainOutbox (orden FIFO y lotes de 50)", () => {
  it("drena lotes seguidos hasta vaciar, en orden ULID", async () => {
    const sent: string[] = [];
    const deps = makeDeps(
      [[row("01A"), row("01B")], [row("01C")]],
      async (envelopes) => {
        sent.push(...envelopes.map((e) => e.ulid));
        return (await ok(envelopes.map((e) => e.ulid))());
      },
    );

    const summary = await drainOutbox(deps);

    expect(sent).toEqual(["01A", "01B", "01C"]); // orden intacto
    expect(summary.sent).toBe(3);
    expect(summary.confirmed).toBe(3);
    expect(deps.confirmed.flat()).toEqual(["01A", "01B", "01C"]);
  });

  it("outbox vacío: cero llamadas a la red", async () => {
    const post = vi.fn();
    const deps = makeDeps([], post as never);
    await drainOutbox(deps);
    expect(post).not.toHaveBeenCalled();
  });

  it("TODOS los status confirman localmente (duplicate/deferred/quarantined incluidos)", async () => {
    const deps = makeDeps([[row("01A"), row("01B"), row("01C"), row("01D")]], async () => ({
      results: [
        { ulid: "01A", status: "processed" as const },
        { ulid: "01B", status: "duplicate" as const },
        { ulid: "01C", status: "deferred" as const, detail: "la sesión no existe aún" },
        { ulid: "01D", status: "quarantined" as const, detail: "schema" },
      ],
      min_client_version: "0.0.0",
      server_time: "x",
    }));

    const summary = await drainOutbox(deps);
    expect(deps.confirmed.flat()).toEqual(["01A", "01B", "01C", "01D"]);
    expect(summary.quarantined).toHaveLength(1);
    expect(summary.quarantined[0]!.ulid).toBe("01D");
  });

  it("fallo de red: el lote agenda reintento con backoff y NO sigue drenando", async () => {
    const deps = makeDeps([[row("01A", 2)], [row("01B")]], async () => {
      throw new ApiError("Sin conexión con el servidor.", null);
    });

    const summary = await drainOutbox(deps);

    expect(summary.retryScheduled).toBe(true);
    expect(summary.sent).toBe(0);
    expect(deps.retried).toHaveLength(1);
    // attempts=2 → 4s de backoff (jitter neutro con random=0.5)
    expect(deps.retried[0]!.at.getTime()).toBe(1_000_000 + 4_000);
  });

  it("401/403 → onRevoked, sin reintento (el token no se arregla reintentando)", async () => {
    const onRevoked = vi.fn();
    const deps = {
      ...makeDeps([[row("01A")]], async () => {
        throw new ApiError("Terminal desvinculada.", 403);
      }),
      onRevoked,
    };

    const summary = await drainOutbox(deps);
    expect(onRevoked).toHaveBeenCalledOnce();
    expect(summary.retryScheduled).toBe(false);
    expect(deps.retried).toHaveLength(0);
  });

  it("reporta min_client_version del servidor (semilla de 4.12)", async () => {
    const info = vi.fn();
    const deps = { ...makeDeps([[row("01A")]], ok(["01A"])), onServerInfo: info };
    await drainOutbox(deps);
    expect(info).toHaveBeenCalledWith({ min_client_version: "0.0.0", server_time: "2026-06-07T12:00:00-04:00" });
  });
});

describe("backoffDelayMs (1s → 2s → 4s … máx 5 min, jitter ±20%)", () => {
  it("crece exponencial con jitter neutro", () => {
    const neutral = () => 0.5;
    expect(backoffDelayMs(0, neutral)).toBe(1_000);
    expect(backoffDelayMs(1, neutral)).toBe(2_000);
    expect(backoffDelayMs(3, neutral)).toBe(8_000);
  });

  it("tope de 5 minutos", () => {
    expect(backoffDelayMs(20, () => 0.5)).toBe(MAX_DELAY_MS);
  });

  it("el jitter queda dentro de ±20%", () => {
    expect(backoffDelayMs(0, () => 0)).toBe(BASE_DELAY_MS * 0.8);
    expect(backoffDelayMs(0, () => 1)).toBe(BASE_DELAY_MS * 1.2);
  });
});
