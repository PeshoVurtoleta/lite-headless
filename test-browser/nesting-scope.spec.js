// Browser tests for the light-DOM scope-leak fix.
//
// The contract: when two `<lite-X>` instances are nested, descendant
// queries by the outer instance MUST NOT capture descendants of the
// inner instance. Before the fix, `host.querySelectorAll("[data-X]")`
// would happily walk into nested same-tag custom elements; after, the
// `belongsToHost` check filters those out.
import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/nesting-scope.html";

test.describe("nesting-scope", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__nestingReady === true);
        await page.waitForTimeout(40);
    });

    test("skeleton: outer does not claim inner placeholder", async ({ page }) => {
        const data = await page.evaluate(() => {
            const outer = document.getElementById("sk-outer-placeholder");
            const inner = document.getElementById("sk-inner-placeholder");
            const outerHost = document.getElementById("sk-outer");
            const innerHost = document.getElementById("sk-inner");
            // The primitive sets `data-loading` on attached placeholders.
            // If scope leaked, both placeholders would still be attached
            // (the outer would attach the inner one too), but the
            // pendingSources accounting tells the real story: each host
            // tracks only its own declared source.
            return {
                outerHasState: outer.hasAttribute("data-loading"),
                innerHasState: inner.hasAttribute("data-loading"),
                outerPending: outerHost.pendingSources,
                innerPending: innerHost.pendingSources,
            };
        });
        // Both placeholders attached to SOMETHING (each to its own host).
        expect(data.outerHasState).toBe(true);
        expect(data.innerHasState).toBe(true);
        // Each host tracks only its declared source.
        expect(data.outerPending).toEqual(["outer"]);
        expect(data.innerPending).toEqual(["inner"]);
        // Resolve OUTER source -- inner placeholder must stay "loading".
        await page.evaluate(() => {
            document.getElementById("sk-outer").resolve("outer");
        });
        await page.waitForTimeout(80);
        const after = await page.evaluate(() => ({
            outerState: document.getElementById("sk-outer-placeholder").hasAttribute("data-loading"),
            innerState: document.getElementById("sk-inner-placeholder").hasAttribute("data-loading"),
            outerReady: document.getElementById("sk-outer").ready,
            innerReady: document.getElementById("sk-inner").ready,
        }));
        // Outer flipped to ready -> its placeholder transitions to "ready".
        expect(after.outerReady).toBe(true);
        // Inner is still loading -> its placeholder stays "loading".
        expect(after.innerReady).toBe(false);
        expect(after.innerState).toBe(true);
    });

    test("progress: outer's bar is the outer's, inner's bar is the inner's", async ({ page }) => {
        // Each bar carries its own host's painted state. The primitive
        // sets `data-progress="<value>"` and a `--progress: <fraction>`
        // CSS custom property on the attached bar. If the outer wrapper
        // had claimed the inner's bar, both bars would mirror the
        // outer's value.
        const data = await page.evaluate(() => {
            const outerBar = document.getElementById("pg-outer-bar");
            const innerBar = document.getElementById("pg-inner-bar");
            return {
                outerProgressAttr: outerBar.getAttribute("data-progress"),
                innerProgressAttr: innerBar.getAttribute("data-progress"),
                outerVar: outerBar.style.getPropertyValue("--progress"),
                innerVar: innerBar.style.getPropertyValue("--progress"),
                outerVal: document.getElementById("pg-outer").value,
                innerVal: document.getElementById("pg-inner").value,
            };
        });
        expect(data.outerVal).toBe(42);
        expect(data.innerVal).toBe(80);
        // The bars MUST carry distinct painted values.
        expect(data.outerProgressAttr).toBe("42");
        expect(data.innerProgressAttr).toBe("80");
        expect(data.outerVar.trim()).toBe("0.42");
        expect(data.innerVar.trim()).toBe("0.8");
    });

    test("file-upload: outer does not steal inner's drop-zone / input / list", async ({ page }) => {
        // Add a file via the outer's primitive API and verify it only
        // appears in the OUTER's list. If scope leaked, the outer
        // wrapper would have attached the INNER list element and our
        // row would render under the inner.
        await page.evaluate(() => {
            const f = new File([new Uint8Array(10)], "outer.txt", { type: "text/plain" });
            document.getElementById("fu-outer").addFiles([f]);
        });
        await page.waitForTimeout(60);
        const data = await page.evaluate(() => ({
            outerRows: document.querySelectorAll("#fu-outer-list > [data-file-row]").length,
            innerRows: document.querySelectorAll("#fu-inner-list > [data-file-row]").length,
        }));
        expect(data.outerRows).toBe(1);
        expect(data.innerRows).toBe(0);

        // Now the inverse: file via inner, must only appear in inner.
        await page.evaluate(() => {
            const f = new File([new Uint8Array(10)], "inner.txt", { type: "text/plain" });
            document.getElementById("fu-inner").addFiles([f]);
        });
        await page.waitForTimeout(60);
        const data2 = await page.evaluate(() => ({
            outerRows: document.querySelectorAll("#fu-outer-list > [data-file-row]").length,
            innerRows: document.querySelectorAll("#fu-inner-list > [data-file-row]").length,
        }));
        expect(data2.outerRows).toBe(1);    // unchanged
        expect(data2.innerRows).toBe(1);
    });

    test("tag-input: chip-paint stays inside each instance's list", async ({ page }) => {
        await page.evaluate(() => {
            document.getElementById("tg-outer").addTag("outer-1");
            document.getElementById("tg-outer").addTag("outer-2");
            document.getElementById("tg-inner").addTag("inner-1");
        });
        await page.waitForTimeout(60);
        const data = await page.evaluate(() => ({
            outerChips: Array.from(document.querySelectorAll("#tg-outer-list > [data-tag-chip]"))
                .map(c => c.querySelector(".lite-tag-chip-label").textContent),
            innerChips: Array.from(document.querySelectorAll("#tg-inner-list > [data-tag-chip]"))
                .map(c => c.querySelector(".lite-tag-chip-label").textContent),
        }));
        expect(data.outerChips).toEqual(["outer-1", "outer-2"]);
        expect(data.innerChips).toEqual(["inner-1"]);
    });

    test("pin-input: each instance owns exactly its own 3 slots", async ({ page }) => {
        // Type into the outer's first slot; the value should appear
        // only at the outer host, NOT the inner.
        await page.locator("#pin-outer-0").click();
        await page.keyboard.type("1");
        await page.waitForTimeout(40);
        const data = await page.evaluate(() => ({
            outerValue: document.getElementById("pin-outer").value,
            innerValue: document.getElementById("pin-inner").value,
        }));
        expect(data.outerValue).toBe("1");
        expect(data.innerValue).toBe("");
    });

    test("inline-edit: outer click does not start edit on inner", async ({ page }) => {
        // Click the OUTER display. Only the outer should enter edit mode.
        await page.locator("#ie-outer-display").click();
        await page.waitForTimeout(50);
        const data = await page.evaluate(() => ({
            outerEditing: document.getElementById("ie-outer").isEditing,
            innerEditing: document.getElementById("ie-inner").isEditing,
            outerInputHidden: document.getElementById("ie-outer-input").hasAttribute("hidden"),
            innerInputHidden: document.getElementById("ie-inner-input").hasAttribute("hidden"),
        }));
        expect(data.outerEditing).toBe(true);
        expect(data.innerEditing).toBe(false);
        expect(data.outerInputHidden).toBe(false);
        expect(data.innerInputHidden).toBe(true);
        // Escape out
        await page.keyboard.press("Escape");
        await page.waitForTimeout(40);
        // Reverse: click the INNER display.
        await page.locator("#ie-inner-display").click();
        await page.waitForTimeout(50);
        const data2 = await page.evaluate(() => ({
            outerEditing: document.getElementById("ie-outer").isEditing,
            innerEditing: document.getElementById("ie-inner").isEditing,
        }));
        expect(data2.outerEditing).toBe(false);
        expect(data2.innerEditing).toBe(true);
    });
});
