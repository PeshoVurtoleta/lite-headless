// @zakkster/lite-headless / alert-dialog
//
// An interruptive confirm / destroy dialog. This is createDialog() with the
// alert-dialog contract locked in:
//
//   - role="alertdialog" on the content (announced more assertively)
//   - modal: always true (an alert must trap and demand a decision)
//   - closeOnOutsideClick: false by default (a backdrop click must NOT be
//     an implicit "cancel" -- the user has to choose an action). Pass
//     `closeOnOutsideClick: true` to opt back into dismiss-on-backdrop.
//   - closeOnEscape: inherited (default true). Escape acts as cancel; pass
//     `closeOnEscape: false` for a hard confirm that cannot be escaped.
//
// Everything else -- the open/close state machine, focus trap, scroll lock,
// portal, attachTrigger/attachContent/attachTitle/attachDescription/attachClose,
// the painted data-open / data-status / data-placement attributes -- is
// identical to dialog. Same surface, same contract: an alert dialog IS a
// dialog with a stricter dismiss policy and a more assertive role.

import { createDialog } from "../dialog/index.js";

export function createAlertDialog(opts = {}) {
    const o = opts || {};
    return createDialog({
        ...o,
        role: "alertdialog",
        modal: true,
        // default closed-on-backdrop; explicit opt-in to dismiss
        closeOnOutsideClick: o.closeOnOutsideClick === true,
    });
}
