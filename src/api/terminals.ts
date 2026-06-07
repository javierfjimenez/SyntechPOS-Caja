import { apiRequest, type ApiOptions } from "@/api/client";

/**
 * Vinculación del terminal (ui-caja.md §2): código de 6 dígitos de un solo
 * uso → token Sanctum + hmac_secret. ÚNICO flujo que exige internet.
 * Respuesta exacta de POST /api/v1/terminals/link (servidor SyntechPOS).
 */

export interface LinkResult {
  token: string;
  hmac_secret: string;
  terminal: {
    id: number;
    name: string;
    branch: string | null;
    business: string | null;
  };
}

export async function linkTerminal(
  code: string,
  opts: Omit<ApiOptions, "token">,
): Promise<LinkResult> {
  return apiRequest<LinkResult>(
    "POST",
    "/terminals/link",
    { code, app_version: opts.appVersion },
    opts,
  );
}

export interface PingResult {
  status: string;
  server_time: string;
  min_client_version: string;
}

/** Heartbeat (M6): alimenta el ● de la barra de estado y el aviso de versión mínima */
export async function ping(opts: ApiOptions): Promise<PingResult> {
  return apiRequest<PingResult>("GET", "/ping", undefined, opts);
}
