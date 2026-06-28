// Browser tests for inline-edit primitive
import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/inline-edit.html";

test.describe("inline-edit", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__inlineEditReady === true);
        await page.waitForTimeout(60);
    });

    test("display mode initial paint", async ({ page }) => {
        const data = await page.evaluate(() => {
            const el = document.getElementById("ie-basic");
            return {
                mode: el.getAttribute("data-mode"),
                displayText: el.querySelector("[data-inline-edit-display-slot]").textContent,
                inputHidden: el.querySelector("[data-inline-edit-input-slot]").hasAttribute("hidden"),
                value: el.value,
                editing: el.isEditing,
            };
        });
        expect(data.mode).toBe("display");
        expect(data.displayText).toBe("Untitled card");
        expect(data.inputHidden).toBe(true);
        expect(data.value).toBe("Untitled card");
        expect(data.editing).toBe(false);
    });

    test("click display starts edit + reveals input + focus", async ({ page }) => {
        await page.locator("#ie-basic [data-inline-edit-display-slot]").click();
        await page.waitForTimeout(80);
        const data = await page.evaluate(() => {
            const el = document.getElementById("ie-basic");
            return {
                mode: el.getAttribute("data-mode"),
                displayHidden: el.querySelector("[data-inline-edit-display-slot]").hasAttribute("hidden"),
                inputHidden: el.querySelector("[data-inline-edit-input-slot]").hasAttribute("hidden"),
                editing: el.isEditing,
                focusedTag: document.activeElement.tagName,
            };
        });
        expect(data.mode).toBe("edit");
        expect(data.displayHidden).toBe(true);
        expect(data.inputHidden).toBe(false);
        expect(data.editing).toBe(true);
        expect(data.focusedTag).toBe("INPUT");
    });

    test("type + Enter commits + transitions back to display", async ({ page }) => {
        await page.locator("#ie-basic [data-inline-edit-display-slot]").click();
        await page.waitForTimeout(60);
        // Select all + type to replace. We use "ControlOrMeta" rather than
        // "Control" because macOS treats Ctrl+A inside an input as
        // "move-cursor-to-line-start" (Emacs binding), not "select all";
        // typing after that would prepend rather than replace.
        // playwright's ControlOrMeta auto-translates to Meta on darwin.
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type("New title");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(60);
        const data = await page.evaluate(() => {
            const el = document.getElementById("ie-basic");
            return {
                value: el.value,
                editing: el.isEditing,
                mode: el.getAttribute("data-mode"),
                displayText: el.querySelector("[data-inline-edit-display-slot]").textContent,
            };
        });
        expect(data.value).toBe("New title");
        expect(data.editing).toBe(false);
        expect(data.mode).toBe("display");
        expect(data.displayText).toBe("New title");
    });

    test("Escape cancels + reverts to original", async ({ page }) => {
        await page.locator("#ie-basic [data-inline-edit-display-slot]").click();
        await page.waitForTimeout(60);
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type("Should-be-discarded");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(60);
        const data = await page.evaluate(() => ({
            value: document.getElementById("ie-basic").value,
            editing: document.getElementById("ie-basic").isEditing,
        }));
        expect(data.value).toBe("Untitled card");
        expect(data.editing).toBe(false);
    });

    test("blur commits", async ({ page }) => {
        await page.locator("#ie-basic [data-inline-edit-display-slot]").click();
        await page.waitForTimeout(60);
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type("Via blur");
        // Click somewhere else to blur
        await page.locator("h2").first().click();
        await page.waitForTimeout(60);
        const data = await page.evaluate(() => ({
            value: document.getElementById("ie-basic").value,
            editing: document.getElementById("ie-basic").isEditing,
        }));
        expect(data.value).toBe("Via blur");
        expect(data.editing).toBe(false);
    });

    test("Enter on focused display starts edit", async ({ page }) => {
        await page.locator("#ie-basic [data-inline-edit-display-slot]").focus();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(60);
        const editing = await page.evaluate(() => document.getElementById("ie-basic").isEditing);
        expect(editing).toBe(true);
    });

    test("editstart + commit + cancel events fire in order", async ({ page }) => {
        const events = [];
        await page.exposeFunction("recordIE", (s) => events.push(s));
        await page.evaluate(() => {
            const el = document.getElementById("ie-basic");
            el.addEventListener("editstart", () => window.recordIE("editstart"));
            el.addEventListener("commit",    (e) => window.recordIE("commit:" + e.detail.value));
            el.addEventListener("cancel",    () => window.recordIE("cancel"));
        });
        await page.locator("#ie-basic [data-inline-edit-display-slot]").click();
        await page.waitForTimeout(40);
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type("X");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(40);
        await page.locator("#ie-basic [data-inline-edit-display-slot]").click();
        await page.waitForTimeout(40);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(40);
        expect(events).toEqual(["editstart", "commit:X", "editstart", "cancel"]);
    });

    test("empty commit rejected -> data-invalid + stays editing", async ({ page }) => {
        await page.locator("#ie-basic [data-inline-edit-display-slot]").click();
        await page.waitForTimeout(60);
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Delete");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(60);
        const data = await page.evaluate(() => {
            const el = document.getElementById("ie-basic");
            return {
                editing: el.isEditing,
                invalid: el.isInvalid,
                rootInvalid: el.getAttribute("data-invalid"),
                value: el.value,
            };
        });
        expect(data.editing).toBe(true);
        expect(data.invalid).toBe(true);
        expect(data.rootInvalid).toBe("true");
        expect(data.value).toBe("Untitled card");   // unchanged
    });

    test("setValue programmatically updates display", async ({ page }) => {
        await page.evaluate(() => document.getElementById("ie-basic").setValue("Renamed"));
        await page.waitForTimeout(40);
        const data = await page.evaluate(() => ({
            value: document.getElementById("ie-basic").value,
            displayText: document.querySelector("#ie-basic [data-inline-edit-display-slot]").textContent,
        }));
        expect(data.value).toBe("Renamed");
        expect(data.displayText).toBe("Renamed");
    });

    test("min-length rollback via event interceptor (demo pattern)", async ({ page }) => {
        await page.locator("#ie-validated [data-inline-edit-display-slot]").click();
        await page.waitForTimeout(40);
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type("xy");          // 2 chars < 3
        await page.keyboard.press("Enter");
        await page.waitForTimeout(80);
        // The fixture's commit-handler rolls back + re-starts edit
        const data = await page.evaluate(() => ({
            value: document.getElementById("ie-validated").value,
            editing: document.getElementById("ie-validated").isEditing,
            log: document.getElementById("event-log").textContent,
        }));
        expect(data.value).toBe("abc");          // original
        expect(data.editing).toBe(true);
        expect(data.log).toContain("rolled back");
    });
});
