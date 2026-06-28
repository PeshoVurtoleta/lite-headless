// Browser tests for file-upload primitive
import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/file-upload.html";

// Helper: programmatically add files via the host's addFiles. We can't
// drive a real <input type=file> select dialog in Playwright without
// setInputFiles, but we can drive the API + dispatch synthetic drop
// events.
async function addProgrammaticFile(page, hostId, name, size = 64, type = "text/plain") {
    await page.evaluate(({ hostId, name, size, type }) => {
        const f = new File([new Uint8Array(size)], name, { type });
        document.getElementById(hostId).addFiles([f]);
    }, { hostId, name, size, type });
}

test.describe("file-upload", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__fileUploadReady === true);
        await page.waitForTimeout(60);
    });

    test("drop zone has data-drop-zone attr after attach", async ({ page }) => {
        const has = await page.evaluate(() => document.querySelector("#fu-basic [data-drop-zone]").hasAttribute("data-drop-zone"));
        expect(has).toBe(true);
    });

    test("data-drag-over paints during synthesized dragenter / dragleave", async ({ page }) => {
        await page.evaluate(() => {
            const z = document.querySelector("#fu-basic [data-drop-zone]");
            z.dispatchEvent(new Event("dragenter", { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(40);
        let over = await page.evaluate(() => document.querySelector("#fu-basic [data-drop-zone]").getAttribute("data-drag-over"));
        expect(over).toBe("true");
        await page.evaluate(() => {
            const z = document.querySelector("#fu-basic [data-drop-zone]");
            const ev = new Event("dragleave", { bubbles: true });
            ev.relatedTarget = document.body;
            z.dispatchEvent(ev);
        });
        await page.waitForTimeout(40);
        over = await page.evaluate(() => document.querySelector("#fu-basic [data-drop-zone]").hasAttribute("data-drag-over"));
        expect(over).toBe(false);
    });

    test("synthesized drop calls addFiles", async ({ page }) => {
        await page.evaluate(() => {
            const z = document.querySelector("#fu-basic [data-drop-zone]");
            const f = new File([new Uint8Array(32)], "dropped.txt", { type: "text/plain" });
            const ev = new Event("drop", { bubbles: true, cancelable: true });
            ev.dataTransfer = { files: [f] };
            z.dispatchEvent(ev);
        });
        await page.waitForTimeout(50);
        const data = await page.evaluate(() => ({
            count: document.getElementById("fu-basic").entries.length,
            firstName: document.getElementById("fu-basic").entries[0]?.file.name,
        }));
        expect(data.count).toBe(1);
        expect(data.firstName).toBe("dropped.txt");
    });

    test("addFiles via API renders one row per entry", async ({ page }) => {
        await addProgrammaticFile(page, "fu-basic", "a.txt");
        await addProgrammaticFile(page, "fu-basic", "b.txt");
        await page.waitForTimeout(60);
        const rows = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("#fu-basic [data-file-row]")).map(r => ({
                name: r.querySelector("[data-file-name]")?.textContent,
                status: r.getAttribute("data-status"),
                hasRemove: !!r.querySelector("[data-file-remove]"),
            }));
        });
        expect(rows.length).toBe(2);
        expect(rows[0].name).toBe("a.txt");
        expect(rows[0].hasRemove).toBe(true);
    });

    test("default demo driver: entry transitions to 'done' after ~1.5s", async ({ page }) => {
        await addProgrammaticFile(page, "fu-basic", "a.txt", 64);
        // Wait for demo driver to complete (20 steps × 75ms = 1500ms + jitter)
        await page.waitForFunction(
            () => document.getElementById("fu-basic").entries[0]?.status === "done",
            null,
            { timeout: 4000 }
        );
        const status = await page.evaluate(() => document.getElementById("fu-basic").entries[0].status);
        expect(status).toBe("done");
    });

    test("X-button on row removes the entry", async ({ page }) => {
        await addProgrammaticFile(page, "fu-basic", "a.txt");
        await addProgrammaticFile(page, "fu-basic", "b.txt");
        await page.waitForTimeout(60);
        // Click X on the first row
        await page.locator('#fu-basic [data-file-row]:nth-child(1) [data-file-remove]').click();
        await page.waitForTimeout(60);
        const remaining = await page.evaluate(() => ({
            count: document.getElementById("fu-basic").entries.length,
            firstName: document.getElementById("fu-basic").entries[0]?.file.name,
        }));
        expect(remaining.count).toBe(1);
        expect(remaining.firstName).toBe("b.txt");
    });

    test("constrained: maxSize rejects oversized files + fires invalid event", async ({ page }) => {
        const events = [];
        await page.exposeFunction("recordInvalid", (e) => events.push(e));
        await page.evaluate(() => {
            document.getElementById("fu-constrained").addEventListener("invalid", (e) => {
                window.recordInvalid({ name: e.detail.file.name, reason: e.detail.reason });
            });
        });
        await page.evaluate(() => {
            const big = new File([new Uint8Array(500)], "big.png", { type: "image/png" });
            document.getElementById("fu-constrained").addFiles([big]);
        });
        await page.waitForTimeout(80);
        expect(events).toEqual([{ name: "big.png", reason: "max-size" }]);
        const count = await page.evaluate(() => document.getElementById("fu-constrained").entries.length);
        expect(count).toBe(0);
    });

    test("constrained: accept rejects non-image files", async ({ page }) => {
        const events = [];
        await page.exposeFunction("recordInvalid2", (e) => events.push(e));
        await page.evaluate(() => {
            document.getElementById("fu-constrained").addEventListener("invalid", (e) => {
                window.recordInvalid2({ name: e.detail.file.name, reason: e.detail.reason });
            });
        });
        await page.evaluate(() => {
            const txt = new File([new Uint8Array(10)], "doc.txt", { type: "text/plain" });
            document.getElementById("fu-constrained").addFiles([txt]);
        });
        await page.waitForTimeout(60);
        expect(events).toEqual([{ name: "doc.txt", reason: "accept" }]);
    });

    test("constrained: maxFiles caps total queued count", async ({ page }) => {
        await page.evaluate(() => {
            const files = [];
            for (let i = 0; i < 5; i++) {
                files.push(new File([new Uint8Array(10)], `img${i}.png`, { type: "image/png" }));
            }
            document.getElementById("fu-constrained").addFiles(files);
        });
        await page.waitForTimeout(60);
        const count = await page.evaluate(() => document.getElementById("fu-constrained").entries.length);
        expect(count).toBe(3);
    });

    test("filesadded + complete + alldone events fire in order", async ({ page }) => {
        const events = [];
        await page.exposeFunction("recordEv", (msg) => events.push(msg));
        await page.evaluate(() => {
            const host = document.getElementById("fu-basic");
            host.addEventListener("filesadded", () => window.recordEv("filesadded"));
            host.addEventListener("complete",   (e) => window.recordEv("complete:" + e.detail.entry.file.name));
            host.addEventListener("alldone",    () => window.recordEv("alldone"));
        });
        await addProgrammaticFile(page, "fu-basic", "x.txt", 32);
        // Wait for the demo driver to finish
        await page.waitForFunction(
            () => document.getElementById("fu-basic").entries[0]?.status === "done",
            null,
            { timeout: 4000 }
        );
        await page.waitForTimeout(80);
        expect(events[0]).toBe("filesadded");
        expect(events).toContain("complete:x.txt");
        expect(events).toContain("alldone");
    });

    test("clear() removes all rows", async ({ page }) => {
        await addProgrammaticFile(page, "fu-basic", "a.txt");
        await addProgrammaticFile(page, "fu-basic", "b.txt");
        await page.waitForTimeout(60);
        await page.evaluate(() => document.getElementById("fu-basic").clear());
        await page.waitForTimeout(60);
        const data = await page.evaluate(() => ({
            count: document.getElementById("fu-basic").entries.length,
            rows: document.querySelectorAll("#fu-basic [data-file-row]").length,
        }));
        expect(data.count).toBe(0);
        expect(data.rows).toBe(0);
    });
});
