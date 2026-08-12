import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";

const port = Number(process.argv[2] || 8793);
const host = process.argv[3] || "127.0.0.1";
const root = resolve(process.cwd());

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

function resolveRequest(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  } catch {
    return null;
  }
  const candidate = normalize(join(root, pathname === "/" ? "index.html" : pathname));
  const resolved = resolve(candidate);
  const relativePath = relative(root, resolved);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) return null;
  if (!existsSync(resolved)) return null;
  const stat = statSync(resolved);
  if (stat.isDirectory()) {
    const index = join(resolved, "index.html");
    return existsSync(index) ? index : null;
  }
  return resolved;
}

const server = createServer((req, res) => {
  const file = resolveRequest(req.url || "/");
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "content-type": types.get(extname(file)) || "application/octet-stream",
    "cache-control": "no-store"
  });
  createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Facet Carver preview: http://${host}:${port}/`);
});
