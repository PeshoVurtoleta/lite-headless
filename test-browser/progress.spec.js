// Browser tests for progress primitive

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/progress.html";

test.describe("progress", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__progressReady === true);
        await page.waitForTimeout(50);
    });

    test("linear: role + aria + --progress painted on mount", async ({ page }) => {
        const data = await page.evaluate(() => {
            const el = document.getElementById("pg-linear");
            return {
                role:    el.getAttribute("role"),
                vNow:    el.getAttribute("aria-valuenow"),
                vMin:    el.getAttribute("aria-valuemin"),
                vMax:    el.getAttribute("aria-valuemax"),
                vText:   el.getAttribute("aria-valuetext"),
                loading: el.hasAttribute("data-loading"),
                complete: el.hasAttribute("data-complete"),
                variant: el.getAttribute("data-variant"),
                progress: el.style.getPropertyValue("--progress"),
            };
        });
        expect(data.role).toBe("progressbar");
        expect(data.vNow).toBe("35");
        expect(data.vMin).toBe("0");
        expect(data.vMax).toBe("100");
        expect(data.vText).toBe("35%");
        expect(data.loading).toBe(true);
        expect(data.variant).toBe("linear");
        expect(data.progress).toBe("0.35");
    });

    test("linear: setting value attribute updates aria + --progress", async ({ page }) => {
        await page.click("#b-linear-50");
        await page.waitForTimeout(50);
        const data = await page.evaluate(() => {
            const el = document.getElementById("pg-linear");
            return {
                vNow: el.getAttribute("aria-valuenow"),
                vText: el.getAttribute("aria-valuetext"),
                progress: el.style.getPropertyValue("--progress"),
            };
        });
        expect(data.vNow).toBe("50");
        expect(data.vText).toBe("50%");
        expect(data.progress).toBe("0.5");
    });

    test("linear: value=100 flips data-complete + fires complete event", async ({ page }) => {
        await page.click("#b-linear-100");
        await page.waitForTimeout(50);
        const data = await page.evaluate(() => {
            const el = document.getElementById("pg-linear");
            return {
                loading: el.hasAttribute("data-loading"),
                complete: el.hasAttribute("data-complete"),
                progress: el.style.getPropertyValue("--progress"),
                completeFires: window.__linearComplete || 0,
            };
        });
        expect(data.complete).toBe(true);
        expect(data.loading).toBe(false);
        expect(data.progress).toBe("1");
        expect(data.completeFires).toBe(1);
    });

    test("indeterminate: aria-valuenow omitted + data-indeterminate set", async ({ page }) => {
        const data = await page.evaluate(() => {
            const el = document.getElementById("pg-indet");
            return {
                hasValueNow: el.hasAttribute("aria-valuenow"),
                hasIndet:    el.hasAttribute("data-indeterminate"),
                vText:       el.getAttribute("aria-valuetext"),
                loading:     el.hasAttribute("data-loading"),
                complete:    el.hasAttribute("data-complete"),
            };
        });
        expect(data.hasValueNow).toBe(false);
        expect(data.hasIndet).toBe(true);
        expect(data.vText).toBe("Loading");
        expect(data.loading).toBe(true);
    });

    test("indeterminate: toggling off restores aria-valuenow", async ({ page }) => {
        await page.click("#b-indet-off");
        await page.waitForTimeout(50);
        const data = await page.evaluate(() => {
            const el = document.getElementById("pg-indet");
            return {
                hasValueNow: el.hasAttribute("aria-valuenow"),
                hasIndet:    el.hasAttribute("data-indeterminate"),
                vNow:        el.getAttribute("aria-valuenow"),
            };
        });
        expect(data.hasValueNow).toBe(true);
        expect(data.hasIndet).toBe(false);
        // value is 0 (default since the fixture didn't set it explicitly)
        expect(data.vNow).toBe("0");
    });

    test("circular: data-variant=circular + indicator gets --progress", async ({ page }) => {
        await page.click("#b-circ-75");
        await page.waitForTimeout(50);
        const data = await page.evaluate(() => {
            const root = document.getElementById("pg-circular");
            const ind  = root.querySelector("[data-progress-indicator]");
            return {
                rootVariant: root.getAttribute("data-variant"),
                rootProgress: root.style.getPropertyValue("--progress"),
                indProgress: ind.style.getPropertyValue("--progress"),
                indDataProgress: ind.getAttribute("data-progress"),
            };
        });
        expect(data.rootVariant).toBe("circular");
        expect(data.rootProgress).toBe("0.75");
        expect(data.indProgress).toBe("0.75");
        expect(data.indDataProgress).toBe("75");
    });

    test("custom value-text overrides auto NN%", async ({ page }) => {
        const data = await page.evaluate(() => {
            const el = document.getElementById("pg-wizard");
            return { vText: el.getAttribute("aria-valuetext"), vNow: el.getAttribute("aria-valuenow") };
        });
        expect(data.vText).toBe("Step 2 of 5");
        expect(data.vNow).toBe("2");
    });

    test("wizard buttons advance + retreat value", async ({ page }) => {
        await page.click("#b-wiz-next");
        await page.waitForTimeout(50);
        let v = await page.evaluate(() => document.getElementById("pg-wizard").value);
        expect(v).toBe(3);
        await page.click("#b-wiz-prev");
        await page.click("#b-wiz-prev");
        await page.waitForTimeout(50);
        v = await page.evaluate(() => document.getElementById("pg-wizard").value);
        expect(v).toBe(1);
    });

    test("wizard clamps at min/max", async ({ page }) => {
        // Already at value=2, click "previous" 5 times: should stop at 1 (min)
        for (let i = 0; i < 5; i++) {
            await page.click("#b-wiz-prev");
            await page.waitForTimeout(20);
        }
        let v = await page.evaluate(() => document.getElementById("pg-wizard").value);
        expect(v).toBe(1);
        // Now go past max
        for (let i = 0; i < 10; i++) {
            await page.click("#b-wiz-next");
            await page.waitForTimeout(20);
        }
        v = await page.evaluate(() => document.getElementById("pg-wizard").value);
        expect(v).toBe(5);
    });
});
