// Proxy/network error pages are not JSON. Keep their implementation details
// out of user-facing errors while letting callers preserve their form state.
export async function clientResponse(response: Response): Promise<Record<string, unknown>> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Could not read the server response. Please try again.');
  }
  return data as Record<string, unknown>;
}
