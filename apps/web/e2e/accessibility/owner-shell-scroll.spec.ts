import { expect, test, type Page } from "@playwright/test";

/**
 * Owner inset scroll contract (design-system Structural Governance):
 * document/body stay viewport-bounded; only `[data-control-surface-scroll]` scrolls;
 * AppPageHeader scrolls with content; optional sticky via AppToolbar / AppPageTabs.
 */

const VIEWPORTS = [
  { label: "phone", width: 390, height: 844 },
  { label: "tablet-portrait", width: 768, height: 1024 },
  { label: "tablet-landscape", width: 1024, height: 768 },
  { label: "desktop", width: 1280, height: 900 },
] as const;

const OWNER_LIST_PATHS = [
  "/inventory/stock",
  "/finance/expenses",
  "/orders",
] as const;

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("#main-content").waitFor({ state: "visible" });

  if (new URL(page.url()).pathname.includes("/login")) {
    throw new Error(
      "Owner shell scroll QA requires a live E2E_OWNER session (refresh via playwright setup authenticate as test owner). Landed on /login.",
    );
  }

  await page.locator("[data-control-surface-scroll]").waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test.describe("Owner shell inset scroll model", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.label}: document stays fixed while inset scrollport owns overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/inventory/stock", { waitUntil: "domcontentloaded" });
      await settle(page);

      const metrics = await page.evaluate(() => {
        const scrollport = document.querySelector(
          "[data-control-surface-scroll]",
        ) as HTMLElement | null;
        const doc = document.documentElement;
        return {
          hasScrollport: Boolean(scrollport),
          docScrollTop: doc.scrollTop || window.scrollY,
          docOverflowY: getComputedStyle(doc).overflowY,
          bodyOverflowY: getComputedStyle(document.body).overflowY,
          docClientHeight: doc.clientHeight,
          docScrollHeight: doc.scrollHeight,
          innerHeight: window.innerHeight,
          scrollportOverflowY: scrollport
            ? getComputedStyle(scrollport).overflowY
            : null,
          scrollportClientHeight: scrollport?.clientHeight ?? 0,
          scrollportScrollHeight: scrollport?.scrollHeight ?? 0,
          scrollportHidesScrollbar: scrollport
            ? getComputedStyle(scrollport).scrollbarWidth === "none" ||
              scrollport.classList.contains("no-scrollbar")
            : false,
        };
      });

      expect(metrics.hasScrollport, "Owner shell scrollport missing").toBe(
        true,
      );
      expect(metrics.docScrollTop).toBe(0);
      expect(metrics.scrollportOverflowY).toMatch(/auto|scroll/);
      expect(
        metrics.scrollportHidesScrollbar,
        "Owner scrollport must hide native scrollbar",
      ).toBe(true);
      // Document must not be the scroll owner for the inset card model.
      expect(metrics.docScrollHeight).toBeLessThanOrEqual(
        metrics.innerHeight + 2,
      );

      if (metrics.scrollportScrollHeight > metrics.scrollportClientHeight + 8) {
        await page.locator("[data-control-surface-scroll]").evaluate((el) => {
          el.scrollTop = Math.min(240, el.scrollHeight);
        });
        const after = await page.evaluate(() => {
          const scrollport = document.querySelector(
            "[data-control-surface-scroll]",
          ) as HTMLElement;
          return {
            scrollportScrollTop: scrollport.scrollTop,
            windowScrollY: window.scrollY,
          };
        });
        expect(after.scrollportScrollTop).toBeGreaterThan(0);
        expect(after.windowScrollY).toBe(0);
      }
    });
  }

  for (const path of OWNER_LIST_PATHS) {
    test(`desktop ${path}: page header scrolls with content`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await settle(page);

      const metrics = await page.evaluate(() => {
        const scrollport = document.querySelector(
          "[data-control-surface-scroll]",
        ) as HTMLElement | null;
        const h1 = document.querySelector("#main-content h1");
        if (!scrollport || !h1) {
          return { ok: false as const, reason: "missing scrollport or h1" };
        }
        const headerInScroll = scrollport.contains(h1);
        const beforeTop = h1.getBoundingClientRect().top;
        const maxScroll = Math.max(
          0,
          scrollport.scrollHeight - scrollport.clientHeight,
        );
        scrollport.scrollTop = Math.min(160, maxScroll);
        const afterTop = h1.getBoundingClientRect().top;
        return {
          ok: true as const,
          headerInScroll,
          headerScrolledAway:
            maxScroll > 0 ? afterTop < beforeTop - 1 : true,
          scrollTop: scrollport.scrollTop,
          canScroll: maxScroll > 0,
          noChromeHost:
            document.querySelector("[data-owner-page-chrome]") == null,
        };
      });

      expect(metrics.ok, `${path}: ${"reason" in metrics ? metrics.reason : ""}`).toBe(
        true,
      );
      if (!metrics.ok) return;
      expect(metrics.headerInScroll, `${path} h1 must live in shell scrollport`).toBe(
        true,
      );
      expect(metrics.noChromeHost, `${path} must not use freeze chrome host`).toBe(
        true,
      );
      if (metrics.canScroll && metrics.scrollTop > 0) {
        expect(
          metrics.headerScrolledAway,
          `${path} h1 must scroll away with content`,
        ).toBe(true);
      }
    });
  }
});
