const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const bcnConfig = {
  apiUrl: process.env.BCN_API_URL ?? "https://nuevo.leychile.cl/servicios/Navegar/get_norma_json",
  timeoutMs: positiveInt(process.env.BCN_TIMEOUT_MS, 30_000),
  retryCount: positiveInt(process.env.BCN_RETRY_COUNT, 2),
  retryBaseDelayMs: positiveInt(process.env.BCN_RETRY_BASE_DELAY_MS, 500),
  minRequestIntervalMs: positiveInt(process.env.BCN_MIN_REQUEST_INTERVAL_MS, 1_000),
  maxRequestsPerRun: positiveInt(process.env.BCN_MAX_REQUESTS_PER_RUN, 50),
  userAgent: process.env.BCN_USER_AGENT ?? "Legisdata-source-connector/1.0 (contact required)",
};

export const BCN_SOURCE_NAME = "BCN LeyChile";
export const BCN_PARSER_VERSION = "bcn-leychile-json-v1";
