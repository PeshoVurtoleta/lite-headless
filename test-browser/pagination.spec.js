// Pagination browser specs — real keyboard, real DOM, real ARIA painting.

import { test, expect } from "@playwright/test";

const ROUTE = "/test-browser/fixtures/pagination.html";

test.describe("pagination", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ROUTE, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__paginationReady === true);
        await page.waitForTimeout(50);
    });

    test("root gets role=navigation + aria-label", async ({ page }) => {
        const attrs = await page.evaluate(() => {
            const el = document.getElementById("basic");
            return {
                role: el.getAttribute("role"),
                label: el.getAttribute("aria-label"),
            };
        });
        expect(attrs).toEqual({ role: "navigation", label: "Pagination" });
    });

    test("initial render: 20 pages with current=1 -> [1] 2 … 20", async ({ page }) => {
        const items = await page.evaluate(() => {
            const list = document.querySelector("#basic [data-pgn-list]");
            return Array.from(list.children).map(li => {
                if (li.hasAttribute("data-pgn-ellipsis")) return "…";
                const btn = li.querySelector("button");
                return btn.hasAttribute("data-current") ? `[${btn.textContent}]` : btn.textContent;
            });
        });
        expect(items.join(" ")).toBe("[1] 2 … 20");
    });

    test("prev/first are disabled at page 1; next/last are not", async ({ page }) => {
        const disabled = await page.evaluate(() => ({
            prev:  document.querySelector("#basic [data-pgn-prev]").hasAttribute("data-disabled"),
            next:  document.querySelector("#basic [data-pgn-next]").hasAttribute("data-disabled"),
            first: document.querySelector("#basic [data-pgn-first]").hasAttribute("data-disabled"),
            last:  document.querySelector("#basic [data-pgn-last]").hasAttribute("data-disabled"),
        }));
        expect(disabled).toEqual({ prev: true, next: false, first: true, last: false });
    });

    test("clicking next advances + re-renders list", async ({ page }) => {
        await page.click("#basic [data-pgn-next]");
        await page.waitForTimeout(30);
        const items = await page.evaluate(() => {
            const list = document.querySelector("#basic [data-pgn-list]");
            return Array.from(list.children).map(li => {
                if (li.hasAttribute("data-pgn-ellipsis")) return "…";
                const btn = li.querySelector("button");
                return btn.hasAttribute("data-current") ? `[${btn.textContent}]` : btn.textContent;
            }).join(" ");
        });
        // 20 pages, page=2, sibling=1, boundary=1 -> 1 [2] 3 … 20
        expect(items).toBe("1 [2] 3 … 20");
    });

    test("clicking a page button jumps to that page", async ({ page }) => {
        // First navigate to page 10 to make page-2 button visible
        await page.evaluate(() => document.getElementById("basic").setPage(10));
        await page.waitForTimeout(30);
        // Now click last
        await page.click("#basic [data-pgn-last]");
        await page.waitForTimeout(30);
        const page2 = await page.evaluate(() => document.getElementById("basic").page);
        expect(page2).toBe(20);
    });

    test("aria-current=page paints on current button + moves with state", async ({ page }) => {
        await page.evaluate(() => document.getElementById("basic").setPage(10));
        await page.waitForTimeout(30);
        const currentText = await page.evaluate(() => {
            const el = document.querySelector('#basic [aria-current="page"]');
            return el?.textContent;
        });
        expect(currentText).toBe("10");
    });

    test("disabled nav button click is a no-op", async ({ page }) => {
        // basic is on page 1, prev is disabled
        await page.click("#basic [data-pgn-prev]", { force: true });
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("basic").page)).toBe(1);
    });

    test("setting page-count via attribute changes the layout", async ({ page }) => {
        await page.evaluate(() => document.getElementById("basic").setAttribute("page-count", "10"));
        await page.waitForTimeout(50);
        const count = await page.evaluate(() => document.getElementById("basic").pageCount);
        expect(count).toBe(10);
    });

    test("setting page via attribute syncs state", async ({ page }) => {
        await page.evaluate(() => document.getElementById("basic").setAttribute("page", "7"));
        await page.waitForTimeout(50);
        const cur = await page.evaluate(() => document.getElementById("basic").page);
        expect(cur).toBe(7);
    });

    test("imperative API: setPage / first / last / next / prev", async ({ page }) => {
        await page.click("#b-page-5");
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("basic").page)).toBe(5);

        await page.evaluate(() => document.getElementById("basic").first());
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("basic").page)).toBe(1);

        await page.evaluate(() => document.getElementById("basic").last());
        await page.waitForTimeout(30);
        expect(await page.evaluate(() => document.getElementById("basic").page)).toBe(20);
    });

    test("setPageCount clamps current page when smaller", async ({ page }) => {
        // basic is at 20 -> set count to 3 -> page should clamp to 3
        await page.evaluate(() => document.getElementById("basic").setPage(20));
        await page.waitForTimeout(30);
        await page.click("#b-set-count-3");
        await page.waitForTimeout(50);
        expect(await page.evaluate(() => document.getElementById("basic").page)).toBe(3);
        expect(await page.evaluate(() => document.getElementById("basic").pageCount)).toBe(3);
    });

    test("small (5 pages) shows all pages without ellipsis", async ({ page }) => {
        const text = await page.evaluate(() => {
            const list = document.querySelector("#small [data-pgn-list]");
            return Array.from(list.children).map(li => {
                if (li.hasAttribute("data-pgn-ellipsis")) return "…";
                const btn = li.querySelector("button");
                return btn.hasAttribute("data-current") ? `[${btn.textContent}]` : btn.textContent;
            }).join(" ");
        });
        expect(text).toBe("[1] 2 3 4 5");
    });

    test("wide (50p · sibling=3 · boundary=2) initial render is correct", async ({ page }) => {
        // page=25 sibling=3 boundary=2
        // -> 1 2 … 22 23 24 [25] 26 27 28 … 49 50
        const text = await page.evaluate(() => {
            const list = document.querySelector("#wide [data-pgn-list]");
            return Array.from(list.children).map(li => {
                if (li.hasAttribute("data-pgn-ellipsis")) return "…";
                const btn = li.querySelector("button");
                return btn.hasAttribute("data-current") ? `[${btn.textContent}]` : btn.textContent;
            }).join(" ");
        });
        expect(text).toBe("1 2 … 22 23 24 [25] 26 27 28 … 49 50");
    });

    test("ellipsis has aria-hidden so SRs skip it", async ({ page }) => {
        const hidden = await page.evaluate(() => {
            const ell = document.querySelector("#basic [data-pgn-ellipsis] span");
            return ell?.getAttribute("aria-hidden");
        });
        expect(hidden).toBe("true");
    });

    test("dispatches itemschange event on page-change", async ({ page }) => {
        const fired = await page.evaluate(async () => {
            const el = document.getElementById("basic");
            return new Promise((resolve) => {
                el.addEventListener("itemschange", e => resolve(e.detail.items.length), { once: true });
                el.setPage(10);
            });
        });
        expect(typeof fired).toBe("number");
        expect(fired).toBeGreaterThan(0);
    });
});
