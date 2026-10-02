import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist");
const require = createRequire(import.meta.url);
const vendor = dirname(require.resolve("swagger-ui-dist/package.json"));

function apiUrl(name, fallback) {
  const value = process.env[name] || fallback;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new Error(`${name} must be an absolute HTTP(S) URL without credentials, query or fragment.`);
  }
  return value.replace(/\/+$/, "");
}

const spec = YAML.parse(await readFile(join(root, "openapi.yaml"), "utf8"));
const collectionUrl = apiUrl("ORGANIZATION_API_URL", "http://localhost:8080");
const managerUrl = apiUrl("MANAGER_API_URL", "http://localhost:8081");
spec.servers[0].variables.baseUrl.default = collectionUrl;
for (const [path, item] of Object.entries(spec.paths)) {
  if (path.startsWith("/orgmanager/")) item.post.servers[0].variables.baseUrl.default = managerUrl;
}

await mkdir(join(output, "vendor"), { recursive: true });
for (const name of ["index.html", "swagger.css", "swagger-initializer.js"]) {
  await copyFile(join(root, name), join(output, name));
}
if (collectionUrl === "http://localhost:8080" && managerUrl === "http://localhost:8081") {
  await copyFile(join(root, "openapi.yaml"), join(output, "openapi.yaml"));
} else {
  const document = YAML.parseDocument(await readFile(join(root, "openapi.yaml"), "utf8"), { intAsBigInt: true });
  document.setIn(["servers", 0, "variables", "baseUrl", "default"], collectionUrl);
  for (const path of Object.keys(spec.paths).filter(path => path.startsWith("/orgmanager/"))) {
    document.setIn(["paths", path, "post", "servers", 0, "variables", "baseUrl", "default"], managerUrl);
  }
  await writeFile(join(output, "openapi.yaml"), document.toString());
}
for (const name of ["swagger-ui.css", "swagger-ui-bundle.js", "swagger-ui-bundle.js.LICENSE.txt", "favicon-32x32.png", "LICENSE", "NOTICE"]) {
  await copyFile(join(vendor, name), join(output, "vendor", name));
}
console.log(`Built ${output}`);
console.log(`Collection API: ${collectionUrl}\nManager API: ${managerUrl}`);
