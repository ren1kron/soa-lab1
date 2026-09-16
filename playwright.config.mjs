import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT || "4400";
export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }
  ],
  webServer: {
    command: "npm run preview",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 15000
  }
});
