// @zakkster/lite-headless / stepper / element.js
//
// <lite-stepper min="0" max="100" step="1" value="50" large-step="10">
//   <button data-decrement>−</button>
//   <input data-input>
//   <button data-increment>+</button>
// </lite-stepper>
//
// Or display-only:
//
// <lite-stepper min="0" max="9" step="1" value="3">
//   <button data-decrement>−</button>
//   <output data-readout></output>
//   <button data-increment>+</button>
// </lite-stepper>
//
// The wrapper resolves [data-input], [data-readout], [data-increment],
// [data-decrement] children via the shared createRoleObserver helper so
// dynamically-injected controls attach automatically.
//
// Attribute -> option mapping:
//   value           -> defaultValue + reactive sync via useAttr
//   min, max, step  -> initial value + reactive sync via useAttr (v0.7.11)
//   large-step      -> largeStep
//   precision       -> precision
//   locale          -> locale
//   disabled        -> setDisabled(...) reactively from the attribute
//   select-on-focus -> selectOnFocus
//   formatter       -> NOT exposed (function, not string)
//   parser          -> NOT exposed (function, not string)
//
// Dispatches CustomEvent('valuechange', { detail: { value, reason } })
// when the underlying value changes.

import { define } from "@zakkster/lite-element";
import { effect } from "@zakkster/lite-signal";
import { createStepper } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-input],[data-readout],[data-increment],[data-decrement]";

function parseNum(attr, fallback) {
    if (attr == null) return fallback;
    const n = parseFloat(attr);
    return Number.isFinite(n) ? n : fallback;
}

define("lite-stepper", (host, scope) => {
    const min       = parseNum(host.getAttribute("min"), -Infinity);
    const max       = parseNum(host.getAttribute("max"),  Infinity);
    const step      = parseNum(host.getAttribute("step"), 1);
    const largeStep = parseNum(host.getAttribute("large-step"), 10);
    const precisionAttr = host.getAttribute("precision");
    const precision = precisionAttr != null ? parseInt(precisionAttr, 10) : undefined;
    const locale    = host.getAttribute("locale") || undefined;
    const startVal  = parseNum(host.getAttribute("value"), 0);

    const stepper = createStepper({
        defaultValue: startVal,
        min, max, step, largeStep, precision, locale,
        disabled:      host.hasAttribute("disabled"),
        selectOnFocus: host.hasAttribute("select-on-focus"),
        onValueChange: (value, reason) => {
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail: { value, reason }, bubbles: true,
            }));
        },
    });

    // Reactive sync from the host's `value` attribute (controlled-ish
    // mode -- consumer can `el.setAttribute("value", "42")` to drive).
    const valueAttr = scope.useAttr("value");
    let _firstValueRun = true;
    const stopValueAttr = effect(() => {
        const raw = valueAttr();
        if (_firstValueRun) { _firstValueRun = false; return; }
        if (raw == null) return;
        const n = parseFloat(raw);
        if (Number.isFinite(n)) stepper.setValue(n, "attribute");
    });

    // Disabled attribute sync (one-way: attribute -> primitive)
    const disabledAttr = scope.useAttr("disabled");
    let _firstDisabledRun = true;
    const stopDisabledAttr = effect(() => {
        const raw = disabledAttr();
        if (_firstDisabledRun) { _firstDisabledRun = false; return; }
        stepper.setDisabled(raw != null);
    });

    // v0.7.11: reactive min / max / step constraint sync. Closes the
    // "dynamic constraint gap" -- consumers can now re-render
    // <lite-stepper max="N"> with a new N (e.g. inventory dropped) and
    // the primitive will re-normalize the current value against the
    // updated bound. First-run guard skips the initial signal-from-
    // attribute pulse since those values were already baked into the
    // primitive's construction.
    const minAttr  = scope.useAttr("min");
    const maxAttr  = scope.useAttr("max");
    const stepAttr = scope.useAttr("step");
    let _firstMinRun = true, _firstMaxRun = true, _firstStepRun = true;
    const stopMinAttr = effect(() => {
        const raw = minAttr();
        if (_firstMinRun) { _firstMinRun = false; return; }
        stepper.setMin(parseNum(raw, -Infinity));
    });
    const stopMaxAttr = effect(() => {
        const raw = maxAttr();
        if (_firstMaxRun) { _firstMaxRun = false; return; }
        stepper.setMax(parseNum(raw, Infinity));
    });
    const stopStepAttr = effect(() => {
        const raw = stepAttr();
        if (_firstStepRun) { _firstStepRun = false; return; }
        stepper.setStep(parseNum(raw, 1));
    });

    // Role observer for [data-input], [data-readout], [data-increment],
    // [data-decrement]. Follows the same pattern as the other wrappers --
    // each role wires once via the primitive's attach* method; the
    // returned `off` is what the observer calls on element removal.
    let roles;
    roles = createRoleObserver(host, ROLE_SEL, (node) => {
        if      (node.matches("[data-input]"))     return stepper.attachInput(node);
        else if (node.matches("[data-readout]"))   return stepper.attachReadout(node);
        else if (node.matches("[data-increment]")) return stepper.attachIncrement(node);
        else if (node.matches("[data-decrement]")) return stepper.attachDecrement(node);
    });
    roles.rescan();

    // Expose the primitive for programmatic use.
    host._stepperInstance = stepper;
    host.setValue   = (n, reason) => stepper.setValue(n, reason);
    host.increment  = (n) => stepper.increment(n);
    host.decrement  = (n) => stepper.decrement(n);
    // v0.7.11: dynamic constraint setters on the host. setAttribute drives
    // these reactively; the property setters write back to the attribute
    // for consistency (so framework property bindings stay in sync).
    host.setMin  = (n) => { host.setAttribute("min",  String(n)); };
    host.setMax  = (n) => { host.setAttribute("max",  String(n)); };
    host.setStep = (n) => { host.setAttribute("step", String(n)); };
    Object.defineProperty(host, "value", {
        get: () => stepper.value(),
        set: (n) => stepper.setValue(n, "property"),
        configurable: true,
    });
    Object.defineProperty(host, "displayValue", {
        get: () => stepper.displayValue(),
        configurable: true,
    });
    Object.defineProperty(host, "min",  { get: () => stepper.min(),  set: (n) => host.setMin(n),  configurable: true });
    Object.defineProperty(host, "max",  { get: () => stepper.max(),  set: (n) => host.setMax(n),  configurable: true });
    Object.defineProperty(host, "step", { get: () => stepper.step(), set: (n) => host.setStep(n), configurable: true });

    scope.onCleanup(() => {
        stopValueAttr();
        stopDisabledAttr();
        stopMinAttr();
        stopMaxAttr();
        stopStepAttr();
        roles.disconnect();
        stepper.destroy();
    });
}, { observedAttributes: ["value", "disabled", "min", "max", "step"] });
