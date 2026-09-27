/** Error thrown by every API call, carrying the backend message. */
export class ApiRequestError extends Error {}

/**
 * Absolute origin of the API, injected by `vite.config.ts` from API_HOST and
 * API_PORT. The browser calls the API directly, so every request has to carry
 * it: there is no proxy in front of `/api`.
 */
const apiOrigin = import.meta.env.VITE_API_URL

/** Full URL of an API path. Callers always write the path, never the origin. */
function apiUrl(path: string): string {
  return `${apiOrigin}${path}`
}

/** Perform a JSON request against the API and unwrap the payload. */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(url), init)
  } catch (error) {
    throw new ApiRequestError(`Cannot reach the API: ${(error as Error).message}`)
  }

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // The body was not JSON: keep the status line as the message.
    }
    throw new ApiRequestError(message)
  }

  return (await response.json()) as T
}

/** Perform a POST with a JSON body. */
export function postJson<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
