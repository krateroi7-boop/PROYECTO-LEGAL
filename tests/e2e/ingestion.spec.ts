import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { getDb, closeDb } from "../../src/db/client";
import { sessions, users } from "../../src/db/schema";

test("anonymous resolver POST requires an account, GET never acquires", { tag: "@postgres" }, async ({ request }) => {
  const result = await request.post("/api/v1/resolver", { data: { referencia: "idNorma:999999995" } });
  expect(result.status()).toBe(401);
  const state = await request.get("/api/v1/resolver?referencia=idNorma:999999995");
  expect(state.status()).toBe(403);
  expect((await state.json()).data.status).toBe("blocked");
});

test("account must explicitly start ingestion, polls GET and opens published reader", { tag: "@postgres" }, async ({ page, context }) => {
  const userId = randomUUID(), token = randomUUID();
  await getDb().insert(users).values({ id: userId, name: "Ingestion E2E" });
  await getDb().insert(sessions).values({ sessionToken: token, userId, expires: new Date(Date.now() + 3600000) });
  try {
    await context.addCookies([{ name: "authjs.session-token", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const methods: string[] = [];
    let started = false;
    await page.route("**/api/v1/resolver*", async (route) => {
      const method = route.request().method(); methods.push(method);
      const result = method === "POST" ? { status: "resolving", retryAfterSeconds: 1 }
        : started ? { status: "published", slug: "ley-19880", versionId: randomUUID() } : { status: "not_requested" };
      if (method === "POST") started = true;
      await route.fulfill({ status: result.status === "resolving" ? 202 : 200, json: { data: { ...result, source: "bcn-leychile", reference: { kind: "idNorma", value: "999999995" }, cache: "none", checkedAt: null } } });
    });
    await page.goto("/consultar?referencia=idNorma:999999995");
    await expect(page.getByRole("button", { name: "Incorporar y leer", exact: true })).toBeVisible();
    expect(methods.every((method) => method === "GET")).toBe(true);
    await page.getByRole("button", { name: "Incorporar y leer", exact: true }).click();
    await expect(page).toHaveURL(/\/normas\/ley-19880$/);
    expect(methods.filter((method) => method === "POST")).toHaveLength(1);
    expect(methods.at(-1)).toBe("GET");
  } finally { await getDb().delete(users).where(eq(users.id, userId)); await closeDb(); }
});

test("anonymous metadata page offers sign in and never submits an acquisition", { tag: "@postgres" }, async ({ page }) => {
  const methods: string[] = [];
  await page.route("**/api/v1/resolver*", (route) => {
    methods.push(route.request().method());
    return route.fulfill({ json: { data: { status: "not_requested", cache: "none", checkedAt: null, source: "bcn-leychile", reference: { kind: "idNorma", value: "999999995" } } } });
  });
  await page.goto("/consultar?referencia=idNorma:999999995");
  await expect(page.getByRole("link", { name: "Iniciar sesión para incorporar" })).toHaveAttribute("href", /callbackUrl=.*999999995/);
  await page.reload();
  await expect(page.getByRole("link", { name: "Iniciar sesión para incorporar" })).toBeVisible();
  expect(methods.every((method) => method === "GET")).toBe(true);
});
