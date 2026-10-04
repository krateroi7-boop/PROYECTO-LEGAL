/** Explicit local-only, synthetic benchmark. Creates and removes one temporary norm. */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import ts from "typescript";
import { eq } from "drizzle-orm";
import { chromium, expect } from "@playwright/test";
import { getDb, closeDb } from "../src/db/client";
import { norms, normVersions, normNodes, sourceDocuments } from "../src/db/schema";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (process.env.READER_BENCHMARK !== "1" || !["127.0.0.1", "localhost"].includes(database.hostname)) throw new Error("Requires READER_BENCHMARK=1 and a local disposable PostgreSQL database.");
  if (process.env.LEGISDATA_DATA_MODE !== "test") throw new Error("Requires explicit test data mode.");
  const db = getDb(), slug = `reader-benchmark-${randomUUID()}`;
  const [norm] = await db.insert(norms).values({ slug, type: "Ley", number: "SYNTHETIC", title: "Documento sintético para medir el visor", shortTitle: "Prueba de rendimiento", status: "desconocida", description: "No es contenido jurídico", topics: [], publishedAt: new Date("2000-01-01"), updatedAt: new Date() }).returning();
  const [source] = await db.insert(sourceDocuments).values({ sourceName: "Reader benchmark fixture", parser: "local-fixture-v1", checksum: randomUUID(), capturedAt: new Date() }).returning();
  const browser = await chromium.launch({ headless: true }).catch(async (error) => { await db.delete(norms).where(eq(norms.id, norm.id)); await db.delete(sourceDocuments).where(eq(sourceDocuments.id, source.id)); await closeDb(); throw error; });
  try {
    const [version] = await db.insert(normVersions).values({ normId: norm.id, versionLabel: "Versión sintética", publicationStatus: "published", sourceDocumentId: source.id, isCurrent: true }).returning();
    const chapter = randomUUID(), articles = Array.from({ length: 3000 }, () => randomUUID());
    const base = "Texto sintético sin efecto jurídico para medir la lectura. ".repeat(5).slice(0, 200);
    const rows: (typeof normNodes.$inferInsert)[] = [{ id: chapter, versionId: version.id, stableKey: "titulo-1", type: "titulo", label: "Título sintético", text: base, position: 0 }];
    for (let i = 0; i < 3000; i++) rows.push({ id: articles[i], versionId: version.id, parentId: chapter, stableKey: `articulo-${i + 1}`, type: "articulo", label: `Artículo ${i + 1}`, text: `${base.slice(0, 185)} búsqueda única.`, position: i * 4 + 1 });
    for (let i = 0; i < 6999; i++) rows.push({ versionId: version.id, parentId: articles[i % 3000], stableKey: `inciso-${i + 1}`, type: "inciso", label: `Inciso ${i + 1}`, text: base, position: (i % 3000) * 4 + 2 + Math.floor(i / 3000) });
    for (let i = 0; i < rows.length; i += 400) await db.insert(normNodes).values(rows.slice(i, i + 400));
    const page = await browser.newPage({ viewport: { width: 1536, height: 1000 } });
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    const started = performance.now();
    const response = await page.goto(`http://127.0.0.1:3000/normas/${slug}`, { timeout: 120000 });
    const navigationMs = performance.now() - started;
    await page.getByRole("button", { name: "Buscar en esta norma", exact: true }).click({ timeout: 120000 });
    const readyMs = performance.now() - started;
    const client = await page.context().newCDPSession(page);
    await client.send("Performance.enable");
    const engineSource = ts.transpile((await readFile("src/lib/reader/search.ts", "utf8")).replaceAll("export ", ""), { target: ts.ScriptTarget.ES2022 });
    const engine = await page.evaluate(async (source) => {
      const runSearch = new Function(source + "; return searchBlocks;")();
      const blocks = Array.from(document.querySelectorAll("[data-reader-text]")).map((value, i) => ({ value: i, text: value.textContent ?? "" }));
      const slices: number[] = [], started = performance.now();
      const found = await runSearch(blocks, "busqueda unica", new AbortController().signal, (ms: number) => slices.push(ms));
      return { ms: performance.now() - started, maxSliceMs: Math.max(...slices), matches: found.reduce((n: number, b: {matches: unknown[]}) => n + b.matches.length, 0) };
    }, engineSource);
    const before = await client.send("Performance.getMetrics");
    await page.evaluate(() => {
      const measures = { longestTaskMs: 0, queryStart: 0, searchMs: 0 };
      Object.assign(window, { readerBenchmark: measures });
      new PerformanceObserver((list) => { for (const item of list.getEntries()) if (measures.queryStart && item.startTime >= measures.queryStart) measures.longestTaskMs = Math.max(measures.longestTaskMs, item.duration); }).observe({ type: "longtask" });
      document.querySelector("#reader-query")!.addEventListener("input", () => { measures.queryStart = performance.now(); }, { once: true, capture: true });
      const status = document.querySelector(".reader-search [role=status]")!;
      const observer = new MutationObserver(() => { if (status.textContent?.includes("de 3000 coincidencias")) { measures.searchMs = performance.now() - measures.queryStart; observer.disconnect(); } });
      observer.observe(status, { childList: true, characterData: true, subtree: true });
    });
    const searchStart = performance.now();
    await page.locator("#reader-query").fill("busqueda unica");
    await page.locator(".reader-search [role=status]").filter({ hasText: "1 de 3000 coincidencias" }).waitFor({ timeout: 30000 });
    const result = await page.evaluate(() => ({ ...((window as unknown as { readerBenchmark: object }).readerBenchmark), navigation: performance.getEntriesByType("navigation").map((entry) => { const n = entry as PerformanceNavigationTiming; return { responseStart: n.responseStart, responseEnd: n.responseEnd, domInteractive: n.domInteractive, domComplete: n.domComplete, transferSize: n.transferSize }; }), nodes: document.querySelectorAll("[data-reader-node]").length, textChars: Array.from(document.querySelectorAll(".reader-legal-text")).reduce((n, element) => n + (element.textContent?.length ?? 0), 0), domElements: document.querySelectorAll("*").length }));
    const after = await client.send("Performance.getMetrics");
    const metrics = { ...result, engine, browserWork: after.metrics.filter((m) => ["ScriptDuration", "TaskDuration", "LayoutDuration", "RecalcStyleDuration"].includes(m.name)).map((m) => ({ name: m.name, seconds: m.value - (before.metrics.find((b) => b.name === m.name)?.value ?? 0) })), navigationMs, readyMs, observedSearchMs: performance.now() - searchStart, status: response?.status(), errors, cpu: os.cpus()[0]?.model, cpus: os.cpus().length, node: process.version, browser: browser.version() };
    await mkdir(".staging/reader", { recursive: true });
    await writeFile(".staging/reader/benchmark.json", JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics));
    await page.locator('.reader-search button[aria-label="Coincidencia anterior"]').click();
    await expect(page.locator(".reader-search [role=status]")).toHaveText("3000 de 3000 coincidencias");
    await page.waitForFunction(() => {
      const text = document.querySelector("#articulo-3000 .reader-legal-text");
      const rect = text?.getBoundingClientRect();
      return Boolean(rect && rect.bottom > 0 && rect.top < innerHeight);
    });
    const duration = (result as { searchMs?: number }).searchMs ?? Infinity;
    if (engine.maxSliceMs > 50) throw new Error(`Search processing slice exceeded 50 ms: ${Math.round(engine.maxSliceMs)} ms`);
    if (duration - 180 >= 1000) throw new Error(`Search exceeded the 1000 ms budget after debounce: ${Math.round(duration - 180)} ms`);
  } finally { await browser.close(); await db.delete(norms).where(eq(norms.id, norm.id)); await db.delete(sourceDocuments).where(eq(sourceDocuments.id, source.id)); await closeDb(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
