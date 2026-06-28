import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

async function mountWrapper(page, name, html) {
    await page.goto(BASE + "/test-browser/fixtures/blank.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(async (path) => { await import(path); }, "/src/" + name + "/element.js");
    await page.evaluate((markup) => { document.body.insertAdjacentHTML("beforeend", markup); }, html);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
}

// ===================== DRAWER ============================

test.describe("drawer", () => {
    test("trigger opens content + ARIA wired", async ({ page }) => {
        await mountWrapper(page, "drawer", `
            <lite-drawer side="right">
                <button data-drawer-trigger>Open</button>
                <div data-drawer-backdrop></div>
                <aside data-drawer-content>
                    <h2 data-drawer-title>Filters</h2>
                    <button data-drawer-close>×</button>
                </aside>
            </lite-drawer>
        `);
        // Initial: closed
        let open = await page.locator("lite-drawer").getAttribute("open");
        expect(open).toBeNull();
        let expanded = await page.locator("[data-drawer-trigger]").getAttribute("aria-expanded");
        expect(expanded).toBe("false");
        // Open via trigger click
        await page.click("[data-drawer-trigger]");
        open = await page.locator("lite-drawer").getAttribute("open");
        expect(open).toBe("");
        expanded = await page.locator("[data-drawer-trigger]").getAttribute("aria-expanded");
        expect(expanded).toBe("true");
        const side = await page.locator("[data-drawer-content]").getAttribute("data-side");
        expect(side).toBe("right");
        const role = await page.locator("[data-drawer-content]").getAttribute("role");
        expect(role).toBe("dialog");
    });

    test("close button dismisses", async ({ page }) => {
        await mountWrapper(page, "drawer", `
            <lite-drawer open>
                <button data-drawer-trigger>Open</button>
                <aside data-drawer-content>
                    <button data-drawer-close>×</button>
                </aside>
            </lite-drawer>
        `);
        await page.click("[data-drawer-close]");
        const open = await page.locator("lite-drawer").getAttribute("open");
        expect(open).toBeNull();
    });
});

// ===================== STEPS ============================

test.describe("steps", () => {
    test("auto-discovers steps + paints data-status", async ({ page }) => {
        await mountWrapper(page, "steps", `
            <lite-steps current="1">
                <ol>
                    <li data-step-id="account">Account</li>
                    <li data-step-id="billing">Billing</li>
                    <li data-step-id="review">Review</li>
                </ol>
                <button data-step-prev>Back</button>
                <button data-step-next>Next</button>
            </lite-steps>
        `);
        await page.waitForTimeout(50);
        // 'account' is complete; 'billing' is current; 'review' is pending
        const a = await page.locator('[data-step-id="account"]').getAttribute("data-status");
        expect(a).toBe("complete");
        const b = await page.locator('[data-step-id="billing"]').getAttribute("data-status");
        expect(b).toBe("current");
        const c = await page.locator('[data-step-id="review"]').getAttribute("data-status");
        expect(c).toBe("pending");
    });

    test("next button advances + stepchange event fires", async ({ page }) => {
        await mountWrapper(page, "steps", `
            <lite-steps>
                <ol>
                    <li data-step-id="a">A</li>
                    <li data-step-id="b">B</li>
                    <li data-step-id="c">C</li>
                </ol>
                <button data-step-next>Next</button>
            </lite-steps>
        `);
        const ev = await page.evaluate(() => new Promise(resolve => {
            const host = document.querySelector("lite-steps");
            host.addEventListener("stepchange", (e) => resolve(e.detail));
            host.next();
        }));
        expect(ev.current).toBe(1);
        expect(ev.reason).toBe("next");
    });

    test("step click navigates backward (allowBack default true)", async ({ page }) => {
        await mountWrapper(page, "steps", `
            <lite-steps current="2">
                <ol>
                    <li data-step-id="a">A</li>
                    <li data-step-id="b">B</li>
                    <li data-step-id="c">C</li>
                </ol>
            </lite-steps>
        `);
        await page.click('[data-step-id="a"]');
        const idx = await page.evaluate(() => document.querySelector("lite-steps").index);
        expect(idx).toBe(0);
    });
});

// ===================== RATING ============================

test.describe("rating", () => {
    test("renders + click sets value + valuechange event fires", async ({ page }) => {
        await mountWrapper(page, "rating", `
            <lite-rating>
                <button data-rating-item="1">★</button>
                <button data-rating-item="2">★</button>
                <button data-rating-item="3">★</button>
                <button data-rating-item="4">★</button>
                <button data-rating-item="5">★</button>
            </lite-rating>
        `);
        const role = await page.locator("lite-rating").getAttribute("role");
        expect(role).toBe("radiogroup");
        const ev = await page.evaluate(() => new Promise(resolve => {
            const host = document.querySelector("lite-rating");
            host.addEventListener("valuechange", (e) => resolve(e.detail));
            document.querySelector('[data-rating-item="4"]').click();
        }));
        expect(ev.value).toBe(4);
        expect(ev.reason).toBe("click");
        // Verify fill state painted
        const filled3 = await page.locator('[data-rating-item="3"]').getAttribute("data-filled");
        expect(filled3).toBe("");
        const filled5 = await page.locator('[data-rating-item="5"]').getAttribute("data-filled");
        expect(filled5).toBeNull();   // 5 is not filled when value=4
    });

    test("read-only blocks click + keyboard", async ({ page }) => {
        await mountWrapper(page, "rating", `
            <lite-rating value="3" read-only>
                <button data-rating-item="1">★</button>
                <button data-rating-item="2">★</button>
                <button data-rating-item="3">★</button>
                <button data-rating-item="4">★</button>
                <button data-rating-item="5">★</button>
            </lite-rating>
        `);
        await page.click('[data-rating-item="5"]');
        const v = await page.evaluate(() => document.querySelector("lite-rating").value);
        expect(v).toBe(3);
    });

    test("keyboard ArrowRight increments", async ({ page }) => {
        await mountWrapper(page, "rating", `
            <lite-rating value="2">
                <button data-rating-item="1">★</button>
                <button data-rating-item="2">★</button>
                <button data-rating-item="3">★</button>
            </lite-rating>
        `);
        // Realistic UX: user tabs to the current item (tabindex=0),
        // then presses ArrowRight. locator.press() on the custom-element
        // host doesn't focus into the items, so we do it manually.
        await page.locator('[data-rating-item="2"]').focus();
        await page.keyboard.press("ArrowRight");
        const v = await page.evaluate(() => document.querySelector("lite-rating").value);
        expect(v).toBe(3);
    });
});
