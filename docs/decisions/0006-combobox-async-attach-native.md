# ADR 0006: Combobox async is attach-native -- the primitive does not render; `setOptions` is `setQuery` + `generation()`

- Status: Accepted
- Date: 2026-09-07
- Scope: `src/combobox/index.js`, `src/_overlay/roving-focus.js`, the combobox
  async surface (filter / loading / onQueryChange / query / generation)
- Session: H10 (finding LH-04, the G-01 completion)

## Context

The H10 brief asks for `filter`, `loading`, `onQueryChange`, and "the
remote-options pattern -- `setOptions(next)` under generation semantics". Read
literally, `setOptions(next)` is a data-ingesting render method: hand the
primitive an array of option records and let it render/diff the listbox.

The combobox does not work that way and never has. It is **attach-model**: the
primitive owns no options-data array. Items are consumer-rendered DOM elements
registered via `attachItem(el, { value, label })`; the internal `_items[]` holds
only `{ el, id, value, label }` (now `+ hidden, gen`). The consumer owns
rendering; the primitive owns state, ARIA, keyboard, and highlight. This is the
same table-less-on-purpose philosophy the suite applies everywhere (the consumer
renders, the primitive coordinates).

## Decision

**`setOptions(next)` is NOT implemented.** Building a data-ingesting render
method would be a first for the package, would duplicate the consumer's
rendering, and would contradict the attach philosophy. Instead the async surface
is realized **attach-natively**, split across four small seams:

1. **`setQuery(str, reason)`** -- the no-DOM query entry. In LOCAL mode it runs
   the sync `filter` recompute; in REMOTE mode it bumps a generation counter and
   fires `onQueryChange(query, generation)`. `query` is a sealed `ReadSignal<string>`.
2. **`filter(entry, query) -> boolean`** -- LOCAL sync predicate, run per
   `setQuery` over `_items` once, zero-alloc: a reused visible-index buffer
   (`Int32Array`, grown by doubling on attach only), a dirty-check against
   `entry.hidden`, and a DOM write ONLY when visibility flips. Navigation skips
   hidden items (roving-focus `enabledIndices`).
3. **`onQueryChange(query, generation)`** -- REMOTE notification. The caller
   fetches (its IO, not ours) and applies results itself.
4. **`setLoading(bool)` / `loading`** -- a sealed `ReadSignal<boolean>` painted
   as `aria-busy` + `data-loading` on the listbox. `loading` NEVER blocks typing
   or dismiss.

`filter` (local) and `onQueryChange` (remote) are **mutually exclusive** --
supplying both is a construction `TypeError`. Async filtering IS the remote
pattern; a sync predicate that also fires a remote callback is incoherent.

## The generation / stale-commit law

An async replace is a race: fetch A is dispatched, the user types again, fetch B
is dispatched and applied, then fetch A resolves late. A commit resolved against
fetch A's (superseded) option set must never select a value the user is no
longer looking at (the lite-form S3 stale-seq law, transposed).

- `_generation` is a plain integer counter, starts 0, bumped `(_generation + 1) | 0`
  on each REMOTE `setQuery`. `generation()` returns it -- a plain read, NOT a
  signal: it is a guard token, not reactive state.
- `attachItem` stamps `entry.gen = _generation` at attach time.
- `selectIndex(idx)` is generation-guarded: if `_items[idx].gen !== _generation`
  the select is a **no-op** -- the item belongs to a superseded option set.
- The caller's own guard is `if (combo.generation() === myGen) { ...apply... }`
  around its fetch-resolve render (documented in
  `docs/recipes/combobox-remote-options.md`). Belt and suspenders: even without
  the caller guard, a select against a superseded-gen item is already dead.

In LOCAL (filter) and no-async mode `_generation` never advances past 0, every
`entry.gen` is 0, so the `selectIndex` guard is vacuously true and the
single-select hot paths are byte-unchanged. `onQueryChange` is not re-entrant: a
`setQuery` inside the callback does not re-fire it in the same tick (a
`_inQueryChange` latch).

## Highlight-preservation across a replace (tested truth table)

- The highlighted VALUE still exists in the new set -> preserved by value
  identity (the caller re-attaches; the roving index is clamped by
  `attachItem`'s off path as today).
- Gone -> reset to the first ENABLED (non-hidden, non-disabled) item.
- Empty visible set -> no highlight (-1).

## Consequences

- The public surface grows additively: `setQuery`, `query`, `filter`,
  `onQueryChange`, `setLoading`, `loading`, `generation`, `attachInput`. The
  `selectIndex` generation guard is a behavior flip (a minor), named in the
  CHANGELOG; it is inert unless a remote replace has advanced the counter.
- `roving-focus.js` `enabledIndices` gains one `&& !items[i].hidden` clause. It
  is a shared file; menu/tree/etc. never set `hidden`, so the clause is inert for
  them (a `hidden` read is `undefined` -> falsy). Do NOT overload `disabled` for
  hidden -- different ARIA meaning.
- The E8 torture window (ENGINE, gated `<= 16384 B / 50000 ops`) witnesses the
  filter recompute's zero-alloc claim: two `setQuery` calls per op over a fixed
  32-item set whose predicate matches the SAME visible set both times (no flip ->
  no DOM paint -> pure compute); a filter-call counter proves the predicate ran.
- The D5 torture window (DOM recorded, pinned ratchet) exercises the
  option-replace churn (setQuery -> detach all -> attach a fresh gen-stamped
  batch -> setLoading toggle); a generation-advanced assertion is its
  dishonest-window guard.
- No fetching lives in the package. `@zakkster/lite-query` is the RECIPE devDep,
  not a dependency: callers own IO.

## Revisit trigger

If a maintainer wants a genuine data-model `setOptions(next)` (the primitive
ingests option records and renders/diffs the listbox itself), that is a
departure from the attach philosophy and a separate, escalated decision -- do
not build both surfaces.
