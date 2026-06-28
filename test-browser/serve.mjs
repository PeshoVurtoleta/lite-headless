// Minimal static server for the playwright harness. Zero deps.
// Serves files from the repo root so fixtures can import `../../src/...`.
//
// node test-browser/serve.mjs            -> listens on 0.0.0.0:5173
// PORT=5174 node test-browser/serve.mjs  -> custom port

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = parseInt(process.env.PORT || "5173", 10);

// Map file extensions to Content-Type. Crucially `.js` and `.mjs` must be
// `application/javascript` so the browser treats them as ESM modules.
const MIME = {
    ".html":  "text/html; charset=utf-8",
    ".htm":   "text/html; charset=utf-8",
    ".js":    "application/javascript; charset=utf-8",
    ".mjs":   "application/javascript; charset=utf-8",
    ".css":   "text/css; charset=utf-8",
    ".json":  "application/json; charset=utf-8",
    ".svg":   "image/svg+xml",
    ".png":   "image/png",
    ".ico":   "image/x-icon",
    ".txt":   "text/plain; charset=utf-8",
    ".md":    "text/markdown; charset=utf-8",
};

const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]);

    // `/` -> demo entry. All other paths are served from the repo root as-is so
    // playwright fixtures at /test-browser/fixtures/* and sources at /src/* and
    // /node_modules/* all resolve correctly. (Earlier versions prepended /demo
    // to everything, which broke the test harness.)
    if (url === "/") {
        url = "/demo/index.html";
    }

    const filePath = path.normalize(path.join(ROOT, url));
    // Path traversal guard
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end("forbidden"); return;
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("not found: " + url);
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || "application/octet-stream";
        res.writeHead(200, {
            "Content-Type": type,
            "Cache-Control": "no-cache",
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, "127.0.0.1", () => {
    console.log("[lite-headless test-browser] http://127.0.0.1:" + PORT);
    console.log("                              serving " + ROOT);
});

// playwright's webServer waits for the port to listen; once that happens
// it kills this process via SIGTERM at end-of-run.
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT",  () => server.close(() => process.exit(0)));
