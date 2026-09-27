/** Error thrown by every API call, carrying the backend message. */
export class ApiRequestError extends Error {}

/** Perform a JSON request against the API and unwrap the payload. */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
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
