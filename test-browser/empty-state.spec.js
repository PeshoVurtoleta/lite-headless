// Browser specs: empty-state.
//
// Verifies the wrapper auto-discovers slot markers, variant attribute
// is reactive, and ARIA chain wires up correctly in a real browser.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

async function mountWrapper(page, name, html) {
    await page.goto(BASE + "/test-browser/fixtures/blank.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(async (path) => { await import(path); }, "/src/" + name + "/element.js");
    await page.evaluate((markup) => { document.body.insertAdjacentHTML("beforeend", markup); }, html);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
}

test.describe("empty-state", () => {
    test("declarative markup wires ARIA chain on mount", async ({ page }) => {
        await mountWrapper(page, "empty-state", `
            <lite-empty-state id="es" variant="empty">
                <div data-empty-icon>📭</div>
                <h3 id="t" data-empty-title>No projects</h3>
                <p id="d" data-empty-description>Create one to start.</p>
                <div data-empty-actions>
                    <button>Create</button>
                </div>
            </lite-empty-state>
        `);
        const state = await page.evaluate(() => {
            const root = document.getElementById("es");
            return {
                role:     root.getAttribute("role"),
                live:     root.getAttribute("aria-live"),
                variant:  root.getAttribute("data-variant"),
                lb:       root.getAttribute("aria-labelledby"),
                db:       root.getAttribute("aria-describedby"),
                titleH:   document.getElementById("t").tagName,
                titleRole: document.getElementById("t").getAttribute("role"),
                descId:   document.getElementById("d").id,
                iconHidden: document.querySelector("[data-empty-icon]").getAttribute("aria-hidden"),
                actionsRole: document.querySelector("[data-empty-actions]").getAttribute("role"),
            };
        });
        expect(state.role).toBe("status");
        expect(state.live).toBe("polite");
        expect(state.variant).toBe("empty");
        expect(state.lb).toBe("t");
        expect(state.db).toBe("d");
        expect(state.titleH).toBe("H3");
        expect(state.titleRole).toBe(null);    // real <h3>, no role override
        expect(state.iconHidden).toBe("true");
        expect(state.actionsRole).toBe("group");
    });

    test("variant attribute is reactive (external setAttribute flows in)", async ({ page }) => {
        await mountWrapper(page, "empty-state", `
            <lite-empty-state id="es" variant="empty"></lite-empty-state>
        `);
        await page.evaluate(() => document.getElementById("es").setAttribute("variant", "error"));
        await page.waitForTimeout(30);
        const v = await page.evaluate(() => ({
            attr:  document.getElementById("es").getAttribute("data-variant"),
            host:  document.getElementById("es").variant,
        }));
        expect(v.attr).toBe("error");
        expect(v.host).toBe("error");
    });

    test("host.setVariant mirrors to the variant attribute", async ({ page }) => {
        await mountWrapper(page, "empty-state", `
            <lite-empty-state id="es" variant="empty"></lite-empty-state>
        `);
        await page.evaluate(() => document.getElementById("es").setVariant("loading"));
        await page.waitForTimeout(30);
        const attr = await page.evaluate(() => document.getElementById("es").getAttribute("variant"));
        expect(attr).toBe("loading");
    });

    test("late-injected title is auto-discovered + relinks aria-labelledby", async ({ page }) => {
        await mountWrapper(page, "empty-state", `
            <lite-empty-state id="es"></lite-empty-state>
        `);
        await page.evaluate(() => {
            const h = document.createElement("h3");
            h.id = "later";
            h.setAttribute("data-empty-title", "");
            h.textContent = "Late title";
            document.getElementById("es").appendChild(h);
        });
        await page.waitForTimeout(50);
        const lb = await page.evaluate(() =>
            document.getElementById("es").getAttribute("aria-labelledby"));
        expect(lb).toBe("later");
    });

    test("div title gets role=heading + aria-level=2", async ({ page }) => {
        await mountWrapper(page, "empty-state", `
            <lite-empty-state id="es">
                <div id="t" data-empty-title>Title</div>
            </lite-empty-state>
        `);
        const r = await page.evaluate(() => ({
            role:  document.getElementById("t").getAttribute("role"),
            level: document.getElementById("t").getAttribute("aria-level"),
        }));
        expect(r.role).toBe("heading");
        expect(r.level).toBe("2");
    });
});
