// @zakkster/lite-headless / time-picker / element.js
//
// <lite-time-picker> wrapping createTimePicker.
//
//   <lite-time-picker value="13:30" hour12="false" aria-label="Meeting time">
//       <span data-hour-segment></span>
//       <span data-minute-segment></span>
//       <span data-meridiem-segment></span>   <!-- only used in 12h mode -->
//   </lite-time-picker>
//
// Attributes:
//   value           "HH:MM" (24-hour); default 00:00
//   hour12          "true" | "false"; default locale-derived (Intl)
//   minute-step     integer >= 1; default 1
//   aria-label      group label
//
// Imperative API on host:
//   host.value       (getter) -> { hour, minute }
//   host.setValue({ hour, minute })
//
// Events:
//   valuechange      { detail: { value: { hour, minute }, reason } }

import { define } from "@zakkster/lite-element";
import { createTimePicker } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function _parseValueAttr(v) {
    if (!v || typeof v !== "string") return { hour: 0, minute: 0 };
    const m = /^(\d{1,2}):(\d{1,2})$/.exec(v.trim());
    if (!m) return { hour: 0, minute: 0 };
    return { hour: +m[1], minute: +m[2] };
}

function _scopedFirst(host, sel) {
    const all = host.querySelectorAll(sel);
    for (let i = 0; i < all.length; i++) {
        if (belongsToHost(all[i], host)) return all[i];
    }
    return null;
}

define("lite-time-picker", (host, scope) => {
    const hour12Attr = host.getAttribute("hour12");
    const minuteStepAttr = Number(host.getAttribute("minute-step"));
    const ariaLabel = host.getAttribute("aria-label") || "Time";

    const picker = createTimePicker({
        defaultValue: _parseValueAttr(host.getAttribute("value")),
        hour12: hour12Attr === "true" ? true : hour12Attr === "false" ? false : undefined,
        minuteStep: Number.isFinite(minuteStepAttr) && minuteStepAttr >= 1 ? minuteStepAttr : 1,
        ariaLabel,
        onValueChange: (value, reason) => {
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail: { value, reason }, bubbles: true,
            }));
        },
    });

    setAttr(host, "role", "group");
    setAttr(host, "aria-label", ariaLabel);

    const offs = [];
    const hourEl = _scopedFirst(host, "[data-hour-segment]");
    const minuteEl = _scopedFirst(host, "[data-minute-segment]");
    const meridiemEl = _scopedFirst(host, "[data-meridiem-segment]");
    if (hourEl) offs.push(picker.attachHourSegment(hourEl));
    if (minuteEl) offs.push(picker.attachMinuteSegment(minuteEl));
    if (meridiemEl && picker.hour12) offs.push(picker.attachMeridiem(meridiemEl));

    host.setValue = (v) => picker.setValue(v);
    Object.defineProperty(host, "value", { get: () => picker.value(), configurable: true });

    scope.onCleanup(() => {
        for (const off of offs) off();
        host.removeAttribute("role");
        host.removeAttribute("aria-label");
        picker.destroy();
    });
});

function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
