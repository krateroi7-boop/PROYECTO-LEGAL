import { expect, test } from "@playwright/test";

test("opens the homepage and searches the local corpus", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Legisdata/);
  await page.getByPlaceholder("Buscar leyes, artículos, materias o conceptos").fill("procedimiento");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/\/buscar\?q=procedimiento/);
  await expect(page.getByText(/Resultados de búsqueda/)).toBeVisible();
  await expect(page.getByText(/19\.880/)).toBeVisible();
});

test("navigates to an article anchor", async ({ page }) => {
  await page.goto("/normas/ley-19880");
  await expect(page.getByRole("heading", { name: /Establece bases/ })).toBeVisible();
  await page.getByRole("link", { name: "Artículo 2" }).click();
  await expect(page).toHaveURL(/\/normas\/ley-19880#articulo-2/);
  await expect(page.locator("#articulo-2")).toBeVisible();
});

test("opens version history and comparison", async ({ page }) => {
  await page.goto("/normas/ley-19880");
  await page.getByRole("link", { name: "Historial" }).click();
  await expect(page).toHaveURL(/\/versiones\/ley-19880-2024/);
  await expect(page.getByText(/Versión/)).toBeVisible();
  await page.goto("/normas/ley-19880/comparar");
  await expect(page.getByRole("heading", { name: /Cambios en/ })).toBeVisible();
  await expect(page.getByText("Modificados", { exact: true })).toBeVisible();
});

test("protects account pages for anonymous visitors", async ({ page }) => {
  await page.goto("/cuenta", { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await expect(page).toHaveURL(/\/api\/auth\/signin\?callbackUrl=%2Fcuenta/);
});
