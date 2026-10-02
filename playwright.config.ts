import { defineConfig, devices } from "@playwright/test";

// The runner and its server must use the same mode, even if local .env files exist.
const databaseUrl = process.env.DATABASE_URL ?? "";
const mode = databaseUrl ? "postgres" : "fixture";
const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `${process.env.PLAYWRIGHT_USE_BUILD ? "npm run start" : "npm run dev"} -- --hostname 127.0.0.1 --port 3100`,
    url: baseURL,
    env: { DATABASE_URL: databaseUrl, AUTH_TRUST_HOST: "true", AUTH_SECRET: process.env.AUTH_SECRET || "e2e-only-not-a-production-secret" },
    // Never accidentally test a developer server running with the opposite mode.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: `chromium-${mode}`,
      grepInvert: mode === "fixture" ? /@postgres/ : /@fixture/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
