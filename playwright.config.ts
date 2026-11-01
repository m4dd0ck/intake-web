import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
// Reason: LIVE_URL points the same tests at the deployed site, after a deploy.
const LIVE_URL = process.env.LIVE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: LIVE_URL ?? `http://localhost:${PORT}/`, ...devices["Desktop Chrome"] },
  // The built site, not the dev server: the Content Security Policy only exists in the build.
  webServer: LIVE_URL
    ? []
    : {
        command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
