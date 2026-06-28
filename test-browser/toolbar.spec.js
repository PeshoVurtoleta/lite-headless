// Browser specs: toolbar.
//
// Real keyboard navigation in chromium-1194. Verifies arrow nav +
// roving tabindex + disabled skip + Home/End jump.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

async function mountWrapper(page, name, html) {
    await page.goto(BASE + "/test-browser/fixtures/blank.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(async (path) => { await import(path); }, "/src/" + name + "/element.js");
    await page.evaluate((markup) => { document.body.insertAdjacentHTML("beforeend", markup); }, html);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
}

test.describe("toolbar", () => {
    test("attachRoot + items: role=toolbar + first item has tabindex=0", async ({ page }) => {
        await mountWrapper(page, "toolbar", `
            <lite-toolbar id="tb" aria-label="Formatting">
                <button id="b1" data-toolbar-item>Bold</button>
                <button id="b2" data-toolbar-item>Italic</button>
                <button id="b3" data-toolbar-item>Underline</button>
            </lite-toolbar>
        `);
        const state = await page.evaluate(() => ({
            role:  document.getElementById("tb").getAttribute("role"),
            t1:    document.getElementById("b1").getAttribute("tabindex"),
            t2:    document.getElementById("b2").getAttribute("tabindex"),
            t3:    document.getElementById("b3").getAttribute("tabindex"),
        }));
        expect(state.role).toBe("toolbar");
        expect(state.t1).toBe("0");
        expect(state.t2).toBe("-1");
        expect(state.t3).toBe("-1");
    });

    test("ArrowRight moves the tab stop to the next item", async ({ page }) => {
        await mountWrapper(page, "toolbar", `
            <lite-toolbar id="tb">
                <button id="b1" data-toolbar-item>A</button>
                <button id="b2" data-toolbar-item>B</button>
                <button id="b3" data-toolbar-item>C</button>
            </lite-toolbar>
        `);
        await page.focus("#b1");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(20);
        const tabs = await page.evaluate(() => ({
            t1: document.getElementById("b1").getAttribute("tabindex"),
            t2: document.getElementById("b2").getAttribute("tabindex"),
            t3: document.getElementById("b3").getAttribute("tabindex"),
            focusedId: document.activeElement && document.activeElement.id,
        }));
        expect(tabs.t1).toBe("-1");
        expect(tabs.t2).toBe("0");
        expect(tabs.focusedId).toBe("b2");
    });

    test("Home jumps to first; End jumps to last", async ({ page }) => {
        await mountWrapper(page, "toolbar", `
            <lite-toolbar id="tb">
                <button id="b1" data-toolbar-item>A</button>
                <button id="b2" data-toolbar-item>B</button>
                <button id="b3" data-toolbar-item>C</button>
            </lite-toolbar>
        `);
        await page.focus("#b1");
        await page.keyboard.press("End");
        await page.waitForTimeout(20);
        let focused = await page.evaluate(() => document.activeElement.id);
        expect(focused).toBe("b3");
        await page.keyboard.press("Home");
        await page.waitForTimeout(20);
        focused = await page.evaluate(() => document.activeElement.id);
        expect(focused).toBe("b1");
    });

    test("disabled items skipped during arrow nav", async ({ page }) => {
        await mountWrapper(page, "toolbar", `
            <lite-toolbar id="tb">
                <button id="b1" data-toolbar-item>A</button>
                <button id="b2" data-toolbar-item aria-disabled="true">B</button>
                <button id="b3" data-toolbar-item>C</button>
            </lite-toolbar>
        `);
        await page.focus("#b1");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(20);
        // b2 is disabled; b3 should be focused
        const focused = await page.evaluate(() => document.activeElement.id);
        expect(focused).toBe("b3");
    });

    test("ArrowLeft at first wraps to last (loop=true default)", async ({ page }) => {
        await mountWrapper(page, "toolbar", `
            <lite-toolbar id="tb">
                <button id="b1" data-toolbar-item>A</button>
                <button id="b2" data-toolbar-item>B</button>
                <button id="b3" data-toolbar-item>C</button>
            </lite-toolbar>
        `);
        await page.focus("#b1");
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(20);
        const focused = await page.evaluate(() => document.activeElement.id);
        expect(focused).toBe("b3");
    });

    test("vertical orientation: ArrowDown moves forward", async ({ page }) => {
        await mountWrapper(page, "toolbar", `
            <lite-toolbar id="tb" orientation="vertical">
                <button id="b1" data-toolbar-item>A</button>
                <button id="b2" data-toolbar-item>B</button>
            </lite-toolbar>
        `);
        await page.focus("#b1");
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(20);
        const focused = await page.evaluate(() => document.activeElement.id);
        expect(focused).toBe("b2");
        const ariaOrient = await page.evaluate(() =>
            document.getElementById("tb").getAttribute("aria-orientation"));
        expect(ariaOrient).toBe("vertical");
    });

    test("separator paints role + perpendicular aria-orientation", async ({ page }) => {
        await mountWrapper(page, "toolbar", `
            <lite-toolbar id="tb" orientation="horizontal">
                <button data-toolbar-item>A</button>
                <div id="sep" data-toolbar-separator></div>
                <button data-toolbar-item>B</button>
            </lite-toolbar>
        `);
        const role = await page.evaluate(() => document.getElementById("sep").getAttribute("role"));
        const ariaOrient = await page.evaluate(() => document.getElementById("sep").getAttribute("aria-orientation"));
        expect(role).toBe("separator");
        expect(ariaOrient).toBe("vertical");    // perpendicular to horizontal toolbar
    });
});
