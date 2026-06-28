// Command palette browser specs — exercise the real Cmd+K keybinding
// (with input-context awareness), keyboard nav with real focus,
// fuzzy ranking with match highlights, and click invocation.

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/command-palette.html";

test.describe("command-palette", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__paletteReady === true);
        await page.waitForTimeout(50);
    });

    // ---- global keybinding ------------------------------------

    test("Cmd+K (Meta+K) opens the palette", async ({ page }) => {
        expect(await page.evaluate(() => document.getElementById("palette").isOpen)).toBe(false);
        await page.keyboard.press("Meta+K");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("palette").isOpen)).toBe(true);
        // modal becomes visible
        expect(await page.locator("#modal").isVisible()).toBe(true);
    });

    test("Ctrl+K also opens (cross-platform fallback)", async ({ page }) => {
        await page.keyboard.press("Control+K");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("palette").isOpen)).toBe(true);
    });

    test("Cmd+K toggles -- pressing twice closes", async ({ page }) => {
        await page.keyboard.press("Meta+K");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("palette").isOpen)).toBe(true);
        await page.keyboard.press("Meta+K");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("palette").isOpen)).toBe(false);
    });

    test("input auto-focuses on open", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        const focused = await page.evaluate(() =>
            document.activeElement?.getAttribute("data-cmd-input") != null);
        expect(focused).toBe(true);
    });

    // ---- ARIA painting ---------------------------------------

    test("input gets role=combobox + aria-expanded that follows open state", async ({ page }) => {
        const initialAttrs = await page.evaluate(() => {
            const el = document.querySelector("[data-cmd-input]");
            return {
                role: el.getAttribute("role"),
                expanded: el.getAttribute("aria-expanded"),
                autocomplete: el.getAttribute("aria-autocomplete"),
            };
        });
        expect(initialAttrs).toEqual({
            role: "combobox",
            expanded: "false",
            autocomplete: "list",
        });
        await page.click("#b-open");
        await page.waitForTimeout(50);
        const opened = await page.evaluate(() =>
            document.querySelector("[data-cmd-input]").getAttribute("aria-expanded"));
        expect(opened).toBe("true");
    });

    test("list gets role=listbox; items get role=option", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        const roles = await page.evaluate(() => ({
            list: document.querySelector("[data-cmd-list]").getAttribute("role"),
            firstItem: document.querySelector("[data-cmd-list] li")?.getAttribute("role"),
        }));
        expect(roles).toEqual({ list: "listbox", firstItem: "option" });
    });

    test("aria-activedescendant on input tracks the active item id", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        const initial = await page.evaluate(() => {
            const input = document.querySelector("[data-cmd-input]");
            const firstItem = document.querySelector("[data-cmd-list] li");
            return {
                activeDesc: input.getAttribute("aria-activedescendant"),
                firstId: firstItem?.id,
            };
        });
        expect(initial.activeDesc).toBe(initial.firstId);
        // ArrowDown -> second item
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(30);
        const next = await page.evaluate(() => {
            const input = document.querySelector("[data-cmd-input]");
            const items = document.querySelectorAll("[data-cmd-list] li");
            return {
                activeDesc: input.getAttribute("aria-activedescendant"),
                secondId: items[1]?.id,
            };
        });
        expect(next.activeDesc).toBe(next.secondId);
    });

    // ---- keyboard nav ---------------------------------------

    test("ArrowDown / ArrowUp navigate results", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        const getActive = () => page.evaluate(() => {
            const ae = document.querySelector("[data-cmd-list] [data-active]");
            return ae?.textContent;
        });
        let active = await getActive();
        expect(active).toContain("Save");           // first cmd
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(20);
        active = await getActive();
        expect(active).toContain("Open");
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(20);
        active = await getActive();
        expect(active).toContain("Save");
    });

    test("ArrowDown wraps from last to first", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        const total = await page.evaluate(() =>
            document.querySelectorAll("[data-cmd-list] li").length);
        // press ArrowDown total times -- should wrap back to 0
        for (let i = 0; i < total; i++) await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(30);
        const active = await page.evaluate(() => {
            const ae = document.querySelector("[data-cmd-list] [data-active]");
            return ae?.textContent;
        });
        expect(active).toContain("Save");
    });

    test("Home jumps to first, End to last", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        await page.keyboard.press("End");
        await page.waitForTimeout(20);
        const last = await page.evaluate(() => {
            const items = document.querySelectorAll("[data-cmd-list] li");
            const ae = document.querySelector("[data-cmd-list] [data-active]");
            return {
                activeText: ae?.textContent,
                lastText: items[items.length - 1]?.textContent,
            };
        });
        expect(last.activeText).toBe(last.lastText);
        await page.keyboard.press("Home");
        await page.waitForTimeout(20);
        const firstActive = await page.evaluate(() => {
            const ae = document.querySelector("[data-cmd-list] [data-active]");
            return ae?.textContent;
        });
        expect(firstActive).toContain("Save");
    });

    // ---- query + filtering ----------------------------------

    test("typing filters results in real time", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        await page.fill("[data-cmd-input]", "find");
        await page.waitForTimeout(50);
        const labels = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-cmd-list] li"))
                .map(li => li.firstChild.textContent));
        // Should find "Find" -- and may include keyword matches like "Replace" (no, "find" doesn't match Replace's keywords)
        expect(labels.length).toBeGreaterThan(0);
        expect(labels[0]).toContain("Find");
    });

    test("query that matches nothing reveals the empty state", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        await page.fill("[data-cmd-input]", "xyzzy nonexistent");
        await page.waitForTimeout(50);
        const empty = await page.locator("[data-cmd-empty]").isVisible();
        expect(empty).toBe(true);
        const listHidden = await page.evaluate(() =>
            document.querySelector("[data-cmd-list]").hidden);
        expect(listHidden).toBe(true);
    });

    test("fuzzy search finds non-contiguous matches", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        // 'ocl' should fuzzy-match "Open Command Line"
        await page.fill("[data-cmd-input]", "ocl");
        await page.waitForTimeout(50);
        const labels = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-cmd-list] li"))
                .map(li => li.firstChild.textContent));
        expect(labels.some(l => l.includes("Open Command Line"))).toBe(true);
    });

    // ---- invocation -----------------------------------------

    test("Enter invokes the active command and closes the palette", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(50);
        const logged = await page.evaluate(() => document.getElementById("log").textContent);
        expect(logged).toContain("Saved");
        expect(await page.evaluate(() => document.getElementById("palette").isOpen)).toBe(false);
    });

    test("Click on a result invokes it", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        // click the 3rd item (Save As...)
        const items = page.locator("[data-cmd-list] li");
        await items.nth(2).click();
        await page.waitForTimeout(50);
        const logged = await page.evaluate(() => document.getElementById("log").textContent);
        expect(logged).toContain("Saved As");
    });

    test("Escape closes the palette without invoking", async ({ page }) => {
        await page.click("#b-open");
        await page.waitForTimeout(50);
        const beforeLog = await page.evaluate(() => document.getElementById("log").textContent);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("palette").isOpen)).toBe(false);
        const afterLog = await page.evaluate(() => document.getElementById("log").textContent);
        expect(afterLog).toBe(beforeLog);
    });

    // ---- input-context awareness ----------------------------

    test("Cmd+K inside another input does NOT hijack typing", async ({ page }) => {
        // Add a sibling input + focus it
        await page.evaluate(() => {
            const input = document.createElement("input");
            input.id = "outside-input";
            input.placeholder = "Type freely";
            document.body.insertBefore(input, document.getElementById("backdrop"));
            input.focus();
        });
        // Typing K with no modifier should appear in the outside input
        // but Cmd+K should NOT open the palette here (no -- wait, the
        // primitive's policy is: don't hijack while focus is in another
        // INPUT/TEXTAREA. Verify the palette stays closed.)
        await page.keyboard.press("Meta+K");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("palette").isOpen)).toBe(false);
        // But if we focus AWAY from the input, Cmd+K should work
        await page.evaluate(() => document.activeElement?.blur?.());
        await page.waitForTimeout(20);
        await page.keyboard.press("Meta+K");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("palette").isOpen)).toBe(true);
    });

    test("Cmd+K inside the palette's OWN input still toggles", async ({ page }) => {
        // open palette, focus is in palette input
        await page.click("#b-open");
        await page.waitForTimeout(50);
        // Cmd+K closes (palette input is exempted from the hijack rule)
        await page.keyboard.press("Meta+K");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("palette").isOpen)).toBe(false);
    });

    // ---- recent-boost over time ------------------------------

    test("invoking a command boosts it on next show (within tier)", async ({ page }) => {
        // Type "find" -> matches Find (exact label). Invoke it.
        // Then re-open + query "e" -> all matches like "Save", "Save As", "Open",
        // "Close", "Find", "Replace", "Undo", "Redo", "Toggle Sidebar", "Format Document".
        // "Find" is one of many SUBSTRING matches for "e"... actually "find"
        // doesn't contain "e". Let me use a different example.

        // Open + invoke "Open"
        await page.click("#b-open");
        await page.waitForTimeout(50);
        await page.fill("[data-cmd-input]", "open");
        await page.waitForTimeout(30);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(50);

        // Re-open + check that "Open" appears in the top-3 (recent boost)
        // among other "o"-substring matches.
        await page.click("#b-open");
        await page.waitForTimeout(50);
        await page.fill("[data-cmd-input]", "o");
        await page.waitForTimeout(50);
        const labels = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-cmd-list] li"))
                .map(li => li.firstChild.textContent));
        // Among all the "o"-containing labels, "Open" should be high.
        const idx = labels.findIndex(l => l === "Open");
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(3);
    });
});
