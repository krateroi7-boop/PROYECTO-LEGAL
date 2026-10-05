import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";
let production: ChildProcess;
const productionUrl = "http://127.0.0.1:3102";
test.describe("public library product experience", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => {
    production = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3102"], {
      env: { ...process.env, LEGISDATA_DATA_MODE: "production", DATABASE_URL: process.env.DATABASE_URL ?? "", AUTH_TRUST_HOST: "true", AUTH_SECRET: process.env.AUTH_SECRET || "isolated-library-e2e-only" }, stdio: "ignore",
    });
    await expect.poll(async () => {
      if (production.exitCode !== null) throw new Error("Production preview exited");
      try { return (await fetch(productionUrl)).status; } catch { return 0; }
    }, { timeout: 120000 }).toBe(200);
  });
  test.afterAll(() => { production?.kill("SIGTERM"); });
  test("production prioritizes actual planned codes without exposing fixture readers or false article counts", async ({ page }) => {
    await page.goto(productionUrl);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Buscar legislación chilena");
    const cards = page.locator(".catalog-card");
    await expect(cards).toHaveCount(6);
    for (const name of ["Código Civil", "Código de Procedimiento Civil", "Código Penal", "Código del Trabajo"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.locator('a[href^="/normas/"]')).toHaveCount(0);
    await expect(page.getByText("Próximamente disponible", { exact: true })).toHaveCount(6);
    await expect(page.getByText(/\d+ artículos/)).toHaveCount(0);
    await expect(page.locator("footer")).not.toContainText(/Prototipo|Datos de referencia/);
    await expect(page.getByText("Protección de la vida privada", { exact: true })).toHaveCount(0);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await cards.first().evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(260);
    }
  });
  test("blocked metadata has a common name, secondary official identification and an official link without a technical detour", async ({ page }) => {
    let resolverCalls = 0;
    page.on("request", (r) => { if (r.url().includes("/api/v1/resolver")) resolverCalls++; });
    await page.route("**/api/v1/descubrir?*", (route) => route.fulfill({ json: { data: { status: "available", cache: "hit", candidates: [{ source: "bcn-leychile", externalId: "172986", resourceUri: "https://datos.bcn.cl/recurso/cl/ley/172986", sourceUrl: "https://www.bcn.cl/leychile/navegar?idNorma=172986", reference: { kind: "idNorma", value: "172986" }, title: "FIJA TEXTO REFUNDIDO, COORDINADO Y SISTEMATIZADO DEL CODIGO CIVIL Y OTRAS LEYES", type: "DFL", number: "1", organisms: [{ uri: "https://example.test/organism", name: "Ministerio de Justicia" }], match: { strategy: "alias", fields: ["number"] }, provenance: { endpoint: "https://datos.bcn.cl/sparql", observedAt: new Date().toISOString(), adapterVersion: "test" } }] } } }));
    await page.goto(`${productionUrl}/buscar?q=codigo+civil`);
    await expect(page.getByRole("heading", { name: "Código Civil", exact: true })).toBeVisible();
    await expect(page.getByText("Encontrada, pendiente de incorporación", { exact: true })).toBeVisible();
    await expect(page.locator(".formal-title")).toContainText("FIJA TEXTO REFUNDIDO");
    await expect(page.getByText("Ministerio de Justicia", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Consultar fuente oficial" })).toHaveAttribute("href", /idNorma=172986/);
    await expect(page.locator('a[href^="/consultar"],a[href^="/normas/"]')).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(/estado editorial|política de fuente|Metadatos BCN|Coincidencia calculada|Incorporación no habilitada/);
    expect(resolverCalls).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
test("blocked consultation stays private and speaks in product terms", { tag: "@postgres" }, async ({ page, request }) => {
  await page.goto("/consultar?referencia=idNorma:172986&busqueda=codigo+civil");
  await expect(page.getByRole("heading", { name: "Esta norma aún no está disponible en Legisdata" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver a resultados" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Consultar fuente oficial" })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/política de fuente|revisión editorial|Incorporación no habilitada/);
  await expect(page.locator("[data-reader-text]")).toHaveCount(0);
  const result = await request.get("/api/v1/resolver?referencia=idNorma:172986");
  expect((await result.json()).data).not.toHaveProperty("normalizedContent");
});
