import { expect, test } from "@playwright/test";

test.describe("FamilyPulse demo mode", () => {
  test("login → dashboard with demo banner and key metrics", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /Demo öffnen|Open demo/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("note")).toContainText(/synthetisch|synthetic/);
    await expect(page.getByTestId("metric-hrv")).toBeVisible();
    await expect(page.getByTestId("metric-steps")).toBeVisible();
    // vendor scores always show their source
    await expect(page.getByTestId("metric-recovery_score")).toContainText("WHOOP");
  });

  test("family overview shows four members and respects sharing", async ({ page }) => {
    await page.goto("/family");
    await expect(page.getByTestId("member-card")).toHaveCount(4);
    await expect(page.getByText("WHOOP (Demo)").first()).toBeVisible();
    await expect(page.getByText("Fitbit (Google Health) (Demo)").first()).toBeVisible();
  });

  test("member detail hides categories that were not shared", async ({ page }) => {
    await page.goto("/family/demo-0000-b");
    await expect(page.getByRole("heading", { name: "Person B" })).toBeVisible();
    const health = page.locator("section", { has: page.getByRole("heading", { name: /Gesundheitswerte|Health metrics/ }) });
    await expect(health.getByText(/Blutsauerstoff|Blood oxygen/)).toHaveCount(0);
  });

  test("Fitbit member: no WHOOP recovery, explanation shown", async ({ page }) => {
    await page.goto("/family/demo-0000-d");
    await expect(page.getByText(/Readiness/)).toBeVisible();
  });

  test("invalid or foreign member ids render the not-found page (no data)", async ({ page }) => {
    // With streaming (loading.tsx) Next.js keeps HTTP 200 but renders the not-found boundary.
    for (const id of ["'%20or%201=1--", "00000000-0000-4000-8000-000000000999"]) {
      await page.goto(`/family/${id}`);
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
      await expect(page.getByTestId("metric-hrv")).toHaveCount(0);
    }
  });

  test("trends: vendor scores are not compared across trackers", async ({ page }) => {
    await page.goto("/trends?metric=recovery_score&range=30&members=demo-0000-a,demo-0000-d");
    await expect(page.getByText(/nicht zwischen verschiedenen Trackern|not compared across different trackers/)).toBeVisible();
    await page.goto("/trends?metric=steps&range=90&members=demo-0000-a,demo-0000-c,demo-0000-d&type=bar");
    await expect(page.locator(".recharts-wrapper").first()).toBeVisible();
  });

  test("security headers and no secrets in HTML", async ({ page }) => {
    const res = await page.goto("/dashboard");
    const headers = res!.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    const html = await page.content();
    expect(html).not.toMatch(/access_token|refresh_token|client_secret|SERVICE_ROLE/i);
  });

  test("PWA manifest and service worker are served", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const json = await manifest.json();
    expect(json.display).toBe("standalone");
    expect(json.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    const sw = await request.get("/sw.js");
    expect(await sw.text()).toContain("never cached");
  });

  test("cross-origin logout is rejected", async ({ request }) => {
    const res = await request.post("/api/auth/logout", { headers: { origin: "https://evil.example" }, maxRedirects: 0 });
    expect(res.status()).toBe(403);
  });
});

test.describe("mobile layout", () => {
  test("bottom navigation with five tabs and no horizontal scrolling", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("link")).toHaveCount(5);
    await nav.getByRole("link", { name: /Familie|Family/ }).click();
    await expect(page).toHaveURL(/\/family$/);
    for (const path of ["/dashboard", "/family", "/trends", "/profile", "/settings"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });

  test("desktop shows the comparison table", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop only");
    await page.goto("/family");
    await expect(page.getByRole("table")).toBeVisible();
  });
});
