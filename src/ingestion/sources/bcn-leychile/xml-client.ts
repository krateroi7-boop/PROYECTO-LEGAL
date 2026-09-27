import { createHash } from "node:crypto";
import { XMLValidator } from "fast-xml-parser";
import { validateBcnReference, type BcnXmlReference } from "./reference";

export const BCN_XML_ENDPOINT = "https://www.leychile.cl/Consulta/obtxml";
export const BCN_XML_MAX_BODY_BYTES = 10 * 1024 * 1024;

export type BcnXmlErrorCode = "not-found" | "rate-limit" | "timeout" | "upstream" | "invalid-response" | "payload-limit";

export class BcnXmlError extends Error {
  constructor(public readonly code: BcnXmlErrorCode, message: string, public readonly httpStatus?: number, public readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "BcnXmlError";
  }

  get kind() { return this.code; }
  get retryAfterMs() { return this.retryAfterSeconds === undefined ? undefined : this.retryAfterSeconds * 1_000; }
}

type BcnXmlObservation = {
  source: "BCN LeyChile";
  reference: BcnXmlReference;
  url: string;
  capturedAt: string;
  etag: string | null;
  lastModified: string | null;
};

export type BcnXmlFetchResult = (BcnXmlObservation & { kind: "modified"; httpStatus: 200; raw: string; checksum: string })
  | (BcnXmlObservation & { kind: "not-modified"; httpStatus: 304 });

export type BcnXmlFetchOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
  maxBodyBytes?: number;
  retryCount?: number;
  userAgent?: string;
};

/** No DTD or custom entity declarations are necessary for the documented exchange schema. */
export function validateBcnXmlPayload(raw: string, maxBytes = BCN_XML_MAX_BODY_BYTES): void {
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new BcnXmlError("payload-limit", "El XML BCN supera el tamaño máximo permitido.");
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(raw)) throw new BcnXmlError("invalid-response", "El XML BCN contiene una declaración DTD o de entidades no admitida.");
  const encoding = raw.slice(0, 200).match(/<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)["']/i)?.[1];
  if (encoding && !/^utf-?8$/i.test(encoding)) throw new BcnXmlError("invalid-response", "El XML BCN utiliza una codificación no admitida en este piloto.");
  const validation = XMLValidator.validate(raw);
  if (validation !== true) throw new BcnXmlError("invalid-response", "BCN no entregó XML bien formado.");
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError("Configuración de límites BCN inválida.");
  return value;
}

function retryAfter(response: Response, now: number): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Math.min(Number(value), 86_400);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1_000)) : undefined;
}

async function readBoundedBody(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new BcnXmlError("payload-limit", "El XML BCN supera el tamaño máximo permitido.");
  }
  if (!response.body) throw new BcnXmlError("invalid-response", "BCN entregó una respuesta vacía.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      const next = await reader.read();
      if (signal.aborted) throw new BcnXmlError("timeout", "Se agotó el tiempo de espera de BCN.");
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new BcnXmlError("payload-limit", "El XML BCN supera el tamaño máximo permitido.");
      }
      chunks.push(next.value);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
    } catch {
      throw new BcnXmlError("invalid-response", "BCN entregó caracteres no válidos en UTF-8.");
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

/** Fetches only the documented, fixed HTTPS endpoint. Redirects are not followed. */
export async function fetchBcnXml(reference: BcnXmlReference, options: BcnXmlFetchOptions = {}): Promise<BcnXmlFetchResult> {
  const validated = validateBcnReference(reference);
  const timeoutMs = boundedInteger(options.timeoutMs, 30_000, 1, 60_000);
  const maxBodyBytes = boundedInteger(options.maxBodyBytes, BCN_XML_MAX_BODY_BYTES, 1, 20 * 1024 * 1024);
  const retryCount = boundedInteger(options.retryCount, 1, 0, 2);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const url = new URL(BCN_XML_ENDPOINT);
  url.searchParams.set("opt", "7");
  url.searchParams.set(validated.kind, validated.value);
  const headers = new Headers({ accept: "application/xml, text/xml;q=0.9", "user-agent": options.userAgent ?? process.env.BCN_USER_AGENT ?? "Legisdata-source-connector/1.0" });
  if (options.etag) headers.set("if-none-match", options.etag);
  if (options.lastModified) headers.set("if-modified-since", options.lastModified);

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new BcnXmlError("timeout", `Se agotó el tiempo de espera de BCN (${timeoutMs} ms).`));
          controller.abort();
        }, timeoutMs);
      });
      const operation = async (): Promise<BcnXmlFetchResult> => {
        const response = await fetchImpl(url, { headers, signal: controller.signal, redirect: "manual", cache: "no-store" });
        const observation: BcnXmlObservation = {
          source: "BCN LeyChile", reference: validated, url: url.toString(), capturedAt: new Date(now()).toISOString(),
          etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"),
        };
        if (response.status === 304) {
          if (!options.etag && !options.lastModified) throw new BcnXmlError("invalid-response", "BCN devolvió 304 sin una solicitud condicional.", 304);
          return { ...observation, kind: "not-modified", httpStatus: 304 };
        }
        if (response.status !== 200) {
          await response.body?.cancel();
          if (response.status === 404 || response.status === 410) throw new BcnXmlError("not-found", "La fuente BCN no encontró la norma.", response.status);
          if (response.status === 429) throw new BcnXmlError("rate-limit", "BCN limitó temporalmente las solicitudes.", response.status, retryAfter(response, now()));
          throw new BcnXmlError("upstream", `BCN respondió HTTP ${response.status}.`, response.status, retryAfter(response, now()));
        }
        const contentType = response.headers.get("content-type")?.toLowerCase();
        if (contentType && /(?:text\/html|application\/json)/.test(contentType)) {
          await response.body?.cancel();
          throw new BcnXmlError("invalid-response", "BCN entregó un formato distinto de XML.");
        }
        const raw = await readBoundedBody(response, maxBodyBytes, controller.signal);
        validateBcnXmlPayload(raw, maxBodyBytes);
        return { ...observation, kind: "modified", httpStatus: 200, raw, checksum: createHash("sha256").update(raw, "utf8").digest("hex") };
      };
      return await Promise.race([operation(), timeout]);
    } catch (caught) {
      const error = caught instanceof BcnXmlError ? caught : new BcnXmlError(controller.signal.aborted ? "timeout" : "upstream", controller.signal.aborted ? "Se agotó el tiempo de espera de BCN." : "No fue posible conectar con BCN.");
      const transient = error.code === "timeout" || error.code === "rate-limit" || (error.code === "upstream" && (error.httpStatus === undefined || error.httpStatus >= 500));
      if (!transient || attempt >= retryCount || (error.retryAfterSeconds ?? 0) > 30) throw error;
      if (timer) clearTimeout(timer);
      await sleep(error.retryAfterSeconds !== undefined ? error.retryAfterSeconds * 1_000 : 500 * 2 ** attempt);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
