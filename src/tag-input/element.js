// @zakkster/lite-headless / tag-input / element.js
//
// <lite-tag-input> wrapping createTagInput. Renders descendant
// `[data-tag-input-slot]` as the input field, watches for any element
// carrying `[data-tag-list]` and reactively renders tag chips into it.
//
//   <lite-tag-input max-items="8" allow-duplicates="false" aria-label="Categories">
//       <div data-tag-list></div>
//       <input data-tag-input-slot placeholder="Add a tag...">
//   </lite-tag-input>
//
// Each rendered chip carries `data-tag-index="i"` and gets
// `data-tag-active="true"` when activeIndex() === i. Chips have a built-in
// `<button data-tag-remove>` for the X-to-remove pattern.
//
// Reactive attrs (read once on attach):
//   length / max-items     1..256, default Infinity
//   allow-duplicates       boolean
//   aria-label             root group label
//   delimiters             comma-separated list e.g. "Enter,Tab,,"
//                          (note: the literal "," delimiter is escaped by
//                          using a trailing empty segment; or pass via JS)
//
// Imperative API on host: see createTagInput.
//
// Events:
//   change   { tags: string[] }
//   add      { tag: string }
//   remove   { tag: string, index: number }
//   invalid  { tag: string, reason: string }

import { define } from "@zakkster/lite-element";
import { effect } from "@zakkster/lite-signal";
import { createTagInput } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-tag-input", (host, scope) => {
    const maxItems = (() => {
        const a = host.getAttribute("max-items") || host.getAttribute("length");
        if (!a) return Infinity;
        const n = Number(a);
        return Number.isFinite(n) && n > 0 ? Math.min(256, Math.floor(n)) : Infinity;
    })();
    const allowDuplicates = host.getAttribute("allow-duplicates") === "true";
    const ariaLabel = host.getAttribute("aria-label") || "Tags";

    const tagInput = createTagInput({
        maxItems,
        allowDuplicates,
        ariaLabel,
        onChange: (tags) => {
            host.dispatchEvent(new CustomEvent("change", { detail: { tags }, bubbles: true }));
        },
        onAdd: (tag) => {
            host.dispatchEvent(new CustomEvent("add", { detail: { tag }, bubbles: true }));
        },
        onRemove: (tag, index) => {
            host.dispatchEvent(new CustomEvent("remove", { detail: { tag, index }, bubbles: true }));
        },
        onInvalid: (tag, reason) => {
            host.dispatchEvent(new CustomEvent("invalid", { detail: { tag, reason }, bubbles: true }));
        },
    });

    tagInput.attachRoot(host);

    // Auto-attach the input slot. There should be exactly one
    // [data-tag-input-slot] descendant; if more exist we use the first
    // and ignore the rest.
    let _attachedInput = null;
    let _attachedInputOff = null;
    function syncInput() {
        const slot = scopedQuery(host, "[data-tag-input-slot]");
        if (slot === _attachedInput) return;
        if (_attachedInputOff) _attachedInputOff();
        if (slot) {
            _attachedInputOff = tagInput.attachInput(slot);
            _attachedInput = slot;
        } else {
            _attachedInputOff = null;
            _attachedInput = null;
        }
    }
    syncInput();

    // Render tag chips into [data-tag-list]. We watch for the container
    // appearing (template hydration) AND for tags()/activeIndex() changes,
    // and minimally diff: only update chips whose tag string or active
    // state changed.
    let _listEl = null;
    function syncListContainer() {
        const next = scopedQuery(host, "[data-tag-list]");
        if (next !== _listEl) _listEl = next;
    }
    syncListContainer();

    // Per-chip element cache. _idx + _active cache the last-painted
    // values so a no-op paint (the common case once chips are stable)
    // produces zero DOM writes and zero String() allocations -- the
    // raw `setAttribute("data-tag-index", String(i))` ran every frame
    // before, which mattered for tag lists with frequent re-renders.
    const _chips = [];   // [{ el, label, removeBtn, tag, _idx, _active }]

    const stopChipPaint = effect(() => {
        const tags = tagInput.tags();
        const active = tagInput.activeIndex();
        if (!_listEl) return;
        // Grow / shrink chip pool to match tag count.
        while (_chips.length > tags.length) {
            const rec = _chips.pop();
            rec.el.remove();
        }
        while (_chips.length < tags.length) {
            const el = document.createElement("span");
            el.className = "lite-tag-chip";
            el.setAttribute("data-tag-chip", "");
            const label = document.createElement("span");
            label.className = "lite-tag-chip-label";
            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "lite-tag-chip-remove";
            removeBtn.setAttribute("data-tag-remove", "");
            removeBtn.setAttribute("aria-label", "Remove tag");
            removeBtn.textContent = "\u00d7";
            el.appendChild(label);
            el.appendChild(removeBtn);
            // Find this chip's current index at click time. _chips is
            // small in practice (chip inputs cap at dozens, not
            // thousands) so the O(N) indexOf walk is fine.
            removeBtn.addEventListener("click", (ev) => {
                ev.preventDefault();
                const idx = _chips.indexOf(rec);
                if (idx >= 0) tagInput.removeTag(idx);
            });
            const rec = { el, label, removeBtn, tag: "", _idx: -1, _active: false };
            _chips.push(rec);
            _listEl.appendChild(el);
        }
        // Update each chip only where its painted state diverges from
        // its current state.
        for (let i = 0; i < tags.length; i++) {
            const rec = _chips[i];
            const t = tags[i];
            if (rec.tag !== t) { rec.label.textContent = t; rec.tag = t; }
            if (rec._idx !== i) {
                rec.el.setAttribute("data-tag-index", String(i));
                rec._idx = i;
            }
            const isActive = i === active;
            if (rec._active !== isActive) {
                if (isActive) rec.el.setAttribute("data-tag-active", "true");
                else          rec.el.removeAttribute("data-tag-active");
                rec._active = isActive;
            }
        }
    });

    const mo = new MutationObserver(() => {
        syncInput();
        syncListContainer();
    });
    mo.observe(host, { childList: true, subtree: true });

    // Imperative surface
    host._tagInputInstance = tagInput;
    host.addTag        = (s) => tagInput.addTag(s);
    host.removeTag     = (i) => tagInput.removeTag(i);
    host.removeLast    = () => tagInput.removeLast();
    host.clear         = () => tagInput.clear();
    host.setTags       = (a) => tagInput.setTags(a);
    host.focusInput    = () => tagInput.focusInput();
    host.setActiveIndex = (i) => tagInput.setActiveIndex(i);
    Object.defineProperty(host, "tags",        { get: () => tagInput.tags(),        configurable: true });
    Object.defineProperty(host, "count",       { get: () => tagInput.count(),       configurable: true });
    Object.defineProperty(host, "canAddMore",  { get: () => tagInput.canAddMore(),  configurable: true });
    Object.defineProperty(host, "activeIndex", { get: () => tagInput.activeIndex(), configurable: true });
    Object.defineProperty(host, "inputValue",  { get: () => tagInput.inputValue(),  configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        stopChipPaint();
        for (const rec of _chips) rec.el.remove();
        _chips.length = 0;
        if (_attachedInputOff) _attachedInputOff();
        tagInput.destroy();
    });
});
