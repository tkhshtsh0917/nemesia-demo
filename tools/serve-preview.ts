/** Serves the exact built site under the project path used by Pages. */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";

const root = resolve(process.env.NEMESIA_PREVIEW_DIR ?? "dist");
const prefix = "/nemesia-demo/";
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
};
createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith(prefix)) {
    response.writeHead(404).end();
    return;
  }
  const path = resolve(root, url.pathname.slice(prefix.length) || "index.html");
  if (!path.startsWith(`${root}/`)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "Content-Length": info.size,
    });
    createReadStream(path)
      .on("error", () => response.destroy())
      .pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}).listen(Number(process.env.NEMESIA_PORT ?? 4198), "127.0.0.1");
