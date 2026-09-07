# ADR 0008: Canon primitives -- select consumes the shared overlay seams, checkbox tri-state is ONE 3-valued signal

- Status: Accepted
- Date: 2026-09-07
- Scope: `src/select/`, `src/checkbox/`, `src/checkbox-group/`,
  `src/_overlay/*` (consumed, NOT modified), the H8 torture ledger (E9/E10/D6/D7)
- Session: H12 (finding LH-07, the two defensible catalog absences)

## Context

The catalog's NOT-FOR list must be the only honest answer to "why is X missing"
for any pattern a Radix / Ark / Headless-UI user would ask about. Two absences
were not defensible: **select** (the APG "select-only combobox" / listbox-button
pattern -- what combobox deliberately is NOT, because combobox is the editable
pattern) and **checkbox + group + indeterminate** (tri-state as real STATE, not
a painted attribute; two recipes hand-rolled it around native inputs).

## Decisions

### 1. Select reuse = consume the shared `_overlay` helpers directly

`createSelect` composes the SAME seams combobox composes -- `createOverlayCore`,
`createRovingFocus(STRATEGY_ACTIVE_DESCENDANT)`, `bindEscape` / `bindOutsideClick`,
`createPositioner`, `portal`, and the `aria` id/IDREF helpers -- and drops the
editable-input lane entirely: no `role=combobox`, no query signal, no filter, no
`onQueryChange`, no `attachInput`. The trigger is a `role=button` with
`aria-haspopup=listbox`; the popup is `role=listbox`; items are `role=option`
with `aria-selected`; the highlight rides `aria-activedescendant`.

**No extraction. No combobox edit.** The seams are already factored into
`_overlay/`; extracting a "shared listbox" module would churn a byte-stable
primitive (combobox) for no gain and put its full suite + torture E1/D5 at risk.
Select is a sibling consumer of the same helpers, nothing more. `src/combobox/*`
is byte-identical after this session (assertion A7).

### 2. Checkbox tri-state = ONE 3-valued signal painted straight into aria-checked

The state model is a single signal `_state in {"true","false","mixed"}`. Those
three tokens ARE the `aria-checked` values -- the paint effect writes
`aria-checked = _state()` with no mapping branch. The public surface mirrors
switch's naming and adds the tri-state read:

- `checked()` -> boolean (`_state() === "true"`)
- `indeterminate()` -> boolean (`_state() === "mixed"`)
- `setChecked(bool, reason?)`, `setIndeterminate(bool, reason?)`, `toggle(reason?)`

`toggle()` follows APG: `mixed` -> `true`, `false` -> `true`, `true` -> `false`
(indeterminate becomes checked on user toggle). One source of truth means the
derived booleans can never disagree with the painted attribute -- the whole
reason to reject the boolean-checked + boolean-indeterminate pair, which can be
set to the incoherent (`checked: true`, `indeterminate: true`) combination.

### 3. Peer floor stays `^1.2.0` (LH-09 not reachable)

`createCheckboxGroup` allocates each member's per-member record and the member's
own `createCheckbox` at `register()` time -- an imperative call the consumer
makes OUTSIDE any live tracking context / effect. It never lazily allocates a
member signal INSIDE a running effect, so the LF-04 zombie-signal class (a signal
born in a tracking context that outlives it) is not reachable and the
owner-API lite-signal version is not needed. The floor is NOT raised.

### 4. Context-menu: RECORDED OUT

A position-at-pointer context-menu slice cannot land on the existing `menu`
primitive without a new trigger layer (a contextmenu-event -> position-at-pointer
adapter that `menu` has no seam for). It is out of H12 scope: not additive-cheap,
and it would bend menu's contract. Ship nothing.

### 5. Multi-select on select: DEFERRED as LH-12

Single-select is H12 scope. Multi-select does not fall out of the shared
internals cheaply: the roving / active-descendant single-selection model differs
from a membership Set, and combobox's `multiple` lane carries chip/backspace
machinery that select's button trigger has no analogue for. Recorded as LH-12 in
the roadmap findings at session close; not silently dropped.

### 6. bulk-actions-bar: NOT a checkbox hand-roll (reproduce result)

`docs/recipes/bulk-actions-bar.md` wires row selection through native
`<input type=checkbox>` + a derived `computed` for count / `hasSelection`; its
"select all" is not a hand-rolled indeterminate primitive. It is therefore NOT on
the shared-law-5 refactor list. Only `tree-checkbox-cascade.md` and
`textarea-autosize-and-indeterminate-checkbox.md` refactor downward onto the new
primitives. (Confirmed by reading the recipe: the indeterminate select-all lives
in `textarea-autosize-and-indeterminate-checkbox.md`, not here.)

## Consequences

- Three new factories: `createSelect`, `createCheckbox`, `createCheckboxGroup`
  (primitive count 59 -> 62).
- Four new torture windows enter the H8 ledger: E9 (select highlight, ENGINE
  gated), E10 (checkbox toggle, ENGINE gated), D6 (select open/close, DOM
  recorded), D7 (checkbox attached paint, DOM recorded).
- `destroy()` seals every factory-owned signal (H-12) and pool-returns per-item /
  per-member nodes on their removal path, so churned create/destroy runs
  indefinitely on the default 1024-node registry.
</content>
</invoke>
