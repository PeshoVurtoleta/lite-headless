// @zakkster/lite-headless / tree / index.js
//
// Headless tree-view primitive. Hierarchical list with expand/collapse,
// selection (single or multiple), and full keyboard nav per the
// WAI-ARIA APG tree pattern.
//
//   const tree = createTree({
//       selectionMode: "single",
//       defaultExpanded: ["src"],
//       defaultSelected: "src/index.js",
//   });
//   tree.attachRoot(rootEl);
//   tree.attachNode(liEl, "src", { hasChildren: true });
//   tree.attachNode(childLi, "src/index.js", {});
//
// DATA MODEL
//
// Each node is identified by an arbitrary string key. Parent/child
// relationships are inferred from DOM ancestry: when attachNode runs,
// the primitive walks up from `el` until it finds another tree-node
// element (one that's been attached). That node becomes the parent.
// Top-level nodes (no tree-node ancestor before the root) attach to
// the root.
//
// `hasChildren` is an optional flag for lazy-loaded subtrees. By
// default we infer it from whether any other attachNode call records
// `el` as its parent. If consumers do lazy loading -- "this folder
// has children but they're not in the DOM yet" -- they pass
// `hasChildren: true` and the chevron + aria-expanded reflect that.
//
// VISIBLE FLAT LIST
//
// A node is "visible" iff every ancestor between it and the root is
// expanded. The visible flat list is recomputed on demand inside
// `getItems()` -- the roving-focus helper calls this on every key
// operation. For trees with <= 200 nodes this is microseconds.
// Larger trees should consider caching with an invalidation token
// bumped on every expand/collapse, but we don't pay that complexity
// upfront.
//
// KEYBOARD (WAI-ARIA APG)
//
//   ArrowDown / ArrowUp     -- next / previous VISIBLE node (with loop)
//   ArrowRight              -- if collapsed and hasChildren: expand
//                              else if expanded: focus first child
//                              else: no-op
//   ArrowLeft               -- if expanded: collapse
//                              else: focus parent (if any)
//   Home / End              -- first / last visible enabled node
//   Enter / Space           -- select (toggle in multi mode)
//   *                       -- expand all SIBLINGS of the focused node
//   Type characters         -- typeahead match on node label
//
// Only one tree-node is in the tab sequence at a time (roving
// tabindex via STRATEGY_DOM_FOCUS). Tab moves out of the tree.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { uniqueId, setAttr, toggleAttr } from "../_overlay/aria.js";
import {
    createRovingFocus, STRATEGY_DOM_FOCUS
} from "../_overlay/roving-focus.js";

const noop = () => {};

function asArr(v) {
    if (Array.isArray(v)) return v.slice();
    if (v == null) return [];
    return [String(v)];
}

export function createTree(options = {}) {
    const {
        selectionMode = "single",
        defaultSelected,
        defaultExpanded,
        typeahead = true,
        loop = true,
        onSelectionChange,
        onExpandedChange,
    } = options;

    if (selectionMode !== "single" && selectionMode !== "multiple") {
        throw new Error(`createTree: selectionMode must be "single" or "multiple", got "${selectionMode}"`);
    }

    // ---- state ---------------------------------------------------------

    // Initial selected: single => string|null, multiple => string[]
    let initialSelected;
    if (selectionMode === "multiple") initialSelected = asArr(defaultSelected);
    else initialSelected = (Array.isArray(defaultSelected) ? defaultSelected[0] : defaultSelected) ?? null;

    const _selected = makeSignal(initialSelected);
    const _expanded = makeSignal(new Set(asArr(defaultExpanded)));

    let _destroyed = false;
    let _rootEl = null;

    // key -> { el, key, parentKey, hasChildrenExplicit, disabled, labelEl }
    // labelEl: optional dedicated element for typeahead text; falls back to el.textContent
    const _nodes = new Map();

    // v0.7.11: incremental child-count map. Previously `hasChildren(key)`
    // scanned every node looking for `parentKey === key`, making the
    // paint effect O(N^2) (each paint reads hasChildren per node, and
    // hasChildren is O(N)). At 1000 nodes that's a million iterations
    // per click. Now hasChildren is O(1) -- incremented in attachNode,
    // decremented in cleanup.
    const _childCounts = new Map();   // parentKey -> count (parent must be a known key)

    // ---- helpers --------------------------------------------------------

    function findParentKey(el) {
        // Walk up from el's parent until we find an element marked as a
        // tree-node (we stamp `_lhTreeKey` on attachNode), stopping at
        // the root or the document.
        let cur = el.parentElement;
        while (cur && cur !== _rootEl && cur !== document.body && cur !== document.documentElement) {
            if (cur._lhTreeKey != null && _nodes.has(cur._lhTreeKey)) {
                return cur._lhTreeKey;
            }
            cur = cur.parentElement;
        }
        return null;
    }

    function computeLevel(key) {
        let lvl = 1;
        let cur = _nodes.get(key);
        while (cur && cur.parentKey != null) {
            lvl++;
            cur = _nodes.get(cur.parentKey);
            if (lvl > 64) break;       // guard against cycles in pathological consumers
        }
        return lvl;
    }

    // v0.7.10: WAI-ARIA APG strongly recommends aria-setsize +
    // aria-posinset on each treeitem so screen readers can announce
    // "3 of 7" position context. Walks one sibling group; called from
    // attachNode (new sibling joined) and from the detach cleanup
    // (sibling removed -- positions shift). Skipped when there's only
    // one sibling and no positional context exists (set-size==1).
    function paintSiblingPositions(parentKey) {
        // Find siblings in INSERTION order (Map preserves insertion order;
        // _nodes lists nodes in attach order, which mirrors DOM order
        // because the role observer walks the DOM in tree order).
        const sibs = [];
        for (const n of _nodes.values()) {
            if (n.parentKey === parentKey) sibs.push(n);
        }
        const setSize = String(sibs.length);
        for (let i = 0; i < sibs.length; i++) {
            setAttr(sibs[i].el, "aria-setsize", setSize);
            setAttr(sibs[i].el, "aria-posinset", String(i + 1));
        }
    }

    function isExpanded(key) {
        return _expanded().has(key);
    }

    function hasChildren(key) {
        const n = _nodes.get(key);
        if (!n) return false;
        if (n.hasChildrenExplicit != null) return n.hasChildrenExplicit;
        // v0.7.11: O(1) via incremental child count
        return (_childCounts.get(key) || 0) > 0;
    }

    function isVisible(key) {
        let n = _nodes.get(key);
        if (!n) return false;
        while (n && n.parentKey != null) {
            if (!_expanded().has(n.parentKey)) return false;
            n = _nodes.get(n.parentKey);
        }
        return true;
    }

    // v0.7.11: cached, DOM-ordered, expanded-filtered list of visible nodes.
    // The cache invalidates on every structural mutation (attachNode /
    // detach) and on every expand/collapse. Roving-focus calls
    // getItems() heavily during keyboard nav (Down/Up/Home/End/typeahead),
    // so caching this is critical. The previous implementation:
    //   1. Allocated a fresh array of wrapper objects per call (per-keypress GC churn)
    //   2. Called compareDocumentPosition for every pair-comparison during
    //      sort (layout-thrash hazard; can force style recalc mid-sort)
    //
    // The new implementation relies on `_nodes` being in DOM order
    // (createRoleObserver walks the DOM in tree order on initial scan;
    // dynamic appendChild / insertBefore preserve order in the
    // MutationObserver callback by appending to the Map in the order
    // the records arrive, which IS DOM order for typical usage).
    // For pathological out-of-order inserts the cache will be off until
    // the user does another expand/collapse; this is an acceptable
    // tradeoff vs. compareDocumentPosition on every keypress.
    //
    // The wrapper-object reuse path: when the cache is hot we return the
    // SAME array (and same wrapper objects) so roving-focus's index
    // tracking stays valid frame-to-frame. Labels are recomputed lazily
    // via getter only when typeahead actually fires.
    let _cachedVisibleFlat = null;
    function invalidateVisibleFlat() { _cachedVisibleFlat = null; }

    function visibleFlat() {
        if (_cachedVisibleFlat) return _cachedVisibleFlat;
        const out = [];
        if (!_rootEl) { _cachedVisibleFlat = out; return out; }
        for (const n of _nodes.values()) {
            if (!isVisible(n.key)) continue;
            out.push({
                el: n.el,
                id: n.el.id,
                key: n.key,
                disabled: !!n.disabled,
                // label is read at typeahead time, not built per push --
                // defers textContent reads until they're actually needed
                get label() {
                    return (n.labelEl ? n.labelEl.textContent : n.el.textContent || "").toLowerCase();
                },
            });
        }
        _cachedVisibleFlat = out;
        return out;
    }

    // ---- selection / expansion mutations -------------------------------

    function commitSelection(next, reason) {
        if (_destroyed) return;
        const cur = _selected();
        if (selectionMode === "single") {
            if (cur === next) return;
            _selected.set(next);
        } else {
            // array equality
            if (Array.isArray(cur) && Array.isArray(next) && cur.length === next.length &&
                cur.every((k, i) => k === next[i])) return;
            _selected.set(next);
        }
        if (onSelectionChange) {
            try { onSelectionChange(next, reason || "set"); } catch { /* swallow */ }
        }
    }

    function commitExpanded(nextSet, reason) {
        if (_destroyed) return;
        const cur = _expanded();
        if (cur.size === nextSet.size) {
            let same = true;
            for (const k of cur) if (!nextSet.has(k)) { same = false; break; }
            if (same) return;
        }
        _expanded.set(nextSet);
        // v0.7.11: structural visibility just changed -- invalidate the
        // visibleFlat cache. Selection changes don't affect visibility
        // so commitSelection doesn't invalidate.
        invalidateVisibleFlat();
        if (onExpandedChange) {
            try { onExpandedChange(Array.from(nextSet), reason || "set"); } catch { /* swallow */ }
        }
    }

    function expand(key, reason) {
        if (_destroyed) return;
        const cur = _expanded();
        if (cur.has(key)) return;
        const next = new Set(cur); next.add(key);
        commitExpanded(next, reason || "expand");
    }
    function collapse(key, reason) {
        if (_destroyed) return;
        const cur = _expanded();
        if (!cur.has(key)) return;
        const next = new Set(cur); next.delete(key);
        commitExpanded(next, reason || "collapse");
    }
    function toggleExpanded(key, reason) {
        if (_expanded().has(key)) collapse(key, reason);
        else expand(key, reason);
    }

    function isSelected(key) {
        const s = _selected();
        if (selectionMode === "single") return s === key;
        return Array.isArray(s) && s.indexOf(key) !== -1;
    }

    function select(key, reason) {
        if (_destroyed) return;
        const n = _nodes.get(key);
        if (!n || n.disabled) return;
        if (selectionMode === "single") {
            commitSelection(key, reason || "select");
            return;
        }
        const cur = Array.isArray(_selected()) ? _selected() : [];
        if (cur.indexOf(key) !== -1) return;
        commitSelection(cur.concat(key), reason || "select");
    }
    function deselect(key, reason) {
        if (_destroyed) return;
        if (selectionMode === "single") {
            if (_selected() === key) commitSelection(null, reason || "deselect");
            return;
        }
        const cur = Array.isArray(_selected()) ? _selected() : [];
        const i = cur.indexOf(key);
        if (i === -1) return;
        const next = cur.slice(); next.splice(i, 1);
        commitSelection(next, reason || "deselect");
    }
    function toggleSelected(key, reason) {
        if (isSelected(key)) deselect(key, reason);
        else select(key, reason);
    }

    function setSelected(v, reason) {
        if (selectionMode === "single") {
            commitSelection(v == null ? null : String(v), reason || "set");
        } else {
            const seen = new Set();
            const next = asArr(v).filter((k) => { if (seen.has(k)) return false; seen.add(k); return true; });
            commitSelection(next, reason || "set");
        }
    }

    function setExpanded(v, reason) {
        const next = new Set(asArr(v).map(String));
        commitExpanded(next, reason || "set");
    }

    function expandAll(reason) {
        const next = new Set();
        for (const n of _nodes.values()) if (hasChildren(n.key)) next.add(n.key);
        commitExpanded(next, reason || "expand-all");
    }
    function collapseAll(reason) {
        commitExpanded(new Set(), reason || "collapse-all");
    }

    function setDisabled(key, flag) {
        const n = _nodes.get(key);
        if (!n) return;
        if (n.disabled === !!flag) return;     // no-op, avoid cache thrash
        n.disabled = !!flag;
        if (flag) setAttr(n.el, "aria-disabled", "true");
        else n.el.removeAttribute("aria-disabled");
        // v0.7.11: invalidate visibleFlat cache because rover skips
        // disabled items during arrow nav -- flipping disabled changes
        // the navigable subset, which is the cached array's identity.
        invalidateVisibleFlat();
        // If we just disabled the currently-selected key, deselect it.
        if (flag && isSelected(key)) deselect(key, "disable-fallback");
    }

    // ---- roving-focus integration --------------------------------------

    const rover = createRovingFocus({
        getItems: visibleFlat,
        strategy: STRATEGY_DOM_FOCUS,
        loop,
        typeahead,
    });

    // ---- ARIA + state painting -----------------------------------------
    // Updates derived attributes when _selected / _expanded change. The
    // INITIAL paint for each node happens in attachNode -- this effect
    // only handles subsequent signal-driven updates (it can't depend on
    // _nodes mutations because _nodes isn't a signal).
    const stopPaint = effect(() => {
        _selected();
        _expanded();
        for (const n of _nodes.values()) {
            const open = _expanded().has(n.key);
            const hc = hasChildren(n.key);
            if (hc) {
                setAttr(n.el, "aria-expanded", open ? "true" : "false");
                toggleAttr(n.el, "data-open", open);
                toggleAttr(n.el, "data-leaf", false);
            } else {
                // v0.11.0: leaves get data-leaf (boolean) as a styling hook;
                // branches get data-open + aria-expanded. aria-expanded is
                // intentionally omitted on leaves per WAI-ARIA APG.
                n.el.removeAttribute("aria-expanded");
                n.el.removeAttribute("data-open");
                toggleAttr(n.el, "data-leaf", true);
            }
            setAttr(n.el, "aria-selected", isSelected(n.key) ? "true" : "false");
            setAttr(n.el, "data-selected", isSelected(n.key) ? "" : null);
            setAttr(n.el, "data-visible", isVisible(n.key) ? "" : null);
        }
    });

    // ---- key handler ---------------------------------------------------

    function keyOf(el) {
        return el._lhTreeKey;
    }

    function indexOfKey(visible, key) {
        for (let i = 0; i < visible.length; i++) if (visible[i].key === key) return i;
        return -1;
    }

    function focusKey(key) {
        const visible = visibleFlat();
        const i = indexOfKey(visible, key);
        if (i >= 0) rover.setIndex(i);
    }

    function onKey(e, key) {
        if (_destroyed) return;
        const node = _nodes.get(key);
        if (!node || node.disabled) return;
        const k = e.key;
        const visible = visibleFlat();
        const idx = indexOfKey(visible, key);
        if (idx < 0) return;

        // Sync rover's index with the actually-focused row. The rover's
        // internal _index only updates through its own ops (setIndex,
        // move, first/last, typeChar). When focus moves via user click,
        // programmatic focus, or initial render, the rover never learns
        // about it -- so move(+1) would compute "delta from -1" and go
        // to the first enabled, instead of "delta from current focus".
        // This one-line sync makes arrow nav behave intuitively.
        if (rover.index !== idx) rover.setIndex(idx);

        if (k === "ArrowDown") { e.preventDefault(); rover.move(+1); return; }
        if (k === "ArrowUp")   { e.preventDefault(); rover.move(-1); return; }
        if (k === "Home")      { e.preventDefault(); rover.first();  return; }
        if (k === "End")       { e.preventDefault(); rover.last();   return; }

        if (k === "ArrowRight") {
            e.preventDefault();
            if (hasChildren(key)) {
                if (!isExpanded(key)) {
                    expand(key, "keyboard");
                } else {
                    // focus first child (next visible after this row that's a child)
                    const nextVisible = visibleFlat();
                    for (let i = idx + 1; i < nextVisible.length; i++) {
                        const cn = _nodes.get(nextVisible[i].key);
                        if (cn && cn.parentKey === key) {
                            rover.setIndex(i);
                            break;
                        }
                    }
                }
            }
            return;
        }
        if (k === "ArrowLeft") {
            e.preventDefault();
            if (hasChildren(key) && isExpanded(key)) {
                collapse(key, "keyboard");
            } else if (node.parentKey != null) {
                const parentIdx = indexOfKey(visible, node.parentKey);
                if (parentIdx >= 0) rover.setIndex(parentIdx);
            }
            return;
        }
        if (k === "Enter" || k === " " || k === "Spacebar") {
            e.preventDefault();
            if (selectionMode === "multiple") toggleSelected(key, "keyboard");
            else select(key, "keyboard");
            return;
        }
        if (k === "*") {
            // Expand all siblings (and the focused node if it has children)
            e.preventDefault();
            const parentKey = node.parentKey;
            const sibs = [];
            for (const n of _nodes.values()) {
                if (n.parentKey === parentKey && hasChildren(n.key)) sibs.push(n.key);
            }
            const next = new Set(_expanded());
            for (const k of sibs) next.add(k);
            commitExpanded(next, "expand-siblings");
            return;
        }
        // Typeahead: single printable character
        if (typeahead && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (rover.typeChar(k)) e.preventDefault();
        }
    }

    // ---- attach* lifecycle ---------------------------------------------

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        setAttr(el, "role", "tree");
        if (selectionMode === "multiple") setAttr(el, "aria-multiselectable", "true");
        return () => {
            if (_rootEl === el) {
                el.removeAttribute("role");
                el.removeAttribute("aria-multiselectable");
                _rootEl = null;
            }
        };
    }

    function attachNode(el, key, opts) {
        if (!el || _destroyed) return noop;
        if (key == null) throw new Error("createTree.attachNode: key is required");
        const k = String(key);
        if (!el.id) el.id = uniqueId("lh-tree-node");
        el._lhTreeKey = k;

        const parentKey = findParentKey(el);
        const entry = {
            el, key: k, parentKey,
            hasChildrenExplicit: opts && opts.hasChildren != null ? !!opts.hasChildren : null,
            disabled: !!(opts && opts.disabled),
            labelEl: null,
        };
        _nodes.set(k, entry);

        // v0.7.11: increment parent's child count for O(1) hasChildren
        if (parentKey != null) {
            _childCounts.set(parentKey, (_childCounts.get(parentKey) || 0) + 1);
        }
        // structure changed -- invalidate the visibleFlat cache
        invalidateVisibleFlat();

        // Initial ARIA + state paint. The effect below handles subsequent
        // updates driven by _selected / _expanded signal changes; this
        // covers the just-attached node which won't have been touched by
        // the effect's prior runs.
        setAttr(el, "role", "treeitem");
        setAttr(el, "tabindex", "-1");
        setAttr(el, "aria-level", String(computeLevel(k)));
        const open = _expanded().has(k);
        const hc = hasChildren(k);
        if (hc) {
            setAttr(el, "aria-expanded", open ? "true" : "false");
            toggleAttr(el, "data-open", open);
            toggleAttr(el, "data-leaf", false);
        } else {
            toggleAttr(el, "data-leaf", true);
        }
        setAttr(el, "aria-selected", isSelected(k) ? "true" : "false");
        if (isSelected(k)) setAttr(el, "data-selected", "");
        if (isVisible(k)) setAttr(el, "data-visible", "");
        if (entry.disabled) setAttr(el, "aria-disabled", "true");

        // v0.7.10: aria-setsize / aria-posinset (APG-recommended). Each
        // attach changes one sibling-group's cardinality, so we sweep
        // that group AFTER the new entry is in _nodes. The walk is O(N)
        // over the sibling list; for typical trees this is noise.
        paintSiblingPositions(parentKey);

        // Newly attaching THIS node may also have changed hasChildren
        // status on the PARENT (parent gained a child -> chevron appears).
        // Repaint the parent.
        if (parentKey != null) {
            const p = _nodes.get(parentKey);
            if (p) {
                const pHc = hasChildren(parentKey);
                if (pHc) {
                    const pOpen = _expanded().has(parentKey);
                    setAttr(p.el, "aria-expanded", pOpen ? "true" : "false");
                    toggleAttr(p.el, "data-open", pOpen);
                    toggleAttr(p.el, "data-leaf", false);
                }
            }
        }

        const onClick = (e) => {
            if (entry.disabled) return;
            // The tree is nested: a treeitem <li> contains a <ul role="group">
            // which holds child treeitem <li>s. A click bubbles from the
            // target UP through every ancestor; each ancestor's listener
            // runs.
            //
            // Two things to guard against:
            //
            //   1. A click that ORIGINATED on a descendant treeitem -- the
            //      child's handler already did the work; we must bail.
            //
            //   2. A click on a [data-tree-toggle] chevron belonging to a
            //      DIFFERENT treeitem. Earlier versions (pre-v0.7.10) had
            //      a subtle bug: the chevron itself carries no
            //      _lhTreeKey, so walking from chevron to `el` checked
            //      only at the chevron (no key -> not "other treeitem")
            //      and fell through to the data-tree-toggle branch,
            //      causing ANCESTOR treeitems to toggle themselves when
            //      a descendant's chevron was clicked. The fix is to
            //      bail if the chevron's nearest treeitem ancestor is
            //      not us. We use `closest("[data-tree-node]")` for the
            //      lookup -- O(depth) but called at human-click rate.
            let t = e.target;
            while (t && t !== el) {
                if (t._lhTreeKey != null && t._lhTreeKey !== k) return;
                if (t.hasAttribute && t.hasAttribute("data-tree-toggle")) {
                    const owner = t.closest("[data-tree-node]");
                    if (owner && owner._lhTreeKey !== k) return;   // chevron of another node
                    e.preventDefault();
                    e.stopPropagation();                            // don't double-fire on ancestor
                    if (hasChildren(k)) toggleExpanded(k, "click-toggle");
                    return;
                }
                t = t.parentElement;
            }
            if (selectionMode === "multiple") toggleSelected(k, "click");
            else select(k, "click");
        };
        const onKeyDown = (e) => {
            // Tree DOM is nested: a <li role="treeitem"> contains a
            // <ul role="group"> with child <li role="treeitem">s.
            // A keydown that bubbles from a child treeitem will reach
            // the parent's listener. If we naively re-route it, the
            // parent treats it as "key pressed on me", which causes
            // arrow nav to land on the wrong row. Bail unless the
            // event TARGET is this exact element (or a non-treeitem
            // descendant -- e.g. the visible row label or chevron).
            let cur = e.target;
            while (cur && cur !== el) {
                if (cur._lhTreeKey != null && cur._lhTreeKey !== k) return;
                cur = cur.parentElement;
            }
            onKey(e, k);
        };

        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKeyDown);

        return () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKeyDown);
            el.removeAttribute("role");
            el.removeAttribute("tabindex");
            el.removeAttribute("aria-level");
            el.removeAttribute("aria-setsize");
            el.removeAttribute("aria-posinset");
            el.removeAttribute("aria-expanded");
            el.removeAttribute("aria-selected");
            el.removeAttribute("aria-disabled");
            el.removeAttribute("data-open"); el.removeAttribute("data-leaf");
            el.removeAttribute("data-selected");
            el.removeAttribute("data-visible");
            try { delete el._lhTreeKey; } catch {}
            _nodes.delete(k);
            // v0.7.11: decrement parent's child count (clamped at 0 just
            // in case of duplicate cleanup calls)
            if (parentKey != null) {
                const cur = _childCounts.get(parentKey) || 0;
                if (cur <= 1) _childCounts.delete(parentKey);
                else _childCounts.set(parentKey, cur - 1);
            }
            // v0.7.10: surviving siblings' positions just shifted -- repaint.
            paintSiblingPositions(parentKey);
            // v0.7.11: structure changed -- invalidate the visibleFlat cache
            invalidateVisibleFlat();
        };
    }

    function attachLabel(el, key) {
        if (!el || _destroyed) return noop;
        const n = _nodes.get(String(key));
        if (!n) return noop;
        n.labelEl = el;
        return () => { if (n.labelEl === el) n.labelEl = null; };
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        rover.destroy();
    }

    return {
        // signals
        selected: () => _selected(),
        expanded: () => Array.from(_expanded()),
        isSelected, isExpanded, isVisible, hasChildren,

        // mutations
        setSelected, setExpanded,
        select, deselect, toggleSelected,
        expand, collapse, toggleExpanded,
        expandAll, collapseAll,
        setDisabled,

        // navigation
        focusKey,

        // lifecycle
        attachRoot, attachNode, attachLabel,
        destroy,
        get destroyed() { return _destroyed; },

        // introspection
        _nodes: () => Array.from(_nodes.keys()),
        _visible: () => visibleFlat().map(n => n.key),
        _rover: rover,
    };
}
