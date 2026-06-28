// @zakkster/lite-headless / tabs / index.js
//
// Headless tabs. A tablist with N triggers and N panels, one active at
// a time. Active state is reactive; consumers can drive it externally
// via a controlled `value` signal.
//
//   const tabs = createTabs({
//       defaultValue: "overview",
//       orientation: "horizontal",   // or "vertical"
//       activation: "automatic",     // or "manual"
//       loop: true,
//   });
//
//   tabs.attachTablist(tablistEl);
//   tabs.attachTab(triggerA, "overview");
//   tabs.attachTab(triggerB, "settings", { disabled: false });
//   tabs.attachPanel(panelA, "overview");
//   tabs.attachPanel(panelB, "settings");
//
// KEYBOARD MODEL (built on createRovingFocus)
//
// The roving-focus helper from v0.7.4 handles arrow navigation,
// Home/End, disabled-skip, and (optionally) typeahead. We feed it
// items in document-order and let it drive `setIndex` whenever the
// user presses a navigation key.
//
//   horizontal: ArrowLeft / ArrowRight
//   vertical:   ArrowUp   / ArrowDown
//   Home / End -> first / last enabled tab
//   automatic activation: focus change = active change
//   manual activation:    focus change moves focus only; Enter/Space activates
//
// ARIA
//
// Tablist: role="tablist", aria-orientation, optional aria-label.
// Tabs:    role="tab", aria-selected, aria-controls=<panelId>,
//          roving tabindex (0 on selected, -1 on the rest).
// Panels:  role="tabpanel", aria-labelledby=<tabId>, tabindex="0" so the
//          panel content is reachable via Tab from the active trigger.
//          Inactive panels get `hidden` (which sets display:none, removes
//          from a11y tree, drops out of tab order) and removes data-active.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { createRovingFocus, STRATEGY_DOM_FOCUS } from "../_overlay/roving-focus.js";
import { uniqueId, setAttr, toggleAttr } from "../_overlay/aria.js";

const noop = () => {};

export function createTabs(options = {}) {
    const {
        value: valueSignal,
        defaultValue,
        orientation = "horizontal",
        activation  = "automatic",
        loop        = true,
        typeahead   = false,
        onValueChange,
    } = options;

    if (orientation !== "horizontal" && orientation !== "vertical") {
        throw new Error(`createTabs: orientation must be "horizontal" or "vertical", got "${orientation}"`);
    }
    if (activation !== "automatic" && activation !== "manual") {
        throw new Error(`createTabs: activation must be "automatic" or "manual", got "${activation}"`);
    }

    const _value = valueSignal || makeSignal(defaultValue != null ? defaultValue : null);
    let _destroyed = false;

    // Tabs in document order. Each entry: { el, key, id, panelId, disabled }.
    // The roving-focus helper consumes this same list.
    const _tabs = [];
    // Panels keyed by tab key. We keep this as a Map so a tab can attach
    // before its panel (consumer might wire panels lazily after route
    // resolution); panel attaches sync to the tab when both are present.
    const _panels = new Map();   // key -> { el, id }

    let _tablistEl = null;

    // ---- roving-focus integration --------------------------------------
    // The helper reads our items array on every operation. We expose
    // `{el, id, disabled, label}` shape; label is the tab's textContent
    // for typeahead matching. Strategy: DOM focus + roving tabindex.
    const roving = createRovingFocus({
        getItems: () => _tabs,
        strategy: STRATEGY_DOM_FOCUS,
        loop,
        typeahead,
        getLabel: (item) => (item.el.textContent || "").toLowerCase(),
        onIndexChange: (idx) => {
            // automatic activation: focusing a tab also activates it
            if (activation === "automatic" && idx >= 0 && idx < _tabs.length) {
                const tab = _tabs[idx];
                if (!tab.disabled) commitValue(tab.key, "keyboard");
            }
        },
        // Re-use the per-item itemAttr: tabs don't show a separate
        // "highlighted" visual the way menus do; the selected tab IS
        // the focused tab in automatic mode, so we don't need a
        // distinct attribute. Override the default "data-focused" with
        // an empty string-equivalent by passing the same attr the
        // selected state uses (data-active is set elsewhere).
        // We DO want the roving-tabindex sweep though, which the
        // helper does regardless of itemAttr.
        itemAttr: "data-focused",
    });

    function commitValue(key, reason) {
        if (_destroyed) return;
        if (_value() === key) return;
        // verify the key is registered AND enabled before committing
        let target = null;
        for (let i = 0; i < _tabs.length; i++) {
            if (_tabs[i].key === key) { target = _tabs[i]; break; }
        }
        if (!target || target.disabled) return;
        _value.set(key);
        if (onValueChange) {
            try { onValueChange(key, reason || "set"); } catch { /* swallow */ }
        }
    }

    // ---- ARIA + state painting ------------------------------------------
    // One effect per dimension keeps the dep set minimal:
    //   (a) value() changes -> repaint aria-selected + data-active + panel hidden
    //   (b) tabs/_panels registry changes are imperative (attachTab/attachPanel
    //       do their own initial paint); the value effect handles ongoing
    //       updates.
    const stopValuePaint = effect(() => {
        const active = _value();
        for (let i = 0; i < _tabs.length; i++) {
            const t = _tabs[i];
            const isActive = t.key === active;
            setAttr(t.el, "aria-selected", isActive ? "true" : "false");
            toggleAttr(t.el, "data-active", isActive);
            // tabindex is owned by the roving-focus helper EXCEPT for the
            // newly-active tab. The helper applies tabindex=0 to its
            // current index; if focus moved by click/programmatic and not
            // through the helper, the helper's index may not match. We
            // realign here.
        }
        for (const [key, entry] of _panels) {
            const isActive = key === active;
            toggleAttr(entry.el, "data-active", isActive);
            toggleAttr(entry.el, "hidden", !isActive);
        }
        // realign roving-focus to the currently-active tab so a
        // programmatic setValue() doesn't leave focus on a now-inactive
        // tab from the user's last keyboard nav. Only realign when an
        // active tab exists.
        if (active != null) {
            for (let i = 0; i < _tabs.length; i++) {
                if (_tabs[i].key === active && roving.index !== i) {
                    roving.setIndex(i);
                    break;
                }
            }
        }
    });

    // ---- attach* lifecycle -------------------------------------------------

    function attachTablist(el) {
        if (!el || _destroyed) return noop;
        _tablistEl = el;
        setAttr(el, "role", "tablist");
        setAttr(el, "aria-orientation", orientation);
        return () => {
            if (_tablistEl === el) {
                el.removeAttribute("role");
                el.removeAttribute("aria-orientation");
                _tablistEl = null;
            }
        };
    }

    function attachTab(el, key, tabOpts = {}) {
        if (!el || _destroyed) return noop;
        if (key == null) throw new Error("createTabs.attachTab: key is required");

        // Each tab gets a stable id used for aria-labelledby on its panel.
        if (!el.id) el.id = uniqueId("lh-tab");
        const entry = {
            el, key,
            id: el.id,
            panelId: null,    // filled in once the matching panel attaches
            disabled: !!tabOpts.disabled,
            // tracked for the disabled-sync below; we want to be able to
            // flip disabled at runtime without re-attaching
            _userDisabledAttr: el.hasAttribute("disabled"),
        };
        _tabs.push(entry);

        setAttr(el, "role", "tab");
        setAttr(el, "data-tab-key", String(key));
        if (entry.disabled) {
            setAttr(el, "aria-disabled", "true");
            try { el.disabled = true; } catch {}
        }
        // initial roving-tabindex: 0 if this is the active tab, else -1.
        // The reactive effect will re-set this whenever value changes;
        // we set it once here so the very first paint doesn't leave the
        // tab unreachable via Tab.
        const isActive = _value() === key;
        setAttr(el, "aria-selected", isActive ? "true" : "false");
        toggleAttr(el, "data-active", isActive);
        setAttr(el, "tabindex", isActive ? "0" : "-1");

        // If a panel for this key already attached, wire aria-controls.
        const panel = _panels.get(key);
        if (panel) {
            entry.panelId = panel.id;
            setAttr(el, "aria-controls", panel.id);
            setAttr(panel.el, "aria-labelledby", entry.id);
        }

        // Sync the roving-focus helper's internal index to the active
        // tab's position so the first arrow press advances from the
        // active tab, not from the helper's initial -1. Without this,
        // the first ArrowRight would "synchronize" rather than move.
        if (isActive) {
            const myIdx = _tabs.length - 1;
            if (roving.index !== myIdx) roving.setIndex(myIdx);
        }

        // Click activates (both automatic + manual modes -- click is
        // always explicit).
        const onClick = (e) => {
            if (entry.disabled) return;
            // synthetic clicks (e.g. from Enter/Space on the tab in
            // manual mode) come in with the same handler -- that's fine
            commitValue(key, "click");
        };
        // Manual activation: Enter/Space activates the currently-focused
        // tab. (In automatic mode, focus IS activation, so Enter/Space
        // would be a redundant operation -- but keypress on a button
        // already fires a synthetic click, so we don't need extra
        // handling.)
        const onKey = (e) => {
            if (entry.disabled) return;
            if (activation === "manual" && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                commitValue(key, "keyboard");
                return;
            }
            // Arrow / Home / End navigation -- delegate to roving-focus.
            // We only handle the axis-appropriate arrow keys here.
            const k = e.key;
            const horizontal = orientation === "horizontal";
            const isNext = horizontal ? (k === "ArrowRight") : (k === "ArrowDown");
            const isPrev = horizontal ? (k === "ArrowLeft")  : (k === "ArrowUp");
            if (isNext)       { e.preventDefault(); roving.move(+1); }
            else if (isPrev)  { e.preventDefault(); roving.move(-1); }
            else if (k === "Home") { e.preventDefault(); roving.first(); }
            else if (k === "End")  { e.preventDefault(); roving.last(); }
        };

        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKey);

        return () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            el.removeAttribute("role");
            el.removeAttribute("aria-selected");
            el.removeAttribute("aria-controls");
            el.removeAttribute("data-active");
            el.removeAttribute("data-tab-key");
            el.removeAttribute("tabindex");
            if (!entry._userDisabledAttr) el.removeAttribute("aria-disabled");
            const idx = _tabs.indexOf(entry);
            if (idx >= 0) _tabs.splice(idx, 1);
        };
    }

    function attachPanel(el, key) {
        if (!el || _destroyed) return noop;
        if (key == null) throw new Error("createTabs.attachPanel: key is required");

        if (!el.id) el.id = uniqueId("lh-tabpanel");
        const entry = { el, id: el.id };
        _panels.set(key, entry);

        setAttr(el, "role", "tabpanel");
        setAttr(el, "data-tab-key", String(key));
        // tabindex=0 so Tab from the active trigger reaches the panel,
        // which is the standard wai-aria APG pattern for tabpanels
        setAttr(el, "tabindex", "0");

        // Pair with tab if it's already attached
        let tabEntry = null;
        for (let i = 0; i < _tabs.length; i++) {
            if (_tabs[i].key === key) { tabEntry = _tabs[i]; break; }
        }
        if (tabEntry) {
            tabEntry.panelId = el.id;
            setAttr(tabEntry.el, "aria-controls", el.id);
            setAttr(el, "aria-labelledby", tabEntry.id);
        }

        // initial visibility from current value
        const isActive = _value() === key;
        toggleAttr(el, "data-active", isActive);
        if (!isActive) el.setAttribute("hidden", "");

        return () => {
            el.removeAttribute("role");
            el.removeAttribute("data-active");
            el.removeAttribute("data-tab-key");
            el.removeAttribute("aria-labelledby");
            el.removeAttribute("tabindex");
            el.removeAttribute("hidden");
            _panels.delete(key);
        };
    }

    // ---- public mutations -----------------------------------------------

    function setValue(key, reason) { commitValue(key, reason || "set"); }

    function setDisabled(key, flag) {
        for (let i = 0; i < _tabs.length; i++) {
            const t = _tabs[i];
            if (t.key !== key) continue;
            t.disabled = !!flag;
            if (flag) {
                setAttr(t.el, "aria-disabled", "true");
                try { t.el.disabled = true; } catch {}
            } else {
                t.el.removeAttribute("aria-disabled");
                try { t.el.disabled = false; } catch {}
            }
            // If we just disabled the active tab, fall back to the next
            // enabled tab so the UI isn't stranded on a disabled panel.
            if (flag && _value() === key) {
                for (let j = 0; j < _tabs.length; j++) {
                    const candidate = _tabs[(i + 1 + j) % _tabs.length];
                    if (!candidate.disabled) { commitValue(candidate.key, "disable-fallback"); break; }
                }
            }
            return;
        }
    }

    // Relative navigation helpers exposed for consumer convenience
    function next()  { roving.move(+1); }
    function prev()  { roving.move(-1); }
    function first() { roving.first(); }
    function last()  { roving.last(); }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopValuePaint();
        roving.destroy();
    }

    return {
        // signals
        value: () => _value(),

        // mutations
        setValue, setDisabled,
        next, prev, first, last,

        // lifecycle
        attachTablist, attachTab, attachPanel,
        destroy,
        get destroyed() { return _destroyed; },

        // introspection (used by tests + the wrapper)
        _tabs: () => _tabs.slice(),
        _activeIndex: () => {
            const v = _value();
            for (let i = 0; i < _tabs.length; i++) {
                if (_tabs[i].key === v) return i;
            }
            return -1;
        },
    };
}
