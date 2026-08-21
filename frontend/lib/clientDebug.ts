type DebugPayload = Record<string, unknown>;

export function clientDebug(scope: string, event: string, payload: DebugPayload = {}) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[CampusTour:${scope}] ${event}`, {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

export function clientDebugError(scope: string, event: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.error(`[CampusTour:${scope}] ${event}`, {
    timestamp: new Date().toISOString(),
    error: error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error,
  });
}
