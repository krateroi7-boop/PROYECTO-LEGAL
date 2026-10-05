import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/descubrir?*", (route) => route.fulfill({ status: 503, json: { data: { status: "unavailable", candidates: [], cache: "none" } } }));
  await page.route("**/api/v1/resolver?*", (route) => route.fulfill({ status: 503, json: { data: { status: "unavailable", source: "bcn-leychile", reference: { kind: "idLey", value: "19880" }, cache: "none", checkedAt: null } } }));
});

test("opens the homepage and searches the local corpus", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Legisdata/);
  await page.getByPlaceholder("Buscar leyes, artículos, materias o conceptos").fill("procedimiento");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/\/buscar\?q=procedimiento/);
  await expect(page.getByRole("heading", { name: "Buscar en Legisdata" })).toBeVisible();
  await expect(page.getByText(/19\.880/)).toBeVisible();
});

test("navigates to an article anchor", async ({ page }) => {
  await page.goto("/normas/ley-19880");
  await expect(page.getByRole("heading", { name: /Establece bases/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Índice jurídico" }).getByRole("link", { name: /^Artículo 2[°º]?/ }).click();
  await expect(page).toHaveURL(/\/normas\/ley-19880#articulo-2/);
  await expect(page.locator("#articulo-2")).toBeVisible();
});

test("opens version history and comparison", async ({ page }) => {
  await page.goto("/normas/ley-19880");
  await page.getByRole("link", { name: "Historial" }).click();
  await expect(page).toHaveURL(/\/normas\/ley-19880\/versiones$/);
  await expect(page.getByRole("heading", { name: /Historial de Ley 19.880/ })).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Versión de consulta actual" }).getByRole("link", { name: "Ver texto", exact: true }).click();
  await expect(page).toHaveURL(/\/versiones\//);
  await expect(page.locator(".reader-header-meta")).toContainText("Versión de consulta actual");
  await page.goto("/normas/ley-19880/comparar");
  await expect(page.getByRole("heading", { name: /Cambios en/ })).toBeVisible();
  await expect(page.getByText("Modificados", { exact: true })).toBeVisible();
});

test("protects account pages for anonymous visitors", async ({ page }) => {
  await page.goto("/cuenta", { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await expect(page).toHaveURL(/\/api\/auth\/signin\?callbackUrl=%2Fcuenta/);
});

// Number/alias identity lookup is backed by PostgreSQL, not the text-only fixture search.
test("opens an already published search result directly in the Legisdata reader", { tag: "@postgres" }, async ({ page }) => {
  await page.goto("/buscar?q=Ley+19.880");
  await page.getByRole("link").filter({ hasText: "19.880" }).first().click();
  await expect(page).toHaveURL(/\/normas\/ley-19880$/);
  await expect(page.getByRole("heading", { name: /Establece bases/ })).toBeVisible();
});

test("rejects unsupported references without navigating to arbitrary sources", async ({ page }) => {
  await page.goto("/consultar?referencia=https://example.org/norma");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("La referencia no es válida");
  await expect(page.getByRole("link", { name: "Leer en Legisdata" })).toHaveCount(0);
  await page.getByRole("link", { name: "Legisdata, inicio", exact: true }).click();
  await expect(page).toHaveURL("/");
});

test("opens a fixture text search result directly in the Legisdata reader", { tag: "@fixture" }, async ({ page }) => {
  await page.goto("/buscar?q=19.880");
  await page.getByRole("link").filter({ hasText: "19.880" }).first().click();
  await expect(page).toHaveURL(/\/normas\/ley-19880$/);
  await expect(page.getByRole("heading", { name: /Establece bases/ })).toBeVisible();
});

test("explains unavailable external resolution in the fixture instance", { tag: "@fixture" }, async ({ page }) => {
  let resolverRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/v1/resolver")) resolverRequests++; });
  await page.goto("/consultar?referencia=Ley+19.880");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("La consulta de fuentes externas no está disponible en esta instancia.");
  await expect(page.getByRole("heading", { name: "Consultando la referencia", exact: true })).toHaveCount(0);
  expect(resolverRequests).toBe(0);
  await page.getByRole("link", { name: "Buscar otra norma en Legisdata" }).click();
  await expect(page).toHaveURL("/buscar");
});

for (const route of ["/admin/fuentes", "/admin/importaciones", "/admin/importaciones/00000000-0000-4000-8000-000000000001"]) {
  test(`protects editorial route ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/api\/auth\/signin/);
    await expect(page.getByRole("heading", { name: "Fuentes" })).toHaveCount(0);
  });
}
