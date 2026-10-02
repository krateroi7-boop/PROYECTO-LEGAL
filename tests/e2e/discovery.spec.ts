import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "../../src/db/client";
import { auditLogs, importBatches, norms, sessions, users } from "../../src/db/schema";

const candidate = (id: string, title: string, strategy = "title") => ({ source: "bcn-leychile", resourceUri: `https://datos.bcn.cl/recurso/test/${id}`, externalId: id, reference: { kind: "idNorma", value: id }, title, match: { strategy, fields: [strategy] }, provenance: { endpoint: "https://datos.bcn.cl/sparql", observedAt: new Date().toISOString(), adapterVersion: "test-v1" } });

for (const query of ["Código Civil", "codigo civil"]) {
  test(`keeps local absence separate from external results for ${query}`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    let xmlRequests = 0;
    page.on("request", (request) => { if (request.url().includes("/api/v1/resolver")) xmlRequests++; });
    await page.route("**/api/v1/descubrir?*", async (route) => { await gate; await route.fulfill({ json: { data: { status: "available", cache: "hit", candidates: [candidate("999999996", "Código Civil — candidato de prueba")] } } }); });
    try {
      await page.goto(`/buscar?q=${encodeURIComponent(query)}`);
      await expect(page.getByText("No hay publicaciones locales que coincidan con esta búsqueda.")).toBeVisible();
      await expect(page.getByText("Buscando más normas…")).toBeVisible();
      await expect(page.getByText("No encontramos normas que coincidan con tu búsqueda.")).toHaveCount(0);
      release();
      await expect(page.getByText("1 coincidencia disponible para consultar.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Código Civil — candidato de prueba", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Consultar esta norma", exact: true })).toHaveAttribute("href", /referencia=idNorma%3A999999996/);
      expect(xmlRequests).toBe(0);
    } finally { release(); }
  });
}

for (const reason of ["rate-limit", "source_backoff"]) {
  // /consultar checks persistence on the server before mounting ResolutionPanel.
  // Browser routes cannot replace that PostgreSQL precondition.
  test(`explains ${reason} without losing the official link or polling beyond the time limit`, { tag: "@postgres" }, async ({ page }) => {
    await page.clock.install();
    await page.route("**/api/v1/descubrir?*", (route) => route.fulfill({ json: { data: { status: "empty", candidates: [], cache: "negative" } } }));
    let requests = 0;
    await page.route("**/api/v1/resolver?*", (route) => {
      requests++;
      return route.fulfill({ status: 503, json: { data: { status: "unavailable", source: "bcn-leychile", reason, retryAfterSeconds: 300, cache: "none", checkedAt: null, reference: { kind: "idNorma", value: "999999996" } } } });
    });
    await page.goto("/consultar?referencia=idNorma:999999996&busqueda=codigo%20civil");
    await expect(page.getByText("No se pudo recuperar el texto desde BCN. Esto no significa que la norma no exista.")).toBeVisible();
    await expect(page.getByText(/Intente nuevamente en aproximadamente 5 minutos/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Consultar fuente BCN" })).toHaveAttribute("href", "https://www.bcn.cl/leychile/navegar?idNorma=999999996");
    await expect(page.getByRole("button", { name: "Solicitar revisión" })).toHaveCount(0);
    await page.clock.fastForward(310000);
    await expect(page.getByText("La comprobación está tardando. Puede volver a intentarlo.")).toHaveCount(0);
    expect(requests).toBe(1);
    await page.getByRole("link", { name: "Volver a resultados" }).click();
    await expect(page).toHaveURL(/\/buscar\?q=codigo%20civil/);
  });
}

test("local publications render while remote metadata is delayed, then remain readable on failure", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  let xmlRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/v1/resolver")) xmlRequests++; });
  await page.route("**/api/v1/descubrir?*", async (route) => { await gate; await route.fulfill({ status: 503, json: { data: { status: "unavailable", candidates: [], cache: "none" } } }); });
  try {
    await page.goto("/buscar?q=procedimiento+administrativo");
    await expect(page.getByRole("heading", { name: "Publicado en Legisdata", exact: true })).toBeVisible();
    await expect(page.getByRole("link").filter({ hasText: "19.880" }).first()).toBeVisible();
    await expect(page.getByText("Buscando más normas…")).toBeVisible();
    release();
    await expect(page.getByText("BCN no está disponible ahora. Los resultados locales siguen disponibles.")).toBeVisible();
    expect(xmlRequests).toBe(0);
    await page.getByRole("link").filter({ hasText: "19.880" }).first().click();
    await expect(page).toHaveURL(/\/normas\/ley-19880$/);
  } finally { release(); }
});

test("deduplicates only verified local identities and opens other published candidates directly", async ({ page }) => {
  await page.route("**/api/v1/descubrir?*", (route) => route.fulfill({ json: { data: { status: "available", cache: "hit", candidates: [
    { ...candidate("210676", "Coincidencia con identidad verificada"), local: { slug: "ley-19880" } },
    { ...candidate("141599", "Otra publicación disponible"), local: { slug: "ley-19628" } },
  ] } } }));
  await page.goto("/buscar?q=procedimiento+administrativo");
  await expect(page.getByRole("heading", { name: "Otra publicación disponible" })).toBeVisible();
  await expect(page.getByText("Coincidencia con identidad verificada")).toHaveCount(0);
  await page.getByRole("link", { name: "Leer en Legisdata", exact: true }).click();
  await expect(page).toHaveURL(/\/normas\/ley-19628$/);
});

test("routes human consultation back to the same search experience", async ({ page }) => {
  await page.route("**/api/v1/descubrir?*", (route) => route.fulfill({ json: { data: { status: "empty", candidates: [], cache: "negative" } } }));
  await page.goto("/consultar?q=procedimiento+administrativo");
  await expect(page).toHaveURL(/\/buscar\?q=procedimiento%20administrativo/);
  await expect(page.getByRole("heading", { name: "Buscar en Legisdata", exact: true })).toBeVisible();
});

for (const [query, title, strategy] of [["Ley 19.880", "Bases de procedimientos administrativos", "number"], ["Ley de transparencia", "Acceso a la información pública", "alias"], ["procedimiento administrativo", "Procedimiento administrativo sintético", "subject"]]) {
  test(`shows explicit candidates for ${query} without retrieving text`, { tag: strategy === "subject" ? [] : "@fixture" }, async ({ page }) => {
    let xmlRequests = 0;
    page.on("request", (request) => { if (request.url().includes("/api/v1/resolver")) xmlRequests++; });
    await page.route("**/api/v1/descubrir?*", (route) => route.fulfill({ json: { data: { status: "available", cache: "fetched", candidates: [candidate("210676", title, strategy), candidate("276363", "Otra coincidencia")], eventId: randomUUID() } } }));
    await page.goto(`/buscar?q=${encodeURIComponent(query)}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Consultar esta norma", exact: true })).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Consultar esta norma", exact: true }).first()).toHaveAttribute("href", /referencia=idNorma%3A210676/);
    expect(xmlRequests).toBe(0);
  });
}

for (const query of ["Ley 19.880", "Ley de transparencia"]) {
  test(`uses the published exact identity for ${query} without discovery`, { tag: "@postgres" }, async ({ page }) => {
    let discoveryRequests = 0;
    page.on("request", (request) => { if (request.url().includes("/api/v1/descubrir")) discoveryRequests++; });
    await page.route("**/api/v1/resolver?*", (route) => route.fulfill({ status: 503, json: { data: { status: "unavailable", cache: "none", checkedAt: null } } }));
    await page.goto(`/buscar?q=${encodeURIComponent(query)}`);
    await expect(page.locator('a[href^="/normas/ley-"]').first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Consultar esta norma", exact: true })).toHaveCount(0);
    expect(discoveryRequests).toBe(0);
  });
}

test("ends bounded discovery polling with an explicit retry", async ({ page }) => {
  await page.clock.install();
  await page.route("**/api/v1/descubrir?*", (route) => route.fulfill({ status: 202, json: { data: { status: "in_progress", candidates: [], cache: "none", retryAfterSeconds: 2 } } }));
  await page.goto("/buscar?q=procedimiento");
  await expect(page.getByText("Buscando más normas…")).toBeVisible();
  await page.clock.fastForward(31000);
  await expect(page.getByRole("button", { name: "Reintentar búsqueda externa" })).toBeVisible();
});

test("protects review request history for anonymous visitors", async ({ page }) => {
  await page.goto("/cuenta/revisiones");
  await expect(page).toHaveURL(/\/api\/auth\/signin\?callbackUrl=%2Fcuenta%2Frevisiones/);
});

test("an authenticated reader requests review without publication and sees its editorial state", { tag: "@postgres" }, async ({ page, context }) => {
  const db = getDb(), userId = randomUUID(), token = randomUUID(), slug = `test-review-e2e-${randomUUID()}`;
  const [norm] = await db.insert(norms).values({ slug, type: "Ley", number: "999999999", title: "Norma sintética para solicitar revisión", shortTitle: "Prueba de revisión", description: "Prueba", topics: [], status: "desconocida", publishedAt: new Date("2020-01-01"), updatedAt: new Date() }).returning();
  const [batch] = await db.insert(importBatches).values({ checksum: randomUUID(), status: "pending_review", normId: norm.id }).returning();
  await db.insert(users).values({ id: userId, name: "Lector de prueba" });
  await db.insert(sessions).values({ sessionToken: token, userId, expires: new Date(Date.now() + 3600000) });
  try {
    await context.addCookies([{ name: "authjs.session-token", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/api/v1/resolver?*", (route) => route.fulfill({ status: 202, json: { data: { status: "pending_review", source: "bcn-leychile", reference: { kind: "idNorma", value: "999999999" }, cache: "fetched", checkedAt: new Date().toISOString(), sourceUrl: "https://www.bcn.cl/leychile/navegar?idNorma=999999999", proposal: { id: batch.id, title: norm.title, requestable: true } } } }));
    await page.route("**/api/v1/descubrir?*", (route) => route.fulfill({ json: { data: { status: "available", cache: "fetched", candidates: [candidate("999999999", norm.title), candidate("999999998", "Otro candidato")] } } }));
    await page.goto("/buscar?q=norma+sintetica");
    await page.getByRole("link", { name: "Consultar esta norma", exact: true }).first().click();
    await expect(page).toHaveURL(/referencia=idNorma%3A999999999/);
    await expect(page.getByRole("heading", { name: "Norma recuperada, pendiente de revisión" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Leer en Legisdata" })).toHaveCount(0);
    await page.getByRole("button", { name: "Solicitar revisión" }).click();
    await expect(page.getByRole("status")).toContainText("registrada");
    await page.goto("/cuenta/revisiones");
    await expect(page.getByText(norm.title)).toBeVisible();
    await expect(page.getByText("Pendiente de revisión", { exact: true })).toBeVisible();
    expect((await db.select().from(importBatches).where(eq(importBatches.id, batch.id)))[0].status).toBe("pending_review");
    const hidden = await page.request.get(`/api/v1/normas/${slug}`);
    expect(hidden.status()).toBe(404);
  } finally {
    await db.delete(auditLogs).where(inArray(auditLogs.entityId, [batch.id]));
    await db.delete(importBatches).where(eq(importBatches.id, batch.id));
    await db.delete(norms).where(eq(norms.id, norm.id));
    await db.delete(users).where(eq(users.id, userId));
    await closeDb();
  }
});
