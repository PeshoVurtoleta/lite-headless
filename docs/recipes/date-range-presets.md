# Recipe: date-range presets (buttons -> setValue)

> G-05. A row of preset buttons ("Today", "Last 7 days", "This month") that
> drive a range `createDatePicker` via `setValue`. No new primitive -- presets
> are just buttons computing a `[start, end]` pair.

## Datepicker in range mode

```js
import { createDatePicker } from "@zakkster/lite-headless/datepicker";

const picker = createDatePicker({
    mode: "range",
    onValueChange: (value, reason) => {
        // value is [start, end]; reason is "select" | "api" | "attribute" | ...
        console.log("range ->", value, reason);
    },
});
picker.attachGrid(document.querySelector("[data-grid]"));
picker.attachMonthLabel(document.querySelector("[data-month-label]"));
picker.attachPrevMonth(document.querySelector("[data-prev]"));
picker.attachNextMonth(document.querySelector("[data-next]"));
```

## Preset math (local midnight, no timezone drift)

```js
function atMidnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d, n) {
    const x = atMidnight(d);
    x.setDate(x.getDate() + n);
    return x;
}

const PRESETS = {
    today() {
        const t = atMidnight(new Date());
        return [t, t];
    },
    last7() {
        const end = atMidnight(new Date());
        return [addDays(end, -6), end];
    },
    thisMonth() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return [start, end];
    },
};
```

## Wire the buttons

```js
for (const btn of document.querySelectorAll("[data-preset]")) {
    btn.addEventListener("click", () => {
        const preset = PRESETS[btn.dataset.preset];
        if (preset) picker.setValue(preset(), "preset");
    });
}
```

The `reason` string ("preset") flows through `onValueChange`, so analytics /
form state can distinguish a preset click from a manual grid selection. Setting
the value also moves the visible month to the range start, so "This month"
lands the grid where the selection is.
