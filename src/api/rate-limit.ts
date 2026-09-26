type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function enforceRateLimit(request: Request, options: { limit?: number; windowMs?: number } = {}) {
  const limit = options.limit ?? Number(process.env.API_RATE_LIMIT ?? 120);
  const windowMs = options.windowMs ?? Number(process.env.API_RATE_WINDOW_MS ?? 60_000);
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) {
    const error = new Error("RATE_LIMITED");
    throw error;
  }
  current.count += 1;
}
