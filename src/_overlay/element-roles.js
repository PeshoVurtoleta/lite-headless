// @zakkster/lite-headless / _overlay / element-roles.js
//
// Shared role-observer helper for the <lite-*> custom-element wrappers.
//
// PROBLEM. Every primitive (dialog/popover/tooltip/menu/combobox/datepicker)
// wires role-specific elements via attach* methods at custom-element mount.
// The naive `host.querySelectorAll("[data-trigger]")` is one-shot: anything
// the consumer's framework injects later -- async forms in a dialog, paginated
// items in a combobox, lazy-loaded popover content -- is invisible to the
// primitive.
//
// SOLUTION. Each wrapper supplies a `wireFn(node)` that returns a teardown
// closure or null. The helper:
//   1. WeakMap from element -> teardown (no leak if framework rips nodes out)
//   2. Initial scan: host itself + every descendant matching `roleSelector`
//   3. MutationObserver on the host (childList + subtree); routes added
//      nodes through `wireFn`, calls teardown on removed nodes
//
// NESTED PRIMITIVES. A `<lite-popover>` inside a `<lite-dialog>` should NOT
// have its [data-trigger] stolen by the outer dialog. When `skipNested` is
// true (default), the helper checks each node's closest `lite-*` ancestor
// before the host; if any such ancestor exists between the node and the
// host, the node belongs to that nested primitive and we leave it alone.
//
// PERFORMANCE. MutationObserver callbacks are async-batched by the browser;
// per-mutation allocations are bounded by user-driven DOM events, not by
// scroll/resize ticks. Acceptable.

export function createRoleObserver(host, roleSelector, wireFn, options) {
    const skipNested = !options || options.skipNested !== false;
    const cleanups = new WeakMap();

    function mount(node) {
        if (!node || node.nodeType !== 1) return;
        if (cleanups.has(node)) return;
        if (skipNested && !belongsToHost(node, host)) return;
        const off = wireFn(node);
        if (off) cleanups.set(node, off);
    }

    function unmount(node) {
        if (!node || node.nodeType !== 1) return;
        const off = cleanups.get(node);
        if (off) {
            try { off(); } catch { /* swallow */ }
            cleanups.delete(node);
        }
    }

    function scanAndMount(root) {
        if (!root || root.nodeType !== 1) return;
        mount(root);
        if (root.querySelectorAll) {
            const matches = root.querySelectorAll(roleSelector);
            for (let i = 0; i < matches.length; i++) mount(matches[i]);
        }
    }

    function scanAndUnmount(root) {
        if (!root || root.nodeType !== 1) return;
        // PORTAL GUARD: if this element is currently followed, it just
        // moved (portaled) -- the wrapper still wants it wired. The
        // follower observer remains attached and will handle subtree
        // mutations regardless of where the element lives now. Final
        // teardown happens through `disconnect()` at host destroy.
        if (followers.has(root)) return;
        unmount(root);
        if (root.querySelectorAll) {
            const matches = root.querySelectorAll(roleSelector);
            for (let i = 0; i < matches.length; i++) {
                if (followers.has(matches[i])) continue;
                unmount(matches[i]);
            }
        }
    }

    // The initial scan is deferred to the caller via `rescan()` so wireFn
    // can reference the returned handle (specifically `follow`/`unfollow`)
    // when the first scan runs. If we scanned synchronously here, `roles`
    // in the caller's `const roles = createRoleObserver(...)` would still
    // be undefined when wire() executes for the initial nodes.

    // Future mutations. We observe the host AND any element passed to
    // `follow(el)` -- the latter is the escape hatch for primitives that
    // portal their content to document.body (dialog modal, popover, menu).
    // Once portaled, mutations inside that content are no longer descendants
    // of the host; observing the content element directly catches them
    // regardless of where it lives in the DOM.
    const followers = new Map();   // el -> MutationObserver
    let mainObserver = null;

    function callback(muts) {
        for (let i = 0; i < muts.length; i++) {
            const mut = muts[i];
            const added = mut.addedNodes;
            const removed = mut.removedNodes;
            for (let j = 0; j < added.length; j++) scanAndMount(added[j]);
            for (let j = 0; j < removed.length; j++) scanAndUnmount(removed[j]);
        }
    }

    if (typeof MutationObserver !== "undefined") {
        mainObserver = new MutationObserver(callback);
        mainObserver.observe(host, { childList: true, subtree: true });
    }

    function follow(el) {
        if (!el || el.nodeType !== 1 || followers.has(el) || typeof MutationObserver === "undefined") return;
        const obs = new MutationObserver(callback);
        obs.observe(el, { childList: true, subtree: true });
        followers.set(el, obs);
        // Sweep what's already in there in case nodes were added during the
        // race between attach and follow().
        scanAndMount(el);
    }

    function unfollow(el) {
        const obs = followers.get(el);
        if (obs) { obs.disconnect(); followers.delete(el); }
    }

    return {
        // Caller MUST invoke this once after the const has been assigned, so
        // that wireFn can reference the handle (e.g. `roles.follow(node)`).
        rescan: () => scanAndMount(host),
        follow,
        unfollow,
        disconnect: () => {
            if (mainObserver) mainObserver.disconnect();
            for (const obs of followers.values()) obs.disconnect();
            followers.clear();
        },
    };
}

// True if `node`'s nearest `lite-*` ancestor is `host` itself (i.e., the node
// is NOT inside a nested primitive's subtree).
//
// Exported so leaf wrappers (skeleton, file-upload, inline-edit, etc.) that
// don't need the full role-observer machinery can still enforce light-DOM
// scope boundaries with a single closure-free function call.
//
// Implementation note: we compare the tag name's first 5 characters via
// charCodeAt rather than `tag.startsWith("LITE-")` to avoid the substring
// allocation that startsWith on small strings can incur in some engines.
export function belongsToHost(node, host) {
    let p = node === host ? null : node.parentElement;
    while (p && p !== host) {
        const tag = p.tagName;
        // tag is upper-cased by the platform; "LITE-" prefix is our marker
        if (tag && tag.length > 5 && tag.charCodeAt(0) === 76 /* L */
                                  && tag.charCodeAt(1) === 73 /* I */
                                  && tag.charCodeAt(2) === 84 /* T */
                                  && tag.charCodeAt(3) === 69 /* E */
                                  && tag.charCodeAt(4) === 45 /* - */) {
            return false;
        }
        p = p.parentElement;
    }
    return true;
}
