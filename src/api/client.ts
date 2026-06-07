/**
 * Cliente HTTP mínimo hacia el servidor SyntechPOS (eventos-sync.md §2).
 * Header X-Client-Version obligatorio en toda llamada (D14).
 */

export const DEFAULT_API_URL =
  (import.meta.env?.VITE_API_URL as string | undefined) ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null, // null = sin conexión / red
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiOptions {
  baseUrl: string;
  appVersion: string;
  token?: string;
  fetchFn?: typeof fetch;
}

export async function apiRequest<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  opts: ApiOptions,
): Promise<T> {
  const fetchFn = opts.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(`${opts.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Client-Version": opts.appVersion,
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Sin conexión con el servidor.", null);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : `Error del servidor (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}
