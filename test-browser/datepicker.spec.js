// test-browser/datepicker.spec.js
// Real focus events + tabindex traversal across the grid. Also exercises
// the v0.7 drilldown flow days -> months -> years -> month -> day with
// keyboard nav.

import { test, expect } from "@playwright/test";

test.describe("datepicker", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/test-browser/fixtures/datepicker.html");
    });

    test("today cell is marked and is the initial focus target", async ({ page }) => {
        // pinned today = 2026-06-11
        const today = page.locator("[data-date='2026-6-11']");
        await expect(today).toHaveAttribute("data-today", "");
        await expect(today).toHaveAttribute("aria-current", "date");
        await expect(today).toHaveAttribute("tabindex", "0");
    });

    test("clicking a date sets the value and marks the cell selected", async ({ page }) => {
        await page.click("[data-date='2026-6-15']");
        await expect(page.locator("[data-date='2026-6-15']")).toHaveAttribute("data-selected", "");
        await expect(page.locator("#readout")).toHaveText("2026-06-15");
    });

    test("ArrowRight moves focus to the next day cell", async ({ page }) => {
        await page.locator("[data-date='2026-6-11']").focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.locator("[data-date='2026-6-12']")).toBeFocused();
    });

    test("ArrowLeft past the 1st of month switches to previous month view", async ({ page }) => {
        // First focus June 1
        await page.locator("[data-date='2026-6-1']").click();
        // ArrowLeft -> should move to May 31 (visible after auto-month-switch)
        await page.locator("[data-date='2026-6-1']").focus();
        await page.keyboard.press("ArrowLeft");
        await expect(page.locator("[data-date='2026-5-31']")).toBeFocused();
        await expect(page.locator("#label")).toContainText("May");
    });

    test("PageDown advances by one month", async ({ page }) => {
        await page.locator("[data-date='2026-6-11']").focus();
        await page.keyboard.press("PageDown");
        await expect(page.locator("[data-date='2026-7-11']")).toBeFocused();
        await expect(page.locator("#label")).toContainText("July");
    });

    test("Enter on a focused cell picks that date", async ({ page }) => {
        await page.locator("[data-date='2026-6-20']").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#readout")).toHaveText("2026-06-20");
    });

    test("clicking the month label cycles to months view", async ({ page }) => {
        await page.click("#label");
        await expect(page.locator("#grid")).toHaveAttribute("data-view", "months");
        await expect(page.locator("#label")).toHaveText("2026");

        // Click a month cell -> back to days, viewMonth = that month
        const monthCells = page.locator("[data-cell-kind='month']");
        await expect(monthCells).toHaveCount(12);
        // March is the third month
        await monthCells.nth(2).click();
        await expect(page.locator("#grid")).toHaveAttribute("data-view", "days");
        await expect(page.locator("#label")).toContainText("March 2026");
    });

    test("days -> months -> years drilldown via label clicks", async ({ page }) => {
        await page.click("#label");   // days -> months
        await expect(page.locator("#grid")).toHaveAttribute("data-view", "months");
        await page.click("#label");   // months -> years
        await expect(page.locator("#grid")).toHaveAttribute("data-view", "years");
        await expect(page.locator("#label")).toHaveText("2020 – 2029");

        // Click a year -> drill to months view of that year
        const yearCells = page.locator("[data-cell-kind='year']");
        await expect(yearCells).toHaveCount(12);
        // Click "2027" -- index depends on padding (2019 is index 0, so 2027 is index 8)
        await yearCells.nth(8).click();
        await expect(page.locator("#grid")).toHaveAttribute("data-view", "months");
        await expect(page.locator("#label")).toHaveText("2027");
    });

    test("prev/next button strides by view unit (month/year/decade)", async ({ page }) => {
        // days view -> +1 month
        await page.click("#next");
        await expect(page.locator("#label")).toContainText("July");

        // months view -> +1 year
        await page.click("#label");   // -> months
        await expect(page.locator("#label")).toHaveText("2026");
        await page.click("#next");
        await expect(page.locator("#label")).toHaveText("2027");

        // years view -> +1 decade
        await page.click("#label");   // -> years
        await page.click("#next");
        // 2027 is in the 2020-2029 decade; +1 decade -> 2030-2039
        await expect(page.locator("#label")).toHaveText("2030 – 2039");
    });
});
