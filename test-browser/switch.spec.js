// Switch browser tests -- real keyboard focus, click, form submission

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/switch.html";

test.describe("switch", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__switchReady === true);
        await page.waitForTimeout(50);
    });

    test("root gets role=switch + aria-checked=false initially", async ({ page }) => {
        const attrs = await page.evaluate(() => {
            const root = document.querySelector("#basic [data-switch-root]");
            return {
                role: root.getAttribute("role"),
                checked: root.getAttribute("aria-checked"),
                tabindex: root.getAttribute("tabindex"),
            };
        });
        expect(attrs).toEqual({ role: "switch", checked: "false", tabindex: "0" });
    });

    test("default-checked starts true", async ({ page }) => {
        const checked = await page.evaluate(() =>
            document.querySelector("#prechecked [data-switch-root]").getAttribute("aria-checked"));
        expect(checked).toBe("true");
    });

    test("clicking root toggles aria-checked + data-checked", async ({ page }) => {
        await page.click("#basic [data-switch-root]");
        await page.waitForTimeout(30);
        const after = await page.evaluate(() => {
            const root = document.querySelector("#basic [data-switch-root]");
            const thumb = document.querySelector("#basic [data-switch-thumb]");
            return {
                aria: root.getAttribute("aria-checked"),
                dataRoot: root.getAttribute("data-checked"),
                dataThumb: thumb.getAttribute("data-checked"),
                hostChecked: document.getElementById("basic").checked,
            };
        });
        expect(after).toEqual({ aria: "true", dataRoot: "true", dataThumb: "true", hostChecked: true });
    });

    test("clicking the standalone label toggles + focuses root", async ({ page }) => {
        await page.click("#basic [data-switch-label]");
        await page.waitForTimeout(30);
        const after = await page.evaluate(() => ({
            checked: document.getElementById("basic").checked,
            focused: document.activeElement === document.querySelector("#basic [data-switch-root]"),
        }));
        expect(after).toEqual({ checked: true, focused: true });
    });

    test("Space toggles when root is focused", async ({ page }) => {
        await page.focus("#basic [data-switch-root]");
        await page.keyboard.press(" ");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("basic").checked)).toBe(true);
        await page.keyboard.press(" ");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("basic").checked)).toBe(false);
    });

    test("Enter toggles when root is focused", async ({ page }) => {
        await page.focus("#basic [data-switch-root]");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("basic").checked)).toBe(true);
    });

    test("Tab is captured by the OS focus order (not consumed)", async ({ page }) => {
        await page.focus("#basic [data-switch-root]");
        await page.keyboard.press("Tab");
        await page.waitForTimeout(30);
        // Tab should have moved focus AWAY from basic switch
        const stillFocused = await page.evaluate(() =>
            document.activeElement === document.querySelector("#basic [data-switch-root]"));
        expect(stillFocused).toBe(false);
        // and basic switch should NOT have toggled
        expect(await page.evaluate(() => document.getElementById("basic").checked)).toBe(false);
    });

    test("disabled switch cannot be clicked or keyboarded", async ({ page }) => {
        // force: bypass Playwright's actionability check (which refuses
        // to click cursor:not-allowed). We're verifying that even when
        // the user does click (by tabbing + space, or via assistive tech),
        // the switch ignores the input.
        await page.click("#disabledOne [data-switch-root]", { force: true });
        await page.waitForTimeout(30);
        const after1 = await page.evaluate(() => document.getElementById("disabledOne").checked);
        expect(after1).toBe(false);

        await page.focus("#disabledOne [data-switch-root]");
        await page.keyboard.press(" ");
        await page.waitForTimeout(30);
        const after2 = await page.evaluate(() => document.getElementById("disabledOne").checked);
        expect(after2).toBe(false);
    });

    test("disabled switch shows data-disabled + aria-disabled", async ({ page }) => {
        const attrs = await page.evaluate(() => {
            const root = document.querySelector("#disabledOne [data-switch-root]");
            return {
                aria: root.getAttribute("aria-disabled"),
                data: root.hasAttribute("data-disabled"),
            };
        });
        expect(attrs).toEqual({ aria: "true", data: true });
    });

    test("dispatches change event with detail { checked, reason }", async ({ page }) => {
        const events = await page.evaluate(async () => {
            const evts = [];
            const sw = document.getElementById("basic");
            sw.addEventListener("change", e => evts.push({ checked: e.detail.checked, reason: e.detail.reason }));
            sw.toggle("imperative");
            sw.setChecked(false, "set");
            return evts;
        });
        expect(events).toEqual([
            { checked: true, reason: "imperative" },
            { checked: false, reason: "set" },
        ]);
    });

    test("imperative API: host.toggle / setChecked / setDisabled", async ({ page }) => {
        // toggle
        await page.click("#b-toggle");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("basic").checked)).toBe(true);
        // set off
        await page.click("#b-set-off");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("basic").checked)).toBe(false);
        // disable + try toggle (should not change)
        await page.click("#b-disable");
        await page.waitForTimeout(30);
        await page.click("#b-toggle");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("basic").checked)).toBe(false);
    });

    test("form integration: name attribute creates hidden checkbox that submits", async ({ page }) => {
        // The formSwitch is default-checked, so darkmode=on should be present
        const data = await page.evaluate(() => {
            const form = document.getElementById("theform");
            const fd = new FormData(form);
            return [...fd.entries()];
        });
        expect(data).toEqual([["darkmode", "on"]]);
        // Toggle off, verify it disappears from form data
        await page.click("#formSwitch [data-switch-root]");
        await page.waitForTimeout(30);
        const data2 = await page.evaluate(() => {
            const form = document.getElementById("theform");
            const fd = new FormData(form);
            return [...fd.entries()];
        });
        // unchecked checkboxes don't submit at all
        expect(data2).toEqual([]);
    });
});
