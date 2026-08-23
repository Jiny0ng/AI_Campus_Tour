export const NETWORK_SAMPLE_EVENT = "campus-network-sample";

export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const startedAt = performance.now();
  try {
    const response = await fetch(input, init);
    window.dispatchEvent(new CustomEvent(NETWORK_SAMPLE_EVENT, {
      detail: { ttfbMs: performance.now() - startedAt, ok: response.ok, at: Date.now() },
    }));
    return response;
  } catch (error) {
    window.dispatchEvent(new CustomEvent(NETWORK_SAMPLE_EVENT, {
      detail: { ttfbMs: performance.now() - startedAt, ok: false, at: Date.now() },
    }));
    throw error;
  }
}

