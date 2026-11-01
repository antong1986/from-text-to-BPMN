import { setTimeout as delay } from "node:timers/promises";

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

export function isTimeoutError(error: unknown): boolean {
  if (typeof error === "string") {
    return /(?:aborted due to timeout|timed?\s*out|timeout)/i.test(error);
  }
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { name?: unknown; message?: unknown };
  if (maybeError.name === "TimeoutError") return true;
  return typeof maybeError.message === "string" &&
    /(?:aborted due to timeout|timed?\s*out|timeout)/i.test(maybeError.message);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    onRetry?: (attempt: number, status?: number) => void;
    totalTimeoutMs?: number;
    attemptTimeoutMs?: number;
    initialRetryDelayMs?: number;
    maxRetryDelayMs?: number;
  } = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms, signal) => delay(ms, undefined, { signal }));
  const budget = AbortSignal.timeout(options.totalTimeoutMs ?? 120_000);
  const initialRetryDelayMs = options.initialRetryDelayMs ?? 1_000;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 10_000;

  for (let attempt = 1; attempt <= 3; attempt++) {
    budget.throwIfAborted();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.any([
          budget,
          AbortSignal.timeout(options.attemptTimeoutMs ?? 60_000),
          ...(init.signal ? [init.signal] : []),
        ]),
      });
    } catch (error) {
      if (attempt === 3 || budget.aborted || init.signal?.aborted) throw error;
      options.onRetry?.(attempt);
      await sleep(initialRetryDelayMs * 2 ** (attempt - 1), budget);
      continue;
    }

    if (!TRANSIENT_STATUSES.has(response.status) || attempt === 3) return response;

    const retryAfter = response.headers.get("retry-after");
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const requestedWait = Number.isFinite(seconds)
      ? seconds * 1000
      : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
    const waitMs = Math.min(maxRetryDelayMs, Math.max(
      initialRetryDelayMs * 2 ** (attempt - 1),
      Number.isFinite(requestedWait) ? requestedWait : 0,
    ));

    options.onRetry?.(attempt, response.status);
    await response.body?.cancel();
    await sleep(waitMs, budget);
  }

  throw new Error("Retry limit exceeded");
}
