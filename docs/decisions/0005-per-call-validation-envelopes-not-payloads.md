# ADR 0005: Per-call fail-closed validation applies to option envelopes, not to wholesale data payloads

- Status: Accepted
- Date: 2026-09-07
- Scope: every per-call method that takes an options/record bag (LH-02 / the
  H-04b completion)
- Session: H9 (finding LH-02)

## Context

Construction bags (`createXxx(options)`) fail closed: an unknown key throws a
TypeError with a did-you-mean hint (`src/_validate.js` `checkOptions`). LH-02
records that per-call METHOD bags did not, and H9 extends the same contract to
them via a zero-alloc variant (`checkOptionsHot`).

Enumerating the per-call bags revealed two structurally different kinds, and the
fail-closed law does not apply to both the same way:

- **Option envelopes.** The method reads a fixed set of keys, builds a fixed
  internal record, and DROPS anything else. An unknown key here is a
  silently-lost configuration typo -- exactly the bug class this suite exists to
  kill. Examples: `toast.show` (id/urgent/duration/dismissible/announce) and its
  `update`, `notificationCenter.add`/`update` (normalizeNotification builds
  `{id,title,body,kind,timestamp,read,meta}`), `tour.addStep`
  (`{id,target,contentEl,title,description}`), and the per-item attach* config
  bags `sortable.attachRoot`/`attachItem`, `carousel.attachRoot`/`attachSlide`,
  `tree.attachNode`, `datepicker.attachMonthLabel`.
- **Wholesale data payloads.** The method STORES the caller's object verbatim and
  hands it back through the read surface. Extra keys are the CONSUMER'S data, not
  ignored input, and passthrough is the documented contract. Examples:
  `kanban.addColumn`/`addCard`/`updateCard` (`_columns`/`_cards` store the object
  and return it via `columns()`/`cards()`/`getCard()`), `commandPalette.register`
  (`_commands.set(cmd.id, cmd)` and the command is returned in `results()`).

## Options

### A. Validate every per-call bag, payloads included

Rejected. It would BREAK documented passthrough. A consumer who writes
`addCard({ id, columnId, title, assignee, priority })` or
`register({ id, label, run, icon, badge })` relies on the extra keys surviving
and being read back. Rejecting them is a behavior regression, not a fix -- and
nothing was being "silently ignored" in the first place, because the consumer
reads those keys back.

### B. Validate option envelopes only; leave payloads with required-presence guards

Chosen. The dividing principle: **validate a per-call bag if and only if the
method builds a fixed record and drops extras.** Wholesale-stored payloads keep
their existing required-presence throws (`kanban` needs `col.id` / `card.id` /
`card.columnId`; `register` needs an object with `id` and `label`) and are NOT
key-validated. The instructive middle case is `notificationCenter`: it validates
its envelope AND exposes `meta` as the sanctioned free-form channel -- so a typo
in an envelope key is caught while real app data has an explicit home.

### C. Add a `data`/`meta` escape hatch to the payload primitives, then validate the rest of their keys

Rejected for H9. Adding a field is a new option -- an API addition, which is a
non-goal this session -- and it still changes the current wholesale-passthrough
contract. If a payload primitive ever grows a fixed-envelope mode, that mode's
keys can be validated then (see revisit trigger).

## Consequences

- Validated (unknown key -> TypeError did-you-mean; null/array/non-object ->
  TypeError; omitted -> legal): `toast.show`, `toast.update`,
  `notificationCenter.add`, `notificationCenter.update`, `tour.addStep`,
  `sortable.attachRoot`, `sortable.attachItem`, `carousel.attachRoot`,
  `carousel.attachSlide`, `tree.attachNode`, `datepicker.attachMonthLabel`
  (the last skips validation when its `opts` argument is a function, a
  documented back-compat form).
- Deliberately NOT key-validated (wholesale data payloads; required-presence
  guards unchanged): `kanban.addColumn`, `kanban.addCard`, `kanban.updateCard`,
  `commandPalette.register`.
- `checkOptionsHot` is the zero-alloc validator for these paths: a guarded
  `for...in` (own-key `hasOwnProperty` check) with no `Object.keys` array and no
  spread on the success path, witnessed at 0 B/op by the H8 transient lane.
- Null handling is UNIFORM across construction and per-call bags: `undefined`
  (or an omitted bag) is legal and means "no options / defaults"; `null`, an
  array, or any non-object throws a TypeError. Three validated sites had
  pre-existing falsy short-circuits (`toast.show`'s `opts = opts || {}`,
  `tour.addStep`'s `if (!step)`, `notificationCenter.update`'s `if (!partial)`)
  that swallowed `null`; H9 moves the `checkOptionsHot` call ahead of each so
  `null` fails closed there too, matching `checkOptions` and the suite law
  ("null is not zero"). This also removes an intra-primitive split where
  `notificationCenter.add(null)` threw while `update(id, null)` silently
  no-op'd (the H9 reviewer NIT).

## Revisit trigger

If a wholesale-payload primitive (`kanban`, `command-palette`) later gains a
fixed-envelope option surface distinct from its stored data, validate that
envelope's known keys and route free-form data through an explicit field, as
`notificationCenter.meta` already does.
