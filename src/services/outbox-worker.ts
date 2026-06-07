import { MAX_BATCH, type EventResult, type PostEventsResponse } from "@/api/events";
import { ApiError } from "@/api/client";
import { backoffDelayMs } from "@/lib/backoff";
import type { Envelope } from "@/services/event-signing";
import type { OutboxRow } from "@/db/outbox";

/**
 * El worker del outbox (tarea 4.7): drena en orden ULID, lotes de máx. 50,
 * respuesta por evento. La caja NUNCA espera este proceso (la venta se
 * completó al imprimirse el ticket); reenviar es siempre seguro.
 *
 * Dependencias inyectadas: la orquestación se testea sin red ni SQLite.
 */

export interface DrainDeps {
  dueBatch: (limit: number) => Promise<OutboxRow[]>;
  post: (envelopes: Envelope[]) => Promise<PostEventsResponse>;
  markConfirmed: (ulids: string[]) => Promise<void>;
  markRetry: (ulids: string[], nextRetryAt: Date) => Promise<void>;
  /** 401/403: terminal revocada — el que llama decide qué mostrar */
  onRevoked?: () => void;
  onServerInfo?: (info: { min_client_version: string; server_time: string }) => void;
  now?: () => number;
  random?: () => number;
}

export interface DrainSummary {
  sent: number;
  confirmed: number;
  quarantined: EventResult[];
  /** true si quedó trabajo pendiente (fallo de red → backoff) */
  retryScheduled: boolean;
}

export async function drainOutbox(deps: DrainDeps): Promise<DrainSummary> {
  const summary: DrainSummary = { sent: 0, confirmed: 0, quarantined: [], retryScheduled: false };

  // Lotes seguidos hasta vaciar (una caja con días offline drena completa)
  for (;;) {
    const batch = await deps.dueBatch(MAX_BATCH);
    if (batch.length === 0) return summary;

    const envelopes = batch.map((row) => JSON.parse(row.payload) as Envelope);

    let response: PostEventsResponse;
    try {
      response = await deps.post(envelopes);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        deps.onRevoked?.();
        return summary; // sin token válido no hay nada que reintentar aquí
      }
      // red / 429 / 5xx: backoff exponencial con jitter sobre el lote
      const attempts = batch[0]!.attempts;
      const delay = backoffDelayMs(attempts, deps.random);
      await deps.markRetry(
        batch.map((r) => r.ulid),
        new Date((deps.now?.() ?? Date.now()) + delay),
      );
      summary.retryScheduled = true;
      return summary;
    }

    summary.sent += batch.length;
    deps.onServerInfo?.({
      min_client_version: response.min_client_version,
      server_time: response.server_time,
    });

    // TODOS los status confirman localmente; quarantined se reporta
    // (reenviarlo no lo arregla — el forense vive en el servidor)
    await deps.markConfirmed(response.results.map((r) => r.ulid));
    summary.confirmed += response.results.length;
    summary.quarantined.push(...response.results.filter((r) => r.status === "quarantined"));
  }
}
