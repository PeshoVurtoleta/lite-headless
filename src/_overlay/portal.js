// @zakkster/lite-headless / _overlay / portal.js
//
// Portal helper: move `content` into `container`, return a function that
// restores it to its original position. Captures the original parent + next
// sibling at portal-time and uses insertBefore on restore so siblings stay in
// order even if the original position was deep inside a list.
//
// Designed to play well with lite-element's reparent survival: a portaled
// dialog is just a synchronous reparent away from its original parent, so
// state inside the content stays alive across the move.

export function portal(content, container) {
    if (!content || !container) return () => {};
    if (typeof container === "string") {
        if (typeof document === "undefined") return () => {};
        container = document.querySelector(container);
        if (!container) return () => {};
    }
    if (content.parentNode === container) {
        // already there -- no-op restore
        return () => {};
    }

    const originalParent = content.parentNode;
    const originalNext = content.nextSibling;

    container.appendChild(content);

    let restored = false;
    return function restore() {
        if (restored) return;
        restored = true;
        if (!originalParent) {
            // wasn't in the DOM originally; just remove from container
            if (content.parentNode === container) container.removeChild(content);
            return;
        }
        // re-insert at original position
        if (originalNext && originalNext.parentNode === originalParent) {
            originalParent.insertBefore(content, originalNext);
        } else {
            originalParent.appendChild(content);
        }
    };
}
