// @zakkster/lite-headless / result / element.js
//
// <lite-result status="404">
//     <div data-result-icon>📭</div>
//     <h2 data-result-title>Page not found</h2>
//     <p data-result-subtitle>The page you're looking for doesn't exist.</p>
//     <div data-result-actions>
//         <button>Go home</button>
//     </div>
// </lite-result>

import { define } from "@zakkster/lite-element";
import { createResult } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, sel) {
    const matches = host.querySelectorAll(sel);
    for (let i = 0; i < matches.length; i++) {
        if (belongsToHost(matches[i], host)) return matches[i];
    }
    return null;
}

define("lite-result", (host, scope) => {
    const r = createResult({
        status: host.getAttribute("status") || "info",
    });
    const offRoot = r.attachRoot(host);

    let _iconEl = null, _iconOff = null;
    let _titleEl = null, _titleOff = null;
    let _subtitleEl = null, _subtitleOff = null;
    let _actionsEl = null, _actionsOff = null;

    function syncSlots() {
        const icon = scopedQuery(host, "[data-result-icon]");
        if (icon !== _iconEl) {
            if (_iconOff) _iconOff();
            _iconEl = icon;
            _iconOff = icon ? r.attachIcon(icon) : null;
        }
        const title = scopedQuery(host, "[data-result-title]");
        if (title !== _titleEl) {
            if (_titleOff) _titleOff();
            _titleEl = title;
            _titleOff = title ? r.attachTitle(title) : null;
        }
        const subtitle = scopedQuery(host, "[data-result-subtitle]");
        if (subtitle !== _subtitleEl) {
            if (_subtitleOff) _subtitleOff();
            _subtitleEl = subtitle;
            _subtitleOff = subtitle ? r.attachSubtitle(subtitle) : null;
        }
        const actions = scopedQuery(host, "[data-result-actions]");
        if (actions !== _actionsEl) {
            if (_actionsOff) _actionsOff();
            _actionsEl = actions;
            _actionsOff = actions ? r.attachActions(actions) : null;
        }
    }
    syncSlots();
    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    host._resultInstance = r;
    Object.defineProperty(host, "status", { get: () => r.status, configurable: true });

    return () => {
        mo.disconnect();
        if (_iconOff) _iconOff();
        if (_titleOff) _titleOff();
        if (_subtitleOff) _subtitleOff();
        if (_actionsOff) _actionsOff();
        offRoot();
        r.destroy();
    };
});
