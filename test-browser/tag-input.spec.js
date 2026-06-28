// Browser tests for tag-input primitive
import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/tag-input.html";

test.describe("tag-input", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__tagsReady === true);
        await page.waitForTimeout(50);
    });

    test("attachRoot: role=group + aria + data attrs painted", async ({ page }) => {
        const data = await page.evaluate(() => {
            const el = document.getElementById("tags-basic");
            return {
                role: el.getAttribute("role"),
                aria: el.getAttribute("aria-label"),
                count: el.getAttribute("data-tag-count"),
                active: el.getAttribute("data-tag-active"),
            };
        });
        expect(data.role).toBe("group");
        expect(data.aria).toBe("Filter tags");
        expect(data.count).toBe("0");
        expect(data.active).toBe("-");
    });

    test("typing + Enter creates a chip with remove button", async ({ page }) => {
        await page.locator("#tags-basic [data-tag-input-slot]").click();
        await page.keyboard.type("javascript");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(60);
        const chips = await page.evaluate(() => {
            const chips = document.querySelectorAll("#tags-basic [data-tag-chip]");
            return Array.from(chips).map(c => ({
                label: c.querySelector(".lite-tag-chip-label")?.textContent,
                hasRemove: !!c.querySelector("[data-tag-remove]"),
                index: c.getAttribute("data-tag-index"),
            }));
        });
        expect(chips).toEqual([{ label: "javascript", hasRemove: true, index: "0" }]);
        const inputVal = await page.evaluate(() => document.querySelector("#tags-basic [data-tag-input-slot]").value);
        expect(inputVal).toBe("");
    });

    test("comma key creates chip + swallows the comma", async ({ page }) => {
        await page.locator("#tags-basic [data-tag-input-slot]").click();
        await page.keyboard.type("rust,go,zig");
        await page.waitForTimeout(60);
        // Commas after "rust" and "go" commit those; "zig" stays in the
        // input field (no trailing delimiter), so only two tags exist.
        let tags = await page.evaluate(() => document.getElementById("tags-basic").tags);
        expect(tags).toEqual(["rust", "go"]);
        let inputVal = await page.evaluate(() => document.querySelector("#tags-basic [data-tag-input-slot]").value);
        expect(inputVal).toBe("zig");
        // Enter commits the residue
        await page.keyboard.press("Enter");
        await page.waitForTimeout(60);
        tags = await page.evaluate(() => document.getElementById("tags-basic").tags);
        expect(tags).toEqual(["rust", "go", "zig"]);
        inputVal = await page.evaluate(() => document.querySelector("#tags-basic [data-tag-input-slot]").value);
        expect(inputVal).toBe("");
    });

    test("clicking the remove button on a chip removes it", async ({ page }) => {
        await page.evaluate(() => {
            const t = document.getElementById("tags-basic");
            t.addTag("alpha");
            t.addTag("beta");
            t.addTag("gamma");
        });
        await page.waitForTimeout(60);
        // Click X on the middle chip
        await page.locator('#tags-basic [data-tag-chip][data-tag-index="1"] [data-tag-remove]').click();
        await page.waitForTimeout(60);
        const tags = await page.evaluate(() => document.getElementById("tags-basic").tags);
        expect(tags).toEqual(["alpha", "gamma"]);
    });

    test("Backspace two-step in empty input", async ({ page }) => {
        await page.evaluate(() => {
            const t = document.getElementById("tags-basic");
            t.addTag("a"); t.addTag("b"); t.addTag("c");
        });
        await page.waitForTimeout(60);
        const slot = page.locator("#tags-basic [data-tag-input-slot]");
        await slot.click();
        // First Backspace: activates last
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(50);
        let state = await page.evaluate(() => ({
            tags: document.getElementById("tags-basic").tags,
            active: document.getElementById("tags-basic").activeIndex,
            activeAttr: document.getElementById("tags-basic").getAttribute("data-tag-active"),
        }));
        expect(state.tags).toEqual(["a", "b", "c"]);
        expect(state.active).toBe(2);
        expect(state.activeAttr).toBe("2");
        // Second Backspace: removes
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(50);
        state = await page.evaluate(() => ({
            tags: document.getElementById("tags-basic").tags,
            active: document.getElementById("tags-basic").activeIndex,
        }));
        expect(state.tags).toEqual(["a", "b"]);
        expect(state.active).toBe(1);
    });

    test("ArrowLeft navigates into tags, ArrowRight back to input", async ({ page }) => {
        await page.evaluate(() => {
            const t = document.getElementById("tags-basic");
            t.addTag("x"); t.addTag("y");
        });
        await page.waitForTimeout(50);
        const slot = page.locator("#tags-basic [data-tag-input-slot]");
        await slot.click();
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(40);
        let ai = await page.evaluate(() => document.getElementById("tags-basic").activeIndex);
        expect(ai).toBe(1);
        await page.keyboard.press("ArrowLeft");
        ai = await page.evaluate(() => document.getElementById("tags-basic").activeIndex);
        expect(ai).toBe(0);
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        ai = await page.evaluate(() => document.getElementById("tags-basic").activeIndex);
        expect(ai).toBe(-1);
    });

    test("paste with commas distributes into multiple tags", async ({ page }) => {
        const slot = page.locator("#tags-basic [data-tag-input-slot]");
        await slot.click();
        // Dispatch a real paste event with clipboardData
        await page.evaluate(() => {
            const inp = document.querySelector("#tags-basic [data-tag-input-slot]");
            let ev;
            try {
                ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
                ev.clipboardData.setData("text/plain", "one, two, three");
            } catch (_) {
                ev = new Event("paste", { bubbles: true, cancelable: true });
                ev.clipboardData = { getData: () => "one, two, three" };
            }
            inp.dispatchEvent(ev);
        });
        await page.waitForTimeout(80);
        const tags = await page.evaluate(() => document.getElementById("tags-basic").tags);
        expect(tags).toEqual(["one", "two", "three"]);
    });

    test("duplicate fires invalid event with reason", async ({ page }) => {
        const events = [];
        await page.exposeFunction("recordInvalid", (e) => events.push(e));
        await page.evaluate(() => {
            document.getElementById("tags-basic").addEventListener("invalid", (e) => window.recordInvalid(e.detail));
            const t = document.getElementById("tags-basic");
            t.addTag("alpha");
            t.addTag("alpha");
        });
        await page.waitForTimeout(80);
        expect(events).toEqual([{ tag: "alpha", reason: "duplicate" }]);
    });

    test("maxItems blocks further adds + fires invalid", async ({ page }) => {
        await page.evaluate(() => {
            const t = document.getElementById("tags-basic");
            // maxItems=5
            ["a", "b", "c", "d", "e", "f"].forEach(x => t.addTag(x));
        });
        await page.waitForTimeout(80);
        const data = await page.evaluate(() => {
            const t = document.getElementById("tags-basic");
            return { count: t.count, canAddMore: t.canAddMore };
        });
        expect(data.count).toBe(5);
        expect(data.canAddMore).toBe(false);
    });

    test("change CustomEvent fires with detail.tags", async ({ page }) => {
        const events = [];
        await page.exposeFunction("recordChange", (e) => events.push(e));
        await page.evaluate(() => {
            document.getElementById("tags-basic").addEventListener("change", (e) => window.recordChange(e.detail));
        });
        await page.evaluate(() => {
            document.getElementById("tags-basic").addTag("x");
            document.getElementById("tags-basic").addTag("y");
        });
        await page.waitForTimeout(60);
        expect(events).toEqual([
            { tags: ["x"] },
            { tags: ["x", "y"] },
        ]);
    });

    test("active chip gets data-tag-active=true painted", async ({ page }) => {
        await page.evaluate(() => {
            const t = document.getElementById("tags-basic");
            t.addTag("p"); t.addTag("q");
            t.setActiveIndex(0);
        });
        await page.waitForTimeout(60);
        const data = await page.evaluate(() => {
            const chips = document.querySelectorAll("#tags-basic [data-tag-chip]");
            return Array.from(chips).map(c => c.getAttribute("data-tag-active"));
        });
        expect(data).toEqual(["true", null]);
    });
});
