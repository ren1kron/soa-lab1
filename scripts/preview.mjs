import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../dist/", import.meta.url);
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4400);
const files = new Map([
  ["index.html", "text/html; charset=utf-8"],
  ["openapi.yaml", "application/yaml; charset=utf-8"],
  ["swagger.css", "text/css; charset=utf-8"],
  ["swagger-initializer.js", "text/javascript; charset=utf-8"],
  ["vendor/swagger-ui.css", "text/css; charset=utf-8"],
  ["vendor/swagger-ui-bundle.js", "text/javascript; charset=utf-8"],
  ["vendor/swagger-ui-bundle.js.LICENSE.txt", "text/plain; charset=utf-8"],
  ["vendor/favicon-32x32.png", "image/png"],
  ["vendor/LICENSE", "text/plain; charset=utf-8"],
  ["vendor/NOTICE", "text/plain; charset=utf-8"]
]);
await readFile(new URL("index.html", root)).catch(() => {
  throw new Error(`Documentation has not been built in ${fileURLToPath(root)}. Run npm run build first.`);
});
const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let path;
  try {
    path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).slice(1) || "index.html";
  } catch {
    response.writeHead(400).end();
    return;
  }
  // A second mount verifies relative assets under a Helios-style user directory.
  if (path.startsWith("~student/soa-lab1/")) path = path.slice("~student/soa-lab1/".length) || "index.html";
  if (!files.has(path)) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const body = await readFile(new URL(path, root));
    response.writeHead(200, { "Content-Type": files.get(path), "Content-Length": body.length, "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.on("error", error => {
  console.error(error.code === "EADDRINUSE" ? `Port ${port} is occupied. Use PORT=${port + 1} npm run preview.` : error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`Swagger UI: http://${host}:${port}/`));
