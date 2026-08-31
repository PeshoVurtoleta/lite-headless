// @zakkster/lite-headless / src/_validate.js
//
// Shared construction-time option validator for every public createXxx
// factory. Fails closed: an unknown option key is a TypeError with a
// did-you-mean hint, never a silent ignore. null and non-objects are
// rejected; no-arg / undefined stays legal.
//
// This runs ONCE per factory call, at construction. It is never on a hot
// path (frame loop, pointer handler). The success path is allocation-free
// apart from the single Object.keys array; suggest() -- the two-row
// Levenshtein -- is reached only after a key has already failed membership
// and a throw is committed.

const PIPE = 124; // "|"

// Allocation-free membership test: is `key` a whole token in the
// pipe-delimited `keys` string? Bounded indexOf scan with charCode boundary
// checks -- no split, no Set, no array on the success path.
function hasKey(keys, key) {
    const klen = key.length;
    if (klen === 0) return false;
    let idx = keys.indexOf(key);
    while (idx !== -1) {
        const before = idx === 0 || keys.charCodeAt(idx - 1) === PIPE;
        const afterPos = idx + klen;
        const after = afterPos === keys.length || keys.charCodeAt(afterPos) === PIPE;
        // A legal token never contains the delimiter. A composite like
        // "min|max" can satisfy the boundary checks by spanning two adjacent
        // tokens -- reject it so it flows into the normal unknown-key throw.
        if (before && after) return key.indexOf("|") === -1;
        idx = keys.indexOf(key, idx + 1);
    }
    return false;
}

// Two-row Levenshtein. Cold path only.
function distance(a, b) {
    const al = a.length;
    const bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    let prev = new Array(bl + 1);
    let curr = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;
    for (let i = 1; i <= al; i++) {
        curr[0] = i;
        const ac = a.charCodeAt(i - 1);
        for (let j = 1; j <= bl; j++) {
            const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
            let m = prev[j] + 1;
            const del = curr[j - 1] + 1;
            if (del < m) m = del;
            const sub = prev[j - 1] + cost;
            if (sub < m) m = sub;
            curr[j] = m;
        }
        const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[bl];
}

// Best did-you-mean candidate within threshold, or null. Declaration order
// wins ties (replace only on strictly-lower distance). Cold path only.
function suggest(keys, key) {
    const threshold = key.length <= 4 ? 1 : 2;
    let best = null;
    let bestDist = threshold + 1;
    let start = 0;
    const len = keys.length;
    for (let i = 0; i <= len; i++) {
        if (i === len || keys.charCodeAt(i) === PIPE) {
            const cand = keys.slice(start, i);
            const d = distance(key, cand);
            if (d <= threshold && d < bestDist) {
                bestDist = d;
                best = cand;
            }
            start = i + 1;
        }
    }
    return best;
}

export function checkOptions(fnName, options, knownKeys) {
    if (options === undefined) return;
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
        const desc = options === null ? "null"
            : Array.isArray(options) ? "array"
            : typeof options;
        throw new TypeError(`${fnName}: options must be a plain object, got ${desc}`);
    }
    // Object.keys (own enumerable string keys only) -- never for...in, which
    // would walk the prototype chain and treat inherited keys as options.
    const ks = Object.keys(options);
    for (let i = 0; i < ks.length; i++) {
        const key = ks[i];
        if (hasKey(knownKeys, key)) continue;
        // A factory that reads no construction options has an empty key list;
        // there is nothing to suggest and no options to enumerate.
        if (knownKeys === "") {
            throw new TypeError(`${fnName}: unknown option "${key}". This factory takes no options.`);
        }
        const best = suggest(knownKeys, key);
        if (best !== null) {
            throw new TypeError(`${fnName}: unknown option "${key}". Did you mean "${best}"?`);
        }
        throw new TypeError(`${fnName}: unknown option "${key}". Known options: ${knownKeys.split("|").join(", ")}`);
    }
}

// Cross-primitive option-key seam. A shared option-key list needed by more
// than one primitive lives here, in the private validator module, and is never
// reachable through an exports subpath (see ADR 0002). dialog and alert-dialog
// validate against the identical option surface; the pipe-delimited string is
// an encoding private to checkOptions, not a public contract.
export const DIALOG_OPTION_KEYS = "open|defaultOpen|onOpenChange|modal|closeOnEscape|closeOnOutsideClick|initialFocus|finalFocus|placement|role|container|transition|labelledBy|describedBy";

// Positioner factory validation, at construction. `undefined` is legal -- the
// factory falls back to the built-in positioning engine. Anything that is not
// a function fails closed: null, an object, a string are all rejected here,
// naming the factory and the received type, in the same diction as
// checkOptions ("got <desc>").
export function checkPositioner(fnName, value) {
    if (value === undefined) return;
    if (typeof value !== "function") {
        const desc = value === null ? "null"
            : Array.isArray(value) ? "array"
            : typeof value;
        throw new TypeError(`${fnName}: positioner must be a function, got ${desc}`);
    }
}

// The HANDLE a positioner factory returns must expose update / autoUpdate /
// destroy. Checked once, at first open (never per tick). Fails closed naming
// the first missing method so a malformed custom engine surfaces immediately
// instead of throwing deep inside an open/close cycle.
export function checkPositionerHandle(fnName, handle) {
    if (handle === null || typeof handle !== "object") {
        const desc = handle === null ? "null"
            : Array.isArray(handle) ? "array"
            : typeof handle;
        throw new TypeError(`${fnName}: positioner must return a handle object, got ${desc}`);
    }
    if (typeof handle.update !== "function") {
        throw new TypeError(`${fnName}: positioner handle is missing "update"`);
    }
    if (typeof handle.autoUpdate !== "function") {
        throw new TypeError(`${fnName}: positioner handle is missing "autoUpdate"`);
    }
    if (typeof handle.destroy !== "function") {
        throw new TypeError(`${fnName}: positioner handle is missing "destroy"`);
    }
}
