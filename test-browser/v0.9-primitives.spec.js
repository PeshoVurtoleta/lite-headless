// Browser specs for v0.9.0 form/feedback/dashboard primitives.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

async function mountWrapper(page, name, html) {
    await page.goto(BASE + "/test-browser/fixtures/blank.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(async (path) => { await import(path); }, "/src/" + name + "/element.js");
    await page.evaluate((markup) => {
        document.body.insertAdjacentHTML("beforeend", markup);
    }, html);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
}

// ===================== FORM FIELD ============================

test.describe("form-field", () => {
    test("wires label.for to control.id and aria-describedby chain", async ({ page }) => {
        await mountWrapper(page, "form-field", `
            <lite-form-field required>
                <label data-ff-label>Email</label>
                <input data-ff-control type="email">
                <p data-ff-helper>We won't share.</p>
                <p data-ff-error></p>
            </lite-form-field>
        `);
        const controlId = await page.locator("[data-ff-control]").getAttribute("id");
        const labelFor  = await page.locator("[data-ff-label]").getAttribute("for");
        expect(labelFor).toBe(controlId);
        const ariaRequired = await page.locator("[data-ff-control]").getAttribute("aria-required");
        expect(ariaRequired).toBe("true");
        const desc = await page.locator("[data-ff-control]").getAttribute("aria-describedby");
        const helperId = await page.locator("[data-ff-helper]").getAttribute("id");
        expect(desc).toContain(helperId);
    });

    test("setValid + blur shows error text via data-shows-error", async ({ page }) => {
        await mountWrapper(page, "form-field", `
            <lite-form-field>
                <label data-ff-label>Name</label>
                <input data-ff-control>
                <p data-ff-error></p>
            </lite-form-field>
        `);
        await page.evaluate(() => {
            const host = document.querySelector("lite-form-field");
            host.setValid(false, "Required");
        });
        // Error not shown yet (not touched).
        let shows = await page.locator("lite-form-field").getAttribute("data-shows-error");
        expect(shows).toBeNull();
        // Touch via blur.
        await page.locator("[data-ff-control]").focus();
        await page.locator("[data-ff-control]").blur();
        shows = await page.locator("lite-form-field").getAttribute("data-shows-error");
        expect(shows).toBe("");
        const errorText = await page.locator("[data-ff-error]").textContent();
        expect(errorText).toBe("Required");
    });
});

// ===================== BANNER ============================

test.describe("banner", () => {
    test("paints kind + role + dismiss button works", async ({ page }) => {
        await mountWrapper(page, "banner", `
            <lite-banner kind="warning">
                <p>Your session expires soon.</p>
                <button data-banner-dismiss>Close</button>
            </lite-banner>
        `);
        const role = await page.locator("lite-banner").getAttribute("role");
        expect(role).toBe("alert");
        const dataKind = await page.locator("lite-banner").getAttribute("data-kind");
        expect(dataKind).toBe("warning");
        const open = await page.locator("lite-banner").getAttribute("data-open");
        expect(open).toBe("");
        await page.click("[data-banner-dismiss]");
        const hidden = await page.locator("lite-banner").getAttribute("data-hidden");
        expect(hidden).toBe("");
    });

    test("setKind at runtime upgrades role + aria-live", async ({ page }) => {
        await mountWrapper(page, "banner", `
            <lite-banner kind="info">
                <p>Hello</p>
            </lite-banner>
        `);
        let role = await page.locator("lite-banner").getAttribute("role");
        expect(role).toBe("status");
        await page.evaluate(() => document.querySelector("lite-banner").setKind("error"));
        role = await page.locator("lite-banner").getAttribute("role");
        expect(role).toBe("alert");
        const live = await page.locator("lite-banner").getAttribute("aria-live");
        expect(live).toBe("assertive");
    });
});

// ===================== STAT ============================

test.describe("stat", () => {
    test("renders value + label + unit + trend slots", async ({ page }) => {
        await mountWrapper(page, "stat", `
            <lite-stat value="1234" label="Revenue" unit="$"
                       trend-direction="up" trend-value="12.5"
                       animation-duration="0">
                <span data-stat-label></span>
                <strong data-stat-value></strong>
                <span data-stat-unit></span>
                <small data-stat-trend></small>
            </lite-stat>
        `);
        const label = await page.locator("[data-stat-label]").textContent();
        expect(label).toBe("Revenue");
        const value = await page.locator("[data-stat-value]").textContent();
        expect(value).toBe("1,234");
        const unit = await page.locator("[data-stat-unit]").textContent();
        expect(unit).toBe("$");
        const trend = await page.locator("[data-stat-trend]").textContent();
        expect(trend).toContain("+12.5");
        const trendDir = await page.locator("lite-stat").getAttribute("data-trend-direction");
        expect(trendDir).toBe("up");
    });

    test("setValue triggers tween that lands on target", async ({ page }) => {
        await mountWrapper(page, "stat", `
            <lite-stat value="0" animation-duration="150">
                <strong data-stat-value></strong>
            </lite-stat>
        `);
        await page.evaluate(() => document.querySelector("lite-stat").setValue(1000));
        // Wait for tween to settle.
        await page.waitForTimeout(300);
        const value = await page.locator("[data-stat-value]").textContent();
        expect(value).toBe("1,000");
    });

    test("valuechange CustomEvent fires", async ({ page }) => {
        await mountWrapper(page, "stat", `
            <lite-stat value="0" animation-duration="0">
                <strong data-stat-value></strong>
            </lite-stat>
        `);
        const ev = await page.evaluate(() => new Promise(resolve => {
            const host = document.querySelector("lite-stat");
            host.addEventListener("valuechange", (e) => resolve(e.detail));
            host.setValue(42);
        }));
        expect(ev.value).toBe(42);
        expect(ev.previousValue).toBe(0);
    });
});
