import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { norms, normVersions, normNodes, users, sessions } from "@/db/schema";

const fixture = { slug: `reader-e2e-${randomUUID()}`, norm: "", original: "", current: "", pending: "" };
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [norm] = await db.insert(norms).values({ slug: fixture.slug, type: "Ley", number: "READER-TEST", title: "Documento sintético de lectura", shortTitle: "Prueba del visor", description: "Datos sintéticos de prueba", status: "desconocida", topics: [], publishedAt: new Date("2000-01-01"), updatedAt: new Date() }).returning();
  fixture.norm = norm.id;
  const versions = await db.insert(normVersions).values([
    { normId: norm.id, versionLabel: "Original", validFrom: new Date("2000-01-01"), publicationStatus: "published" },
    { normId: norm.id, versionLabel: "Actual", validFrom: new Date("2020-01-01"), publicationStatus: "published", isCurrent: true },
    { normId: norm.id, versionLabel: "Pendiente", publicationStatus: "pending_review" },
  ]).returning();
  [fixture.original, fixture.current, fixture.pending] = versions.map((v) => v.id);
  const [chapter] = await db.insert(normNodes).values({ versionId: fixture.current, stableKey: "capitulo-1", type: "capitulo", label: "Capítulo I", text: "Encabezado de prueba", position: 0 }).returning();
  await db.insert(normNodes).values([
    { versionId: fixture.original, stableKey: "articulo-1", type: "articulo", label: "Artículo 1", text: "Texto anterior.", position: 0 },
    { versionId: fixture.current, parentId: chapter.id, stableKey: "articulo-1", type: "articulo", label: "Artículo 1", text: "Texto actual con acción administrativa.", position: 1 },
    { versionId: fixture.current, parentId: chapter.id, stableKey: "articulo-2", type: "articulo", label: "Artículo 2", text: "Artículo agregado para comprobar versiones.", position: 2 },
    { versionId: fixture.pending, stableKey: "articulo-1", type: "articulo", label: "Artículo 1", text: "CONTENIDO PENDIENTE PRIVADO", position: 0 },
  ]);
});
test.afterAll(async () => {
  if (fixture.norm) await getDb().delete(norms).where(eq(norms.id, fixture.norm));
  await closeDb();
});

test("reader searches loaded text without network and clears highlights", async ({ page }) => {
  await page.goto("/normas/ley-19880");
  await page.getByRole("button", { name: "Buscar en la norma" }).click();
  const network: string[] = [];
  page.on("request", (request) => {
    // Link may prefetch the header's destinations after hydration; those requests
    // are independent of typing in the reader and explicitly marked by Next.js.
    const headerPrefetch = request.method() === "GET" && request.headers()["next-router-prefetch"]
      && ["/", "/buscar", "/cuenta"].includes(new URL(request.url()).pathname);
    if (["fetch", "xhr"].includes(request.resourceType()) && !headerPrefetch) network.push(request.url());
  });
  await page.getByRole("textbox", { name: "Buscar dentro de la norma", exact: true }).fill("administracion");
  await expect(page.getByRole("status").filter({ hasText: /de \d+ coincidencias/ })).toContainText("1 de");
  await expect(page.locator("[data-search-active]")).toHaveCount(1);
  await page.getByRole("button", { name: "Coincidencia siguiente" }).click();
  await expect(page.getByRole("status").filter({ hasText: /de \d+ coincidencias/ })).toContainText("2 de");
  await page.getByRole("button", { name: "Cerrar búsqueda" }).click();
  await expect(page.locator("[data-search-active]")).toHaveCount(0);
  expect(network).toEqual([]);
});

test("reader copies legal text with pinned provenance and applies scoped preferences", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/normas/ley-19880");
  await page.getByLabel("Tamaño del texto").selectOption("22");
  await page.getByLabel("Tema", { exact: true }).selectOption("dark");
  await expect(page.locator(".legal-reader")).toHaveAttribute("data-theme", "dark");
  await page.locator("#articulo-1").getByRole("button", { name: "Copiar texto", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Texto copiado" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Artículo 1");
  expect(copied).toMatch(/\/normas\/ley-19880\/versiones\/[^\s]+#articulo-1/);
  expect(copied).not.toContain("Copiar enlace");
  await page.reload();
  await expect(page.getByLabel("Tamaño del texto")).toHaveValue("22");
  await expect(page.locator(".legal-reader")).toHaveAttribute("data-theme", "dark");
});

test("mobile uses a single focus-trapped panel and preserves the selected article in login", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/normas/ley-19880");
  await page.getByRole("button", { name: "Índice", exact: true }).click();
  const dialog = page.locator("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: /^Artículo 2/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/#articulo-2$/);
  await page.locator("#articulo-2").getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeVisible();
  const login = dialog.getByRole("link", { name: "Inicia sesión", exact: true });
  await expect(login).toHaveAttribute("href", /callbackUrl=.*versiones.*%23articulo-2/);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#articulo-2").getByRole("button", { name: "Guardar", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("historical navigation retains missing anchors and highlights only real changes", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "Requires isolated PostgreSQL fixtures.");
  await page.goto(`/normas/${fixture.slug}#articulo-2`);
  await page.getByLabel("Mostrar cambios").check();
  await expect(page.locator("#articulo-1 [data-change-badge]")).toHaveText("Modificado");
  await expect(page.locator("#articulo-2 [data-change-badge]")).toHaveText("Agregado");
  await page.getByLabel("Seleccionar versión").selectOption(fixture.original);
  await expect(page).toHaveURL(/#articulo-2$/);
  await expect(page.getByRole("status").filter({ hasText: "no existe en esta versión" })).toBeVisible();
  await expect(page.getByText("Versión histórica", { exact: true })).toBeVisible();
  await expect(page.locator("#articulo-2")).toHaveCount(0);
  expect((await page.request.get(`/normas/${fixture.slug}/versiones/${fixture.pending}`)).status()).toBe(404);
  expect((await page.request.get(`/api/v1/normas/${fixture.slug}/versiones/${fixture.pending}`)).status()).toBe(404);
});

test("hierarchical index collapses navigation without hiding legal text", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "Requires isolated PostgreSQL fixtures.");
  await page.goto(`/normas/${fixture.slug}`);
  const index = page.locator(".reader-index-desktop");
  await index.getByRole("button", { name: "Contraer Capítulo I" }).click();
  await expect(index.getByRole("link", { name: "Artículo 1", exact: true })).toHaveCount(0);
  await expect(page.locator("#articulo-1")).toBeVisible();
  await page.evaluate(() => { location.hash = "articulo-2"; });
  await expect(index.getByRole("link", { name: "Artículo 2", exact: true })).toBeVisible();
});

test("authenticated reader retains article drafts and manages version-specific notes and favorites", async ({ page, context }) => {
  test.skip(!process.env.DATABASE_URL, "Requires a real Auth.js database session.");
  const db = getDb(), userId = randomUUID(), token = randomUUID();
  await db.insert(users).values({ id: userId, name: "Reader test" });
  await db.insert(sessions).values({ sessionToken: token, userId, expires: new Date(Date.now() + 3600000) });
  try {
    await context.addCookies([{ name: "authjs.session-token", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.goto(`/normas/${fixture.slug}`);
    await page.locator("#articulo-1").getByRole("button", { name: "Guardar", exact: true }).click();
    await page.getByLabel("Anotación privada").fill("Mi borrador privado");
    await page.getByRole("button", { name: "Cerrar panel" }).click();
    await page.locator("#articulo-2").getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByLabel("Anotación privada")).toHaveValue("");
    await page.getByRole("button", { name: "Cerrar panel" }).click();
    await page.locator("#articulo-1").getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByLabel("Anotación privada")).toHaveValue("Mi borrador privado");
    let releaseSave = () => {}, saveReturned = () => {};
    const gate = new Promise<void>((resolve) => { releaseSave = resolve; });
    const returned = new Promise<void>((resolve) => { saveReturned = resolve; });
    await page.route("**/normas/**", async (route) => {
      if (route.request().method() !== "POST" || !route.request().postData()?.includes("Mi borrador privado")) return route.continue();
      const response = await route.fetch();
      saveReturned();
      await gate;
      await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Guardar nota", exact: true }).click();
    await returned;
    try { await page.getByLabel("Anotación privada").fill("Nuevo borrador escrito durante el guardado"); }
    finally { releaseSave(); }
    await expect(page.locator(".reader-notes")).toContainText("Mi borrador privado");
    await expect(page.getByLabel("Anotación privada")).toHaveValue("Nuevo borrador escrito durante el guardado");
    await page.unroute("**/normas/**");
    await page.getByRole("button", { name: "Guardar en favoritos", exact: true }).click();
    await expect(page.getByRole("button", { name: "Quitar de favoritos", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Quitar de favoritos", exact: true }).click();
    await expect(page.getByRole("button", { name: "Guardar en favoritos", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Eliminar nota", exact: true }).click();
    await expect(page.locator(".reader-notes li")).toHaveCount(0);
  } finally { await db.delete(users).where(eq(users.id, userId)); }
});

test("reader keeps published legal text accessible without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3000/normas/ley-19880");
  await expect(page.locator("#articulo-1 .reader-legal-text").first()).toBeVisible();
  await expect(page.locator("#fuente")).toBeAttached();
  await context.close();
});

test("search fallback supports keyboard navigation without Custom Highlight", async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(globalThis, "Highlight"); });
  await page.goto("/normas/ley-19880");
  await page.getByRole("button", { name: "Buscar en la norma" }).click();
  const input = page.getByRole("textbox", { name: "Buscar dentro de la norma", exact: true });
  await input.fill("administracion");
  const status = page.locator(".reader-search [role=status]");
  await expect(status).toContainText("1 de");
  await expect(page.locator(".reader-search-snippet mark")).toBeVisible();
  await input.press("Enter");
  await expect(status).toContainText("2 de");
  await input.press("Shift+Enter");
  await expect(status).toContainText("1 de");
  await input.press("Escape");
  await expect(page.locator("[data-search-active]")).toHaveCount(0);
});

test("reader reflows at narrow widths with enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 });
  await page.goto("/normas/ley-19880");
  await page.getByLabel("Tamaño del texto").selectOption("22");
  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 600 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Índice", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Índice", exact: true }).click();
    await expect(page.locator("dialog")).toBeVisible();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog")))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Índice", exact: true })).toBeFocused();
  }
});
