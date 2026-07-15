export interface HealthWaitOptions {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  timeoutMs?: number;
  intervalMs?: number;
  requestTimeoutMs?: number;
}

function abortError(): Error {
  const error = new Error("Health check aborted");
  error.name = "AbortError";
  return error;
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    timer.unref();
    function done(): void {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted(): void {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

export async function waitForHealth(url: string, options: HealthWaitOptions = {}): Promise<void> {
  const fetchHealth = options.fetch ?? fetch;
  const wait = options.sleep ?? sleep;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 250;
  const requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw abortError();
    try {
      const remainingMs = Math.max(1, deadline - Date.now());
      const timeoutSignal = AbortSignal.timeout(Math.min(requestTimeoutMs, remainingMs));
      const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
      const response = await fetchHealth(url, { cache: "no-store", signal });
      if (response.ok) return;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      lastError = error;
    }
    await wait(intervalMs, options.signal);
  }

  throw new Error(`Timed out waiting for ${url}: ${String(lastError ?? "unknown error")}`);
}
