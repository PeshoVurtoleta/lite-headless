// @zakkster/lite-headless / _overlay / aria.js
//
// Tiny ARIA helpers. Module-scope id counter (process-global is fine; ids only
// need to be unique within a document, but we generate per-call so collisions
// across documents/iframes are impossible too).

let _id = 0;

export function uniqueId(prefix = "lh") {
    _id = (_id + 1) | 0;
    return prefix + "-" + _id;
}

/**
 * Set or remove an attribute based on a value, with a dirty-check that
 * skips the write when the DOM already holds the desired state.
 *
 *   null / undefined / false  -> removeAttribute (if currently present)
 *   true                      -> setAttribute(name, "")
 *   anything else             -> setAttribute(name, String(value))
 *
 * The dirty-check pays for itself any time setAttr appears in a paint
 * effect that fires on many signals (datepicker grid, slider value,
 * tab indicator). One `hasAttribute` / `getAttribute` read is cheaper
 * than the setAttribute write barrier + style invalidation + any
 * MutationObserver callbacks fired by the platform. For one-shot
 * setup paths (attach), the read is a noise-level cost.
 */
export function setAttr(el, name, value) {
    if (value === null || value === undefined || value === false) {
        if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (value === true) {
        if (el.getAttribute(name) !== "") el.setAttribute(name, "");
    } else {
        const s = typeof value === "string" ? value : String(value);
        if (el.getAttribute(name) !== s) el.setAttribute(name, s);
    }
}

/**
 * Boolean-attribute helper with dirty-check. For "present-or-absent" data
 * attributes (data-selected, data-disabled, data-outside-month, etc.)
 * where the attribute either exists with value "" or is absent entirely.
 *
 * The dirty-check via `hasAttribute` is the critical perf shape -- in
 * paint loops over N cells, the steady-state case is "no change since
 * last frame", and skipping the setAttribute/removeAttribute call avoids
 * a DOM-write barrier per cell. For a datepicker grid (42 cells)
 * hovering over a range, this can drop per-frame writes from ~420 to
 * 1-2 (only the cells that actually transitioned).
 *
 *   toggleAttr(cell, "data-selected", isSelected);
 *
 * Equivalent to but cheaper than:
 *   if (isSelected) cell.setAttribute("data-selected", "");
 *   else            cell.removeAttribute("data-selected");
 *
 * because hasAttribute returns a cached lookup whereas setAttribute /
 * removeAttribute invalidates style + may trigger MutationObserver.
 */
export function toggleAttr(el, name, on) {
    const has = el.hasAttribute(name);
    if (on && !has) el.setAttribute(name, "");
    else if (!on && has) el.removeAttribute(name);
}

/**
 * Ensure an element has an id; if not, assign a generated one with `prefix`.
 * Returns the id (newly assigned or pre-existing).
 */
export function ensureId(el, prefix = "lh") {
    let id = el.getAttribute("id");
    if (!id) {
        id = uniqueId(prefix);
        el.setAttribute("id", id);
    }
    return id;
}

// ---- IDREF-list helpers ---------------------------------------------------
//
// Several ARIA attributes are space-separated lists of element IDs:
//   aria-controls, aria-describedby, aria-details, aria-flowto,
//   aria-labelledby, aria-owns
//
// Consumers can have their own values in these attributes (e.g., an input that
// already points aria-describedby at an error/helper message). Overlay
// primitives MUST add their own id without clobbering existing tokens, and
// remove only their own id on cleanup.
//
// Both functions are idempotent: addIdToken twice -> only one entry;
// removeIdToken on an absent token -> no-op.
//
// PERF: ARIA toggling is bounded by open/close transitions (not a render-loop
// hazard), but we still avoid `.split(/\s+/).filter(Boolean)` -- that
// allocates a RegExp, two arrays, and a slew of substrings per call. The
// indexOf-based search walks the string character-by-character with no
// intermediate allocations, and only allocates the final assembled string
// for the setAttribute write (unavoidable).

export function addIdToken(el, attr, id) {
    if (!el || !id) return;
    const current = el.getAttribute(attr);
    if (!current) {
        el.setAttribute(attr, id);
        return;
    }
    if (hasToken(current, id)) return;          // already present
    // Append separated by single space. Trim trailing whitespace if any
    // (input strings from external code may have it).
    const trimmed = trimTrailingWs(current);
    el.setAttribute(attr, trimmed.length > 0 ? trimmed + " " + id : id);
}

export function removeIdToken(el, attr, id) {
    if (!el || !id) return;
    const current = el.getAttribute(attr);
    if (!current) return;
    const next = removeToken(current, id);
    if (next.length === 0) {
        el.removeAttribute(attr);
    } else if (next !== current) {
        el.setAttribute(attr, next);
    }
    // if next === current then `id` wasn't present and we don't write
}

// ----- low-level token utilities (no allocations except the final result) -

// Return true if `haystack` contains the `needle` token (whitespace-separated).
// Walks the string in one pass without splitting.
function hasToken(haystack, needle) {
    const nLen = needle.length;
    const hLen = haystack.length;
    if (nLen === 0 || hLen < nLen) return false;
    let i = 0;
    while (i < hLen) {
        // skip whitespace
        while (i < hLen && isWs(haystack.charCodeAt(i))) i++;
        if (i >= hLen) return false;
        // measure this token
        let j = i;
        while (j < hLen && !isWs(haystack.charCodeAt(j))) j++;
        // compare without slicing (manual char-by-char to avoid intermediate string)
        if (j - i === nLen) {
            let match = true;
            for (let k = 0; k < nLen; k++) {
                if (haystack.charCodeAt(i + k) !== needle.charCodeAt(k)) { match = false; break; }
            }
            if (match) return true;
        }
        i = j;
    }
    return false;
}

// Remove the `needle` token from `haystack`, returning a new string. Returns
// the original string by reference if `needle` wasn't present (so callers can
// detect "nothing to do" via identity check). Collapses adjacent whitespace
// left behind by the removal.
function removeToken(haystack, needle) {
    const nLen = needle.length;
    const hLen = haystack.length;
    if (nLen === 0 || hLen === 0) return haystack;

    // First pass: locate the token. If not found, return haystack untouched
    // (caller does identity check to skip the setAttribute write).
    let tokenStart = -1, tokenEnd = -1;
    let i = 0;
    while (i < hLen) {
        while (i < hLen && isWs(haystack.charCodeAt(i))) i++;
        if (i >= hLen) break;
        let j = i;
        while (j < hLen && !isWs(haystack.charCodeAt(j))) j++;
        if (j - i === nLen) {
            let match = true;
            for (let k = 0; k < nLen; k++) {
                if (haystack.charCodeAt(i + k) !== needle.charCodeAt(k)) { match = false; break; }
            }
            if (match) { tokenStart = i; tokenEnd = j; break; }
        }
        i = j;
    }
    if (tokenStart === -1) return haystack;

    // Build result: chars before token + chars after token, with one
    // separating space if both sides have content.
    // Two slice + concat is fine -- ONE allocation total (the result string).
    let before = tokenStart > 0 ? haystack.slice(0, tokenStart) : "";
    let after  = tokenEnd < hLen ? haystack.slice(tokenEnd) : "";
    before = trimTrailingWs(before);
    after  = trimLeadingWs(after);
    if (before.length === 0) return trimLeadingWs(after);
    if (after.length === 0)  return trimTrailingWs(before);
    return before + " " + after;
}

function trimTrailingWs(s) {
    let n = s.length;
    while (n > 0 && isWs(s.charCodeAt(n - 1))) n--;
    return n === s.length ? s : s.slice(0, n);
}

function trimLeadingWs(s) {
    let i = 0;
    const n = s.length;
    while (i < n && isWs(s.charCodeAt(i))) i++;
    return i === 0 ? s : s.slice(i);
}

function isWs(c) {
    // ASCII whitespace per HTML spec: space, tab, LF, CR, FF
    return c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
}
