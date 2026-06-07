import { apiRequest, type ApiOptions } from "@/api/client";
import type { Envelope } from "@/services/event-signing";

/**
 * POST /sync/events (eventos-sync §2/§5): lote máx. 50, en orden de outbox;
 * respuesta POR evento en el mismo orden. Este endpoint JAMÁS responde 426.
 */

export const MAX_BATCH = 50;

export type EventStatus = "processed" | "duplicate" | "quarantined" | "deferred";

export interface EventResult {
  ulid: string;
  status: EventStatus;
  detail?: string;
}

export interface PostEventsResponse {
  results: EventResult[];
  min_client_version: string;
  server_time: string;
}

export async function postEvents(
  envelopes: Envelope[],
  opts: ApiOptions,
): Promise<PostEventsResponse> {
  return apiRequest<PostEventsResponse>("POST", "/sync/events", { events: envelopes }, opts);
}
