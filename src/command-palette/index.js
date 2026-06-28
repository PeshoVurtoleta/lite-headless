// @zakkster/lite-headless / command-palette
//
// Headless Cmd+K command palette: a registry of invocable commands
// with fuzzy filtering, ARIA combobox navigation, and a global
// keybinding to toggle visibility. Intended to compose WITH a dialog
// (or popover) -- the palette doesn't duplicate modal/focus-trap
// work; the consumer wires palette.onOpen() to their dialog.open().
//
// ARCHITECTURE
//
// Responsibilities owned by this primitive:
//   - Command registry (register/unregister/clear)
//   - Filtering + ranking (substring with start-of-word boost, then
//     keyword match, then optional fuzzy match)
//   - Global Cmd+K / Ctrl+K listener with input-context awareness
//     (doesn't hijack while user is typing in another input/textarea)
//   - ARIA combobox: aria-activedescendant + role wiring
//   - Keyboard navigation in the result list (ArrowUp/Down, Home/End,
//     Enter to invoke, Escape to close, optional Ctrl+J/K vim-style)
//   - Match-position metadata so the consumer can render highlighted
//     character spans
//
// Responsibilities OUT OF SCOPE (consumer composes with other primitives):
//   - Modal backdrop, focus trap, scroll lock -> use createDialog
//   - Rendering the actual <li> elements per result -> consumer renders
//     into the attached list element based on results() signal
//   - Styling, animations -> consumer CSS
//
// FILTERING
//
// Default scoring (highest wins):
//   - 100 -> exact label match
//   - 95  -> label starts with query (prefix match)
//   - 80-89 -> start-of-word match in label
//   - 50-65 -> substring anywhere in label
//   - 35-45 -> substring match in any keyword
//   - 20-30 -> fuzzy match (every query char appears in order); score
//             higher for tighter matches (lower spread)
//
// Recent commands get a +5 score boost (within their match tier),
// so recently-used items rise to the top of equal-scoring results.

import { signal as makeSignal, effect, untrack } from "@zakkster/lite-signal";

const noop = () => {};
let _idCounter = 0;
const uniqueId = (prefix) => `${prefix}-${++_idCounter}`;
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

// ----- match algorithm ------------------------------------------------
//
// All scoring functions return { score, matches } where matches is an
// array of [startIdx, endIdx] tuples (end-exclusive) indicating which
// label characters matched the query, for consumer rendering.

function exactMatch(text, q) {
    if (text === q) return { score: 100, matches: [[0, text.length]] };
    return null;
}

function prefixMatch(text, q) {
    if (text.startsWith(q)) return { score: 95, matches: [[0, q.length]] };
    return null;
}

function startOfWordMatch(text, q) {
    // Looks for q at the start of any word (after a space/punct).
    let bestIdx = -1;
    for (let i = 1; i < text.length; i++) {
        const prev = text[i - 1];
        if (prev !== " " && prev !== "-" && prev !== "_" && prev !== "/") continue;
        if (text.slice(i, i + q.length) === q) {
            bestIdx = i;
            break;
        }
    }
    if (bestIdx < 0) return null;
    // Higher score for earlier position
    return {
        score: 89 - Math.min(9, Math.floor(bestIdx / 4)),
        matches: [[bestIdx, bestIdx + q.length]],
    };
}

function substringMatch(text, q) {
    const idx = text.indexOf(q);
    if (idx < 0) return null;
    return {
        score: 65 - Math.min(15, Math.floor(idx / 2)),
        matches: [[idx, idx + q.length]],
    };
}

function keywordMatch(keywords, q) {
    if (!keywords) return null;
    for (const kw of keywords) {
        if (kw.toLowerCase().indexOf(q) >= 0) {
            return { score: 45, matches: [] };
        }
    }
    return null;
}

function fuzzyMatch(text, q) {
    // Sublime-style: every query char must appear in `text` in order.
    // Score by tightness (lower spread = higher score).
    let ti = 0, qi = 0;
    const matches = [];
    while (ti < text.length && qi < q.length) {
        if (text[ti] === q[qi]) {
            matches.push(ti);
            qi++;
        }
        ti++;
    }
    if (qi !== q.length) return null;
    const spread = matches[matches.length - 1] - matches[0];
    const tightness = Math.max(0, 10 - Math.floor(spread / q.length));
    // Group consecutive matches into [start, end] ranges
    const ranges = [];
    let rangeStart = matches[0];
    let rangeEnd = matches[0] + 1;
    for (let i = 1; i < matches.length; i++) {
        if (matches[i] === rangeEnd) {
            rangeEnd++;
        } else {
            ranges.push([rangeStart, rangeEnd]);
            rangeStart = matches[i];
            rangeEnd = matches[i] + 1;
        }
    }
    ranges.push([rangeStart, rangeEnd]);
    return { score: 20 + tightness, matches: ranges };
}

function scoreCommand(cmd, query, fuzzy) {
    if (!query) return { score: 1, matches: [] };
    const q = query.toLowerCase();
    const label = cmd.label.toLowerCase();
    return (
        exactMatch(label, q) ||
        prefixMatch(label, q) ||
        startOfWordMatch(label, q) ||
        substringMatch(label, q) ||
        keywordMatch(cmd.keywords, q) ||
        (fuzzy ? fuzzyMatch(label, q) : null) ||
        null
    );
}

// ----- main primitive -------------------------------------------------

export function createCommandPalette(options = {}) {
    const {
        triggerKey      = { key: "k", meta: true },   // Cmd+K / Ctrl+K
        fuzzy           = true,
        maxResults      = 50,
        recentBoost     = 5,
        rememberRecent  = true,
        recentLimit     = 10,
        onSelect,                                      // (cmd) -> ?
        onOpen,
        onClose,
        onOpenChange,                                  // (isOpen) -> ?
        onQueryChange,                                 // (query) -> ?
        onResultsChange,                               // (results) -> ?
        onActiveIndexChange,                           // (idx) -> ?
        invokeOnSelect  = true,                         // default: call cmd.onSelect on Enter/click
    } = options;

    // ----- state -----------------------------------------------------
    const _open       = makeSignal(false);
    const _query      = makeSignal("");
    const _activeIdx  = makeSignal(-1);     // -1 = no active item
    const _commands   = new Map();          // id -> cmd
    const _commandOrder = [];               // insertion order (stable for tie-breaks)
    const _recent     = [];                 // ids, most recent first
    let _destroyed    = false;

    let _inputEl   = null;
    let _listEl    = null;
    let _emptyEl   = null;
    const _detach  = new Map();             // role -> fn

    // ----- command registry -----------------------------------------
    function register(cmd) {
        if (_destroyed) return;
        if (Array.isArray(cmd)) {
            for (const c of cmd) register(c);
            return;
        }
        if (!cmd || typeof cmd !== "object") {
            throw new Error("register: command must be an object");
        }
        if (!cmd.id) throw new Error("register: command.id is required");
        if (!cmd.label) throw new Error("register: command.label is required");
        // Replace if exists (update path); otherwise track insertion order.
        if (!_commands.has(cmd.id)) _commandOrder.push(cmd.id);
        _commands.set(cmd.id, cmd);
        _recompute();
    }

    function unregister(id) {
        if (!_commands.has(id)) return;
        _commands.delete(id);
        const idx = _commandOrder.indexOf(id);
        if (idx >= 0) _commandOrder.splice(idx, 1);
        const ridx = _recent.indexOf(id);
        if (ridx >= 0) _recent.splice(ridx, 1);
        _recompute();
    }

    function clear() {
        _commands.clear();
        _commandOrder.length = 0;
        _recent.length = 0;
        _recompute();
    }

    // Reset the recency tracking without touching registered commands.
    // The demo's "clear recent" button calls this so the recency boost
    // doesn't keep previously-invoked commands at the top of equal-
    // scoring results after the user explicitly clears history.
    // No-op + no recompute if recents was already empty.
    function clearRecents() {
        if (_recent.length === 0) return;
        _recent.length = 0;
        _recompute();
    }

    // ----- ranking --------------------------------------------------
    // Memoised between recompute() calls; recomputed on register /
    // unregister / setQuery / clear.
    let _results = [];

    function _recompute() {
        const q = _query();
        const fuzzyEnabled = fuzzy;
        const ranked = [];
        for (const id of _commandOrder) {
            const cmd = _commands.get(id);
            if (!cmd) continue;
            if (cmd.disabled) continue;
            // Filter callback (consumer-provided) — return false to hide
            if (cmd.when && cmd.when() === false) continue;
            const m = scoreCommand(cmd, q, fuzzyEnabled);
            if (!m) continue;
            let score = m.score;
            // recent boost (within match tier; doesn't escalate across tiers)
            if (recentBoost && rememberRecent) {
                const recentRank = _recent.indexOf(id);
                if (recentRank >= 0) {
                    score += recentBoost - Math.min(recentBoost - 1, recentRank);
                }
            }
            ranked.push({
                id, cmd,
                score,
                matches: m.matches,
                _order: _commandOrder.indexOf(id),
            });
        }
        // sort: score desc, then insertion order asc (stable tie-break)
        ranked.sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            return a._order - b._order;
        });
        const top = ranked.slice(0, maxResults);
        _results = top;
        // active idx clamps to results length
        if (_activeIdx() >= top.length) {
            _activeIdx.set(top.length > 0 ? 0 : -1);
        } else if (top.length > 0 && _activeIdx() < 0) {
            _activeIdx.set(0);
        }
        if (onResultsChange) try { onResultsChange(top); } catch {}
    }

    // ----- open/close/toggle ----------------------------------------
    function open(reason) {
        if (_destroyed || _open()) return;
        _open.set(true);
        // Reset active index to 0 on each open (consistent UX:
        // most-relevant result is always primed on first arrow press)
        _activeIdx.set(_results.length > 0 ? 0 : -1);
        if (onOpen) try { onOpen(reason || "imperative"); } catch {}
        if (onOpenChange) try { onOpenChange(true, reason || "imperative"); } catch {}
        // Auto-focus the input on next tick (the consumer may need to
        // render their dialog first; queue a microtask to give the
        // DOM a chance to be visible/focusable)
        queueMicrotask(() => {
            if (_inputEl && document.activeElement !== _inputEl) {
                try { _inputEl.focus(); } catch {}
            }
        });
    }

    function close(reason) {
        if (_destroyed || !_open()) return;
        _open.set(false);
        // Clear the query when closing so the next open starts fresh.
        // Consumers preferring sticky-query can override via setQuery
        // after their dialog's onClose handler.
        if (_query() !== "") {
            _query.set("");
            _recompute();
            if (_inputEl) _inputEl.value = "";
            if (onQueryChange) try { onQueryChange(""); } catch {}
        }
        if (onClose) try { onClose(reason || "imperative"); } catch {}
        if (onOpenChange) try { onOpenChange(false, reason || "imperative"); } catch {}
    }

    function toggle(reason) {
        if (_open()) close(reason || "toggle");
        else open(reason || "toggle");
    }

    // ----- invoke ----------------------------------------------------
    function invoke(id, source) {
        const cmd = typeof id === "string" ? _commands.get(id) : id;
        if (!cmd || cmd.disabled) return false;
        // Track recent
        if (rememberRecent) {
            const i = _recent.indexOf(cmd.id);
            if (i >= 0) _recent.splice(i, 1);
            _recent.unshift(cmd.id);
            if (_recent.length > recentLimit) _recent.length = recentLimit;
            // Recompute to reflect the recent boost in the cached
            // results (subsequent open()s without setQuery will see
            // the updated ranking).
            _recompute();
        }
        // Invoke
        if (invokeOnSelect && typeof cmd.onSelect === "function") {
            try { cmd.onSelect(cmd, source || "invoke"); } catch {}
        }
        if (onSelect) try { onSelect(cmd, source || "invoke"); } catch {}
        // Auto-close after a successful invoke
        close("invoke");
        return true;
    }

    function invokeActive(source) {
        const idx = _activeIdx();
        if (idx < 0 || idx >= _results.length) return false;
        return invoke(_results[idx].cmd, source);
    }

    // ----- query / setQuery -----------------------------------------
    function setQuery(q) {
        const v = String(q || "");
        if (_query() === v) return;
        _query.set(v);
        _recompute();
        if (_inputEl && _inputEl.value !== v) _inputEl.value = v;
        if (onQueryChange) try { onQueryChange(v); } catch {}
    }

    // ----- navigation ------------------------------------------------
    function _moveActive(delta) {
        const n = _results.length;
        if (n === 0) return;
        let next = _activeIdx() + delta;
        // Wrap
        if (next < 0)   next = n - 1;
        if (next >= n)  next = 0;
        _activeIdx.set(next);
        if (onActiveIndexChange) try { onActiveIndexChange(next); } catch {}
    }
    function _setActive(idx) {
        if (idx < 0 || idx >= _results.length) return;
        _activeIdx.set(idx);
        if (onActiveIndexChange) try { onActiveIndexChange(idx); } catch {}
    }

    // ----- input handling -------------------------------------------
    function _onInputKeyDown(e) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            _moveActive(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            _moveActive(-1);
        } else if (e.key === "Home") {
            e.preventDefault();
            _setActive(0);
        } else if (e.key === "End") {
            e.preventDefault();
            _setActive(_results.length - 1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            invokeActive("keyboard");
        } else if (e.key === "Escape") {
            e.preventDefault();
            close("escape");
        } else if (e.ctrlKey && (e.key === "n" || e.key === "j")) {
            // vim-style optional nav
            e.preventDefault();
            _moveActive(1);
        } else if (e.ctrlKey && (e.key === "p" || e.key === "k")) {
            e.preventDefault();
            _moveActive(-1);
        }
    }
    function _onInputInput(e) {
        setQuery(e.target.value);
    }

    // ----- list click delegation ------------------------------------
    function _onListClick(e) {
        let t = e.target;
        while (t && t !== _listEl) {
            if (t._lhCmdId != null) {
                e.preventDefault();
                invoke(t._lhCmdId, "click");
                return;
            }
            t = t.parentElement;
        }
    }
    function _onListMouseOver(e) {
        let t = e.target;
        while (t && t !== _listEl) {
            if (t._lhCmdIndex != null) {
                _setActive(t._lhCmdIndex);
                return;
            }
            t = t.parentElement;
        }
    }

    // ----- ARIA + DOM paint effects ---------------------------------
    // Repaint the list's items' active state when activeIdx changes.
    // The consumer is expected to render <li> children matching
    // results(); we walk the children and update aria-selected +
    // data-active + aria-activedescendant.
    const stopActivePaint = effect(() => {
        const idx = _activeIdx();
        if (!_listEl) return;
        let activeId = null;
        // Walk items; each rendered item should carry _lhCmdIndex
        // (set by the wrapper or by the consumer's render pass).
        const items = _listEl.querySelectorAll("[data-command-item]");
        for (const item of items) {
            const i = item._lhCmdIndex;
            const isActive = i === idx;
            if (isActive) activeId = item.id || null;
            setAttr(item, "aria-selected", isActive ? "true" : "false");
            if (isActive) setAttr(item, "data-active", "true");
            else removeAttr(item, "data-active");
        }
        if (_inputEl) {
            if (activeId) setAttr(_inputEl, "aria-activedescendant", activeId);
            else removeAttr(_inputEl, "aria-activedescendant");
        }
    });

    // Emit query / open-state changes for consumer effects
    const stopQueryEmit = effect(() => {
        _query();
        // no-op effect just keeps the dependency wired; onQueryChange
        // is called directly from setQuery() to ensure synchronicity
    });

    // ----- global keybind -------------------------------------------
    let _detachKeybind = null;
    function _shouldHandleKeybind(e) {
        const target = e.target;
        if (target === _inputEl) return true;
        if (!target || !target.tagName) return true;
        const tag = target.tagName.toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
        if (target.isContentEditable) return false;
        return true;
    }
    function _setupKeybind() {
        if (!triggerKey || typeof window === "undefined") return;
        const onKey = (e) => {
            // Defensive: e.key can be undefined for some synthetic events
            // (programmatic dispatch without `key`, IME-composition starts,
            // certain auto-focus-shift edge cases on Chromium). An
            // unguarded `.toLowerCase()` throws here and breaks every
            // subsequent listener in the same task, which manifests as
            // "all my buttons stopped working".
            if (!e || typeof e.key !== "string") return;
            const keyMatch = e.key.toLowerCase() === String(triggerKey.key).toLowerCase();
            if (!keyMatch) return;
            // If triggerKey.meta is true, require Cmd OR Ctrl (cross-platform)
            if (triggerKey.meta && !(e.metaKey || e.ctrlKey)) return;
            if (triggerKey.meta === false && (e.metaKey || e.ctrlKey)) return;
            if (triggerKey.shift && !e.shiftKey) return;
            if (triggerKey.shift === false && e.shiftKey) return;
            if (triggerKey.alt && !e.altKey) return;
            if (triggerKey.alt === false && e.altKey) return;
            if (!_shouldHandleKeybind(e)) return;
            e.preventDefault();
            toggle("keybind");
        };
        window.addEventListener("keydown", onKey);
        _detachKeybind = () => window.removeEventListener("keydown", onKey);
    }
    _setupKeybind();

    // ----- attachments ----------------------------------------------
    function attachInput(el) {
        if (!el || _destroyed) return noop;
        _inputEl = el;
        if (!el.id) el.id = uniqueId("lh-cmd-input");
        setAttr(el, "role", "combobox");
        setAttr(el, "aria-expanded", _open() ? "true" : "false");
        setAttr(el, "aria-autocomplete", "list");
        if (_listEl) setAttr(el, "aria-controls", _listEl.id);
        // Sync initial value
        if (el.value !== _query()) el.value = _query();
        el.addEventListener("keydown", _onInputKeyDown);
        el.addEventListener("input", _onInputInput);
        const off = () => {
            el.removeEventListener("keydown", _onInputKeyDown);
            el.removeEventListener("input", _onInputInput);
            removeAttr(el, "role");
            removeAttr(el, "aria-expanded");
            removeAttr(el, "aria-controls");
            removeAttr(el, "aria-autocomplete");
            removeAttr(el, "aria-activedescendant");
            if (_inputEl === el) _inputEl = null;
        };
        _detach.set("input", off);
        return off;
    }

    function attachList(el) {
        if (!el || _destroyed) return noop;
        _listEl = el;
        if (!el.id) el.id = uniqueId("lh-cmd-list");
        setAttr(el, "role", "listbox");
        if (_inputEl) setAttr(_inputEl, "aria-controls", el.id);
        el.addEventListener("click", _onListClick);
        el.addEventListener("mouseover", _onListMouseOver);
        const off = () => {
            el.removeEventListener("click", _onListClick);
            el.removeEventListener("mouseover", _onListMouseOver);
            removeAttr(el, "role");
            if (_listEl === el) _listEl = null;
        };
        _detach.set("list", off);
        return off;
    }

    function attachEmpty(el) {
        if (!el || _destroyed) return noop;
        _emptyEl = el;
        // Show/hide on results length (consumer can also do this via CSS:
        // [data-command-list]:empty + [data-command-empty] { display: block })
        const update = () => {
            if (!_emptyEl) return;
            const hidden = _results.length > 0;
            if (hidden) setAttr(_emptyEl, "hidden", "");
            else removeAttr(_emptyEl, "hidden");
        };
        update();
        // Update whenever results change
        const stop = effect(() => {
            _query(); _activeIdx();        // tracks indirect deps
            untrack(update);
        });
        const off = () => {
            stop();
            if (_emptyEl === el) _emptyEl = null;
        };
        _detach.set("empty", off);
        return off;
    }

    // Wrapper helper -- mark an item element with its command id and
    // index so the click + activeIdx paint effect can find it. Also
    // applies the CURRENT active state immediately so consumers who
    // call markItem AFTER the initial render don't have to wait for
    // the next activeIdx change to see correct ARIA.
    function markItem(el, cmdId, index) {
        if (!el) return;
        el._lhCmdId = cmdId;
        el._lhCmdIndex = index;
        setAttr(el, "role", "option");
        setAttr(el, "data-command-item", "");
        if (!el.id) el.id = uniqueId("lh-cmd-item");
        const isActive = _activeIdx() === index;
        setAttr(el, "aria-selected", isActive ? "true" : "false");
        if (isActive) {
            setAttr(el, "data-active", "true");
            if (_inputEl) setAttr(_inputEl, "aria-activedescendant", el.id);
        } else {
            removeAttr(el, "data-active");
        }
    }

    // Effect: keep aria-expanded on input synced
    const stopExpanded = effect(() => {
        const o = _open();
        if (_inputEl) setAttr(_inputEl, "aria-expanded", o ? "true" : "false");
    });

    // ----- destroy ---------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopActivePaint();
        stopQueryEmit();
        stopExpanded();
        if (_detachKeybind) { try { _detachKeybind(); } catch {} _detachKeybind = null; }
        for (const off of _detach.values()) { try { off(); } catch {} }
        _detach.clear();
        _commands.clear();
        _commandOrder.length = 0;
        _recent.length = 0;
        _results = [];
        _inputEl = null; _listEl = null; _emptyEl = null;
    }

    return {
        // reactive
        isOpen:      () => _open(),
        query:       () => _query(),
        results:     () => _results,
        activeIndex: () => _activeIdx(),
        // command registry
        register, unregister, clear, clearRecents,
        commands: () => Array.from(_commands.values()),
        recents:  () => _recent.slice(),    // snapshot of ids, most recent first
        refresh:  () => _recompute(),       // re-evaluate when() filters
        // imperative
        open, close, toggle,
        setQuery, invoke, invokeActive,
        setActive: _setActive,
        next: () => _moveActive(1),
        prev: () => _moveActive(-1),
        // attachments
        attachInput, attachList, attachEmpty,
        markItem,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
    };
}
