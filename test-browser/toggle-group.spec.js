// Toggle-group browser specs — real keyboard, roving tabindex, ARIA.

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/toggle-group.html";

test.describe("toggle-group", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__toggleGroupReady === true);
        await page.waitForTimeout(50);
    });

    // ---- ARIA ------------------------------------------------

    test("root gets role=group + data-orientation", async ({ page }) => {
        const attrs = await page.evaluate(() => {
            const el = document.getElementById("view-mode");
            return {
                role: el.getAttribute("role"),
                orient: el.getAttribute("data-orientation"),
            };
        });
        expect(attrs).toEqual({ role: "group", orient: "horizontal" });
    });

    test("vertical orientation reflects on data-orientation", async ({ page }) => {
        const orient = await page.evaluate(() =>
            document.getElementById("vertical").getAttribute("data-orientation"));
        expect(orient).toBe("vertical");
    });

    test("items get aria-pressed + type=button", async ({ page }) => {
        const data = await page.evaluate(() => {
            const items = document.querySelectorAll("#view-mode [data-tg-item]");
            return Array.from(items).map(el => ({
                key: el.getAttribute("data-tg-item"),
                pressed: el.getAttribute("aria-pressed"),
                state: el.hasAttribute("data-pressed"),
                type: el.getAttribute("type"),
            }));
        });
        expect(data).toEqual([
            { key: "list", pressed: "true",  state: true,  type: "button" },
            { key: "grid", pressed: "false", state: false, type: "button" },
            { key: "card", pressed: "false", state: false, type: "button" },
        ]);
    });

    // ---- click selection ------------------------------------

    test("clicking an item selects it in single mode", async ({ page }) => {
        await page.click("#view-mode [data-tg-item='grid']");
        await page.waitForTimeout(30);
        const data = await page.evaluate(() => ({
            value: document.getElementById("view-mode").value,
            pressed: Array.from(document.querySelectorAll("#view-mode [data-tg-item]"))
                .map(el => el.getAttribute("aria-pressed")),
        }));
        expect(data).toEqual({
            value: "grid",
            pressed: ["false", "true", "false"],
        });
    });

    test("clicking current item in single mode is no-op (allow-deselect=false)", async ({ page }) => {
        await page.click("#view-mode [data-tg-item='list']");        // already selected
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("view-mode").value)).toBe("list");
    });

    test("allow-deselect lets clicking current item deselect", async ({ page }) => {
        await page.click("#deselectable [data-tg-item='name']");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("deselectable").value)).toBe("name");
        await page.click("#deselectable [data-tg-item='name']");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("deselectable").value)).toBeNull();
    });

    test("multi mode: clicking toggles membership", async ({ page }) => {
        // text-style starts with "bold"
        expect(await page.evaluate(() => document.getElementById("text-style").value))
            .toEqual(["bold"]);
        await page.click("#text-style [data-tg-item='italic']");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("text-style").value))
            .toEqual(["bold", "italic"]);
        await page.click("#text-style [data-tg-item='bold']");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("text-style").value))
            .toEqual(["italic"]);
    });

    // ---- roving tabindex + keyboard nav ---------------------

    test("first item gets tabindex=0; others -1 (roving)", async ({ page }) => {
        const tabindices = await page.evaluate(() =>
            Array.from(document.querySelectorAll("#view-mode [data-tg-item]"))
                .map(el => el.getAttribute("tabindex")));
        expect(tabindices).toEqual(["0", "-1", "-1"]);
    });

    test("ArrowRight moves focus to next item", async ({ page }) => {
        await page.focus("#view-mode [data-tg-item='list']");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        const focused = await page.evaluate(() =>
            document.activeElement?.getAttribute("data-tg-item"));
        expect(focused).toBe("grid");
        // tabindex should have flipped
        const tabindices = await page.evaluate(() =>
            Array.from(document.querySelectorAll("#view-mode [data-tg-item]"))
                .map(el => el.getAttribute("tabindex")));
        expect(tabindices).toEqual(["-1", "0", "-1"]);
    });

    test("ArrowRight at last item wraps to first (loop=true default)", async ({ page }) => {
        await page.focus("#view-mode [data-tg-item='card']");
        await page.waitForTimeout(30);
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        const focused = await page.evaluate(() =>
            document.activeElement?.getAttribute("data-tg-item"));
        expect(focused).toBe("list");
    });

    test("Home jumps to first, End to last", async ({ page }) => {
        await page.focus("#view-mode [data-tg-item='grid']");
        await page.keyboard.press("End");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.activeElement?.getAttribute("data-tg-item"))).toBe("card");
        await page.keyboard.press("Home");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.activeElement?.getAttribute("data-tg-item"))).toBe("list");
    });

    test("Space activates focused item without first navigating", async ({ page }) => {
        // Focus an item that's NOT selected
        await page.focus("#view-mode [data-tg-item='grid']");
        await page.keyboard.press("Space");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("view-mode").value)).toBe("grid");
    });

    test("Enter activates focused item", async ({ page }) => {
        await page.focus("#view-mode [data-tg-item='card']");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("view-mode").value)).toBe("card");
    });

    test("vertical orientation: ArrowDown navigates, ArrowRight does not", async ({ page }) => {
        await page.focus("#vertical [data-tg-item='top']");
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.activeElement?.getAttribute("data-tg-item"))).toBe("middle");
        // ArrowRight should NOT move (not the right axis for vertical)
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.activeElement?.getAttribute("data-tg-item"))).toBe("middle");
    });

    // ---- disabled handling ----------------------------------

    test("disabled item ignores clicks", async ({ page }) => {
        await page.click("#with-disabled [data-tg-item='cols-3']", { force: true });
        await page.waitForTimeout(30);
        // value should NOT have become 'cols-3'
        expect(await page.evaluate(() => document.getElementById("with-disabled").value)).not.toBe("cols-3");
    });

    test("disabled item is skipped by arrow nav (roving)", async ({ page }) => {
        await page.focus("#with-disabled [data-tg-item='cols-2']");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(30);
        // Should skip cols-3 (disabled) and land on cols-4
        expect(await page.evaluate(() => document.activeElement?.getAttribute("data-tg-item"))).toBe("cols-4");
    });

    test("group-wide disabled blocks all interaction", async ({ page }) => {
        await page.click("#b-disable-view");
        await page.waitForTimeout(50);
        await page.click("#view-mode [data-tg-item='grid']", { force: true });
        await page.waitForTimeout(30);
        // value should remain "list"
        expect(await page.evaluate(() => document.getElementById("view-mode").value)).toBe("list");
        // aria-disabled should be on all items
        const ariaDisabled = await page.evaluate(() =>
            Array.from(document.querySelectorAll("#view-mode [data-tg-item]"))
                .map(el => el.getAttribute("aria-disabled")));
        expect(ariaDisabled).toEqual(["true", "true", "true"]);
    });

    // ---- imperative API + events ----------------------------

    test("dispatches valuechange event with detail { value, reason }", async ({ page }) => {
        const evt = await page.evaluate(async () => {
            return new Promise(resolve => {
                const el = document.getElementById("view-mode");
                el.addEventListener("valuechange", e => resolve(e.detail), { once: true });
                el.setValue("card");
            });
        });
        expect(evt).toEqual({ value: "card", reason: "set" });
    });

    test("imperative setValue works for both single and multi", async ({ page }) => {
        await page.click("#b-set-grid");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("view-mode").value)).toBe("grid");

        await page.click("#b-set-bold-italic");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("text-style").value))
            .toEqual(["bold", "italic"]);
    });
});
