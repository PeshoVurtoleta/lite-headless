// @zakkster/lite-headless / checkbox-group
//
// Aggregate of member checkboxes with a DERIVED tri-state. The group's own
// "all / none / some" state is NEVER stored as an aggregate that can drift from
// its members -- it is computed on read from the members' live signals (ADR
// 0008 ruling 2/3). A "select all" master derives "mixed" when members are
// partial; setting the master sets every member.
//
// PEER FLOOR (ADR 0008 ruling 3). Each member's per-member record AND its own
// createCheckbox are allocated at register() time -- an imperative call the
// consumer makes OUTSIDE any live tracking context / effect. No member signal
// is ever lazily allocated inside a running effect, so the LF-04 zombie-signal
// class is not reachable and the lite-signal ^1.2.0 peer floor is NOT raised.
//
// API
//
//   createCheckboxGroup({
//       disabled?: false,
//       required?: false,
//       onChange?: (values, reason) => void,   // values = array of checked
//   })
//
//   register(value, options?)   // -> { checkbox, off }; allocates the member
//                               //    createCheckbox HERE (never in an effect)
//   attachMaster(el)            // role=checkbox select-all; paints group state
//   state()                     // "true" | "false" | "mixed" (DERIVED)
//   value()                     // array of checked member values
//   setAll(bool, reason?)       // setChecked on every member
//   setDisabled(bool)
//   destroy()
//
// CSS CONTRACT
//
//   Master gets:
//     aria-checked="true|false|mixed"   -- painted straight from state()
//     data-checked                      -- present when all members checked
//     data-indeterminate                -- present when partial (mixed)
//     data-disabled                     -- present when disabled

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { sealSignal } from "../_overlay/seal.js";
import { setAttr, toggleAttr, uniqueId } from "../_overlay/aria.js";
import { checkOptions, checkOptionsHot } from "../_validate.js";
import { createCheckbox } from "../checkbox/index.js";

const OPTION_KEYS = "disabled|required|onChange";
const MEMBER_KEYS = "defaultChecked|defaultIndeterminate|disabled";

const noop = () => {};
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

export function createCheckboxGroup(options = {}) {
    checkOptions("createCheckboxGroup", options, OPTION_KEYS);
    const {
        disabled: initiallyDisabled = false,
        required = false,
        onChange,
    } = options;

    // Members registry. Each entry: { value, checkbox }. NEVER a stored
    // aggregate -- state()/value() derive from the members' live signals.
    const _members = [];
    // `let`: destroy() seals these (H-12). _rev bumps on membership change so a
    // reactive reader (the master paint) re-reads the member set; _disabled is
    // the group-wide disabled flag.
    let _rev = makeSignal(0);
    let _disabled = makeSignal(!!initiallyDisabled);
    let _destroyed = false;
    let _masterEl = null;
    let _masterOff = null;
    // setAll / master flips every member; without this a select-all would fire the
    // group onChange once PER member (N chatty callbacks with growing arrays). The
    // batch suppresses per-member firing and emits ONE onChange at the end.
    let _batching = false;

    // ----- derived state (never stored) ------------------------------
    // Reads _rev() (membership) + each member's checked()/indeterminate()
    // (their own signals), so a reader inside an effect re-runs on any change.
    function state() {
        _rev();
        const n = _members.length;
        if (n === 0) return "false";
        let allTrue = true, allFalse = true;
        for (let i = 0; i < n; i++) {
            const m = _members[i].checkbox;
            if (m.indeterminate()) return "mixed";
            if (m.checked()) allFalse = false;
            else allTrue = false;
        }
        if (allTrue) return "true";
        if (allFalse) return "false";
        return "mixed";
    }

    function value() {
        _rev();
        const out = [];
        for (let i = 0; i < _members.length; i++) {
            if (_members[i].checkbox.checked()) out.push(_members[i].value);
        }
        return out;
    }

    // ----- register a member ----------------------------------------
    function register(memberValue, memberOptions) {
        if (_destroyed) return { checkbox: null, off: noop };
        checkOptionsHot("createCheckboxGroup.register", memberOptions, MEMBER_KEYS);
        const mo = memberOptions || {};
        // Allocate the member's own checkbox HERE (imperative, outside any
        // effect) -- the peer-floor guarantee (ADR 0008 ruling 3).
        const checkbox = createCheckbox({
            defaultChecked: !!mo.defaultChecked,
            defaultIndeterminate: !!mo.defaultIndeterminate,
            disabled: mo.disabled != null ? !!mo.disabled : _disabled(),
            onChange: (_checked, reason) => {
                if (_batching) return;   // setAll emits one group onChange at the end
                if (onChange) {
                    try { onChange(value(), reason || "member"); } catch { /* swallow */ }
                }
            },
        });
        const entry = { value: memberValue, checkbox };
        _members.push(entry);
        _rev.set(_rev.peek() + 1);

        let _off = false;
        function off() {
            if (_off) return;
            _off = true;
            const idx = _members.indexOf(entry);
            if (idx !== -1) _members.splice(idx, 1);
            // pool-return the member's signal nodes on removal (H-12)
            checkbox.destroy();
            if (!_destroyed) _rev.set(_rev.peek() + 1);
        }
        return { checkbox, off };
    }

    // ----- select-all ------------------------------------------------
    function setAll(next, reason) {
        if (_destroyed) return;
        const v = !!next;
        _batching = true;
        let changed = false;
        for (let i = 0; i < _members.length; i++) {
            if (_members[i].checkbox.setChecked(v, reason || "master")) changed = true;
        }
        _batching = false;
        if (changed && onChange) {
            try { onChange(value(), reason || "master"); } catch { /* swallow */ }
        }
    }

    function setDisabled(flag) {
        if (_destroyed) return;
        const v = !!flag;
        if (_disabled() !== v) _disabled.set(v);
        for (let i = 0; i < _members.length; i++) _members[i].checkbox.setDisabled(v);
    }

    // ----- attachMaster (select-all) ---------------------------------
    function attachMaster(el) {
        if (!el || _destroyed) return noop;
        _masterEl = el;
        if (!el.id) el.id = uniqueId("lh-checkbox-master");
        setAttr(el, "role", "checkbox");
        if (required) setAttr(el, "aria-required", "true");
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");

        function activate() {
            if (_disabled()) return;
            // all-on -> clear; anything else -> turn all on.
            setAll(state() !== "true", "master");
        }
        const onClick = (e) => { e.preventDefault(); activate(); };
        const onKey = (e) => {
            if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); activate(); }
        };
        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKey);

        const stop = effect(() => {
            const s = state();
            const d = _disabled();
            setAttr(el, "aria-checked", s);
            toggleAttr(el, "data-checked", s === "true");
            toggleAttr(el, "data-indeterminate", s === "mixed");
            if (d) setAttr(el, "aria-disabled", "true");
            else   removeAttr(el, "aria-disabled");
            toggleAttr(el, "data-disabled", d);
        });

        _masterOff = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            stop();
            removeAttr(el, "role");
            removeAttr(el, "aria-checked");
            removeAttr(el, "aria-required");
            removeAttr(el, "aria-disabled");
            removeAttr(el, "data-checked");
            removeAttr(el, "data-indeterminate");
            removeAttr(el, "data-disabled");
            if (_masterEl === el) _masterEl = null;
            _masterOff = null;
        };
        return _masterOff;
    }

    // ----- destroy ---------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        if (_masterOff) { try { _masterOff(); } catch { /* swallow */ } }
        // pool-return every member's signal nodes (H-12)
        for (let i = 0; i < _members.length; i++) {
            try { _members[i].checkbox.destroy(); } catch { /* swallow */ }
        }
        _members.length = 0;
        _masterEl = null;
        _rev = sealSignal(_rev);
        _disabled = sealSignal(_disabled);
    }

    return {
        // reactive / derived
        state,
        value,
        disabled: () => _disabled(),
        // mutations
        register, setAll, setDisabled,
        // attachments
        attachMaster,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
        get memberCount() { return _members.length; },
    };
}
