// Toast browser tests — exercise real pointer-driven swipe, pause-on-
// hover with real timing, and the placement-aware insertion order.

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/toast.html";

test.describe("toast", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__toastReady === true);
        await page.waitForTimeout(50);
    });

    // ---- root + ARIA --------------------------------------------

    test("viewport gets role=region + aria-label + data-placement", async ({ page }) => {
        const attrs = await page.evaluate(() => {
            const el = document.getElementById("br");
            return {
                role: el.getAttribute("role"),
                label: el.getAttribute("aria-label"),
                placement: el.getAttribute("data-placement"),
            };
        });
        expect(attrs).toEqual({
            role: "region",
            label: "Notifications",
            placement: "bottom-right",
        });
    });

    test("hidden aria-live region appended to viewport", async ({ page }) => {
        const has = await page.evaluate(() => {
            const live = document.querySelector('#br [aria-live="polite"]');
            return !!live && live.style.position === "absolute";
        });
        expect(has).toBe(true);
    });

    // ---- show / dismiss ----------------------------------------

    test("show() appends a toast with role=status by default", async ({ page }) => {
        await page.click("#b-info");
        await page.waitForTimeout(30);
        const t = await page.evaluate(() => {
            const el = document.querySelector("#br [data-toast-id]");
            return el ? {
                role: el.getAttribute("role"),
                live: el.getAttribute("aria-live"),
                text: el.textContent,
            } : null;
        });
        expect(t).toEqual({
            role: "status",
            live: "polite",
            text: "Info message",
        });
    });

    test("show({ urgent: true }) uses role=alert + aria-live=assertive", async ({ page }) => {
        await page.click("#b-urgent");
        await page.waitForTimeout(30);
        const t = await page.evaluate(() => {
            const el = document.querySelector("#br [data-toast-id]");
            return el ? {
                role: el.getAttribute("role"),
                live: el.getAttribute("aria-live"),
            } : null;
        });
        expect(t).toEqual({ role: "alert", live: "assertive" });
    });

    test("close button [data-toast-close] dismisses on click", async ({ page }) => {
        await page.click("#b-with-close");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(1);
        await page.click("#br [data-toast-close]");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(0);
    });

    test("dispatches 'show' and 'dismiss' CustomEvents with detail", async ({ page }) => {
        const events = await page.evaluate(async () => {
            const evts = [];
            const br = document.getElementById("br");
            br.addEventListener("show",    e => evts.push(["show",    e.detail.id]));
            br.addEventListener("dismiss", e => evts.push(["dismiss", e.detail.id, e.detail.reason]));
            br.show("test", { id: "t1", duration: 30 });
            await new Promise(r => setTimeout(r, 60));
            return evts;
        });
        expect(events).toEqual([
            ["show",    "t1"],
            ["dismiss", "t1", "auto-dismiss"],
        ]);
    });

    // ---- placement-aware insertion -----------------------------

    test("bottom-right: newer toasts APPEND at bottom", async ({ page }) => {
        await page.click("#b-info");
        await page.waitForTimeout(30);
        await page.click("#b-persistent");
        await page.waitForTimeout(30);
        const order = await page.evaluate(() =>
            Array.from(document.querySelectorAll("#br [data-toast-id]"))
                .map(el => el.textContent.trim()));
        // bottom-right: first shown is on top of the stack, newer below
        expect(order[0]).toContain("Info message");
        expect(order[1]).toContain("Persistent");
    });

    test("top-left: newer toasts INSERT at top of stack", async ({ page }) => {
        // top-left viewport pre-baked in fixture
        await page.evaluate(() => {
            const tl = document.getElementById("tl");
            tl.show("first",  { duration: 0, id: "f" });
            tl.show("second", { duration: 0, id: "s" });
        });
        await page.waitForTimeout(50);
        const order = await page.evaluate(() =>
            Array.from(document.querySelectorAll("#tl [data-toast-id]"))
                .map(el => el.textContent.trim()));
        // top-left: newest first
        expect(order[0]).toContain("second");
        expect(order[1]).toContain("first");
    });

    // ---- maxStack ----------------------------------------------

    test("maxStack overflow auto-dismisses oldest", async ({ page }) => {
        // burst of 7 with maxStack=5
        await page.click("#b-burst");
        await page.waitForTimeout(50);
        const visible = await page.evaluate(() =>
            Array.from(document.querySelectorAll("#br [data-toast-id]"))
                .map(el => el.textContent.trim()));
        expect(visible).toHaveLength(5);
        // Should be the LATEST 5: burst 3..7
        expect(visible[0]).toContain("burst 3");
        expect(visible[4]).toContain("burst 7");
    });

    // ---- auto-dismiss + pause -----------------------------------

    test("auto-dismiss removes the toast after duration", async ({ page }) => {
        // Use a 200ms duration toast to be robust against click+evaluate
        // roundtrip overhead (Playwright's page.click can take 30-100ms
        // in headless mode, which would exceed a tighter window).
        await page.evaluate(() => document.getElementById("br").show("Quick", { duration: 200 }));
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(1);
        await page.waitForTimeout(250);
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(0);
    });

    test("pause-on-hover freezes auto-dismiss", async ({ page }) => {
        // Move mouse away initially
        await page.mouse.move(0, 0);
        // Show a toast with a generous duration; under worker contention,
        // the page.waitForTimeout(20) below can drift to hundreds of ms
        // before the boundingBox query runs, and a short-duration toast
        // would auto-dismiss in that window (boundingBox -> null -> crash).
        await page.evaluate(() => document.getElementById("br").show("hover-pause-test", { duration: 600 }));
        const toast = page.locator("#br [data-toast-id]");
        await expect(toast).toBeVisible();
        // hover over the toast
        const box = await toast.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(50);     // 50ms in, paused
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(1);
        // verify data-paused attribute appears
        const paused = await page.evaluate(() =>
            document.querySelector("#br [data-toast-id]").getAttribute("data-paused"));
        expect(paused).toBe("true");
        // wait beyond original duration — should still be there
        await page.waitForTimeout(700);
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(1);
        // move mouse away — resume; remaining ~550ms + buffer
        await page.mouse.move(0, 0);
        await expect.poll(
            () => page.evaluate(() => document.getElementById("br").count),
            { timeout: 2000, intervals: [100] },
        ).toBe(0);
    });

    // ---- swipe ------------------------------------------------

    test("swipe right past threshold dismisses the toast (bottom-right placement)", async ({ page }) => {
        // Move mouse away first to avoid auto-pause
        await page.mouse.move(0, 0);
        await page.click("#b-persistent");
        await page.waitForTimeout(40);
        // Move pointer to the toast (now hovering -> auto-pause kicks in,
        // but we don't care because duration: 0)
        const box = await page.locator("#br [data-toast-id]").boundingBox();
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // swipe right ~120 px (well past 50 threshold)
        for (let i = 1; i <= 12; i++) {
            await page.mouse.move(startX + i * 10, startY);
            await page.waitForTimeout(8);
        }
        await page.mouse.up();
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(0);
    });

    test("swipe BELOW threshold snaps back (no dismiss)", async ({ page }) => {
        await page.mouse.move(0, 0);
        await page.click("#b-persistent");
        await page.waitForTimeout(40);
        const box = await page.locator("#br [data-toast-id]").boundingBox();
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // 30 px right — below 50 threshold
        for (let i = 1; i <= 5; i++) {
            await page.mouse.move(startX + i * 6, startY);
            await page.waitForTimeout(8);
        }
        await page.mouse.up();
        await page.waitForTimeout(30);
        // still there
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(1);
        // swipe-x var should be cleared (snap back)
        const xVar = await page.evaluate(() => {
            const el = document.querySelector("#br [data-toast-id]");
            return el.style.getPropertyValue("--lh-toast-swipe-x");
        });
        expect(xVar === "" || xVar === "0px").toBe(true);
    });

    test("swipe LEFT on bottom-right placement is clamped (no motion)", async ({ page }) => {
        await page.mouse.move(0, 0);
        await page.click("#b-persistent");
        await page.waitForTimeout(40);
        const box = await page.locator("#br [data-toast-id]").boundingBox();
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // swipe LEFT (wrong direction for bottom-right)
        for (let i = 1; i <= 12; i++) {
            await page.mouse.move(startX - i * 10, startY);
            await page.waitForTimeout(8);
        }
        await page.mouse.up();
        await page.waitForTimeout(30);
        // toast still there — left swipe doesn't dismiss
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(1);
    });

    test("swipe on a close button does NOT start a drag (button stays clickable)", async ({ page }) => {
        await page.mouse.move(0, 0);
        await page.click("#b-with-close");
        await page.waitForTimeout(40);
        // click the close button — should fire the click handler, not a swipe
        await page.click("#br [data-toast-close]");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(0);
    });

    // ---- clear --------------------------------------------------

    test("host.clear() removes every toast", async ({ page }) => {
        await page.evaluate(() => {
            const br = document.getElementById("br");
            br.show("a", { duration: 0 });
            br.show("b", { duration: 0 });
            br.show("c", { duration: 0 });
        });
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(3);
        await page.click("#b-clear");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("br").count)).toBe(0);
    });
});
