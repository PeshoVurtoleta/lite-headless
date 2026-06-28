// @zakkster/lite-headless / command-palette / element.js
//
// <lite-command-palette> custom element wrapping createCommandPalette.
//
// Markup contract:
//
//   <lite-command-palette trigger-key="Cmd+K" max-results="50">
//       <!-- consumer's modal markup -->
//       <input data-cmd-input placeholder="Type a command..." />
//       <ul data-cmd-list></ul>
//       <div data-cmd-empty>No commands</div>
//   </lite-command-palette>
//
// Imperative API exposed on the host:
//
//   host.register(cmd | cmd[])
//   host.unregister(id)
//   host.clear()
//   host.open() / host.close() / host.toggle()
//   host.setQuery(q)
//   host.commands -> Command[]
//   host.isOpen -> boolean
//   host.query -> string
//   host.results -> Result[]   ({ id, cmd, score, matches })
//
// Reactive render: the wrapper does NOT render <li> items for you.
// The consumer subscribes to host.addEventListener("resultschange") and
// renders into the [data-cmd-list] element. The wrapper then marks
// each rendered item via the primitive's markItem() helper so click +
// active-state painting work.
//
// Attribute -> option mapping:
//   trigger-key       -> triggerKey ("Cmd+K", "Cmd+Shift+P", "Ctrl+/", "none")
//   max-results       -> maxResults
//   no-fuzzy          -> fuzzy=false
//   no-recent         -> rememberRecent=false
//   recent-limit      -> recentLimit
//
// Dispatched events:
//   openchange     { detail: { open, reason } }
//   select         { detail: { command, source } }
//   querychange    { detail: { query } }
//   resultschange  { detail: { results } }
//   activeindexchange { detail: { index } }

import { define } from "@zakkster/lite-element";
import { createCommandPalette } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

function parseTriggerKey(raw) {
    // Accept "Cmd+K", "Ctrl+K", "Cmd+Shift+P", "none", "" (none),
    // or a JSON object literal. Default is { key: "k", meta: true }
    // which matches BOTH Cmd+K (Mac) and Ctrl+K (Win/Linux).
    if (!raw || raw === "none") return null;
    // Try JSON first
    if (raw.trim().startsWith("{")) {
        try { return JSON.parse(raw); } catch { /* fall through */ }
    }
    const parts = raw.split(/\s*\+\s*/).map(p => p.trim());
    const out = { key: "", meta: false, shift: false, alt: false };
    for (const p of parts) {
        const lower = p.toLowerCase();
        if (lower === "cmd" || lower === "ctrl" || lower === "meta") out.meta = true;
        else if (lower === "shift") out.shift = true;
        else if (lower === "alt" || lower === "option") out.alt = true;
        else out.key = p;
    }
    return out.key ? out : null;
}

function parseIntAttr(raw, fallback) {
    if (raw == null) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

define("lite-command-palette", (host, scope) => {
    const triggerKey = parseTriggerKey(host.getAttribute("trigger-key") || "Cmd+K");
    const maxResults = parseIntAttr(host.getAttribute("max-results"), 50);
    const fuzzy      = !host.hasAttribute("no-fuzzy");
    const rememberRecent = !host.hasAttribute("no-recent");
    const recentLimit = parseIntAttr(host.getAttribute("recent-limit"), 10);

    const palette = createCommandPalette({
        triggerKey, maxResults, fuzzy, rememberRecent, recentLimit,
        onSelect: (cmd, source) => {
            host.dispatchEvent(new CustomEvent("select", {
                detail: { command: cmd, source }, bubbles: true,
            }));
        },
        onOpenChange: (isOpen, reason) => {
            host.dispatchEvent(new CustomEvent("openchange", {
                detail: { open: isOpen, reason }, bubbles: true,
            }));
        },
        onQueryChange: (q) => {
            host.dispatchEvent(new CustomEvent("querychange", {
                detail: { query: q }, bubbles: true,
            }));
        },
        onResultsChange: (results) => {
            host.dispatchEvent(new CustomEvent("resultschange", {
                detail: { results }, bubbles: true,
            }));
        },
        onActiveIndexChange: (idx) => {
            host.dispatchEvent(new CustomEvent("activeindexchange", {
                detail: { index: idx }, bubbles: true,
            }));
        },
    });

    // Role observer — when children with data-cmd-input / data-cmd-list /
    // data-cmd-empty appear (initial render OR re-render), attach them.
    // scopedQuery prevents an outer command-palette from claiming an
    // inner one's slots.
    const _attached = { input: null, list: null, empty: null };
    function syncRoles() {
        const input = scopedQuery(host, "[data-cmd-input]");
        const list  = scopedQuery(host, "[data-cmd-list]");
        const empty = scopedQuery(host, "[data-cmd-empty]");
        if (input && _attached.input !== input) {
            palette.attachInput(input);
            _attached.input = input;
        }
        if (list && _attached.list !== list) {
            palette.attachList(list);
            _attached.list = list;
        }
        if (empty && _attached.empty !== empty) {
            palette.attachEmpty(empty);
            _attached.empty = empty;
        }
    }
    syncRoles();
    const mo = new MutationObserver(syncRoles);
    mo.observe(host, { childList: true, subtree: true });

    // Expose imperative API on the host
    host._cmdPaletteInstance = palette;
    host.register     = (c) => palette.register(c);
    host.unregister   = (id) => palette.unregister(id);
    host.clear        = () => palette.clear();
    host.clearRecents = () => palette.clearRecents();
    host.open         = (reason) => palette.open(reason);
    host.close        = (reason) => palette.close(reason);
    host.toggle       = (reason) => palette.toggle(reason);
    host.setQuery     = (q) => palette.setQuery(q);
    host.invoke       = (id, source) => palette.invoke(id, source);
    host.invokeActive = (source) => palette.invokeActive(source);
    host.markItem     = (el, id, idx) => palette.markItem(el, id, idx);
    host.next         = () => palette.next();
    host.prev         = () => palette.prev();
    host.setActive    = (i) => palette.setActive(i);

    Object.defineProperty(host, "commands",   { get: () => palette.commands(), configurable: true });
    Object.defineProperty(host, "recents",    { get: () => palette.recents(),  configurable: true });
    Object.defineProperty(host, "isOpen",     { get: () => palette.isOpen(),  configurable: true });
    Object.defineProperty(host, "query",      { get: () => palette.query(),   configurable: true });
    Object.defineProperty(host, "results",    { get: () => palette.results(), configurable: true });
    Object.defineProperty(host, "activeIndex",{ get: () => palette.activeIndex(), configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        palette.destroy();
    });
});
