import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = (script, args = [], env = {}) => spawnSync(process.execPath, [script, ...args], {
  cwd: root, encoding: "utf8", env: { ...process.env, ORGANIZATION_API_URL: "", MANAGER_API_URL: "", ...env }
});

test("configured build changes only server defaults and retains exact integer limits", async () => {
  const sourceBefore = await readFile(new URL("../openapi.yaml", import.meta.url), "utf8");
  try {
    const result = run("scripts/build.mjs", [], {
      ORGANIZATION_API_URL: "https://api.example.test/collection/",
      MANAGER_API_URL: "https://api.example.test/manager/"
    });
    assert.equal(result.status, 0, result.stderr);
    const built = YAML.parse(await readFile(new URL("../dist/openapi.yaml", import.meta.url), "utf8"), { intAsBigInt: true });
    assert.equal(built.servers[0].variables.baseUrl.default, "https://api.example.test/collection");
    for (const [path, item] of Object.entries(built.paths)) {
      if (path.startsWith("/orgmanager/")) assert.equal(item.post.servers[0].variables.baseUrl.default, "https://api.example.test/manager");
    }
    assert.equal(built.components.schemas.PositiveId.maximum, 9223372036854775807n);
    assert.equal(built.components.schemas.Location.properties.x.minimum, -9223372036854775808n);
    const source = YAML.parse(sourceBefore, { intAsBigInt: true });
    built.servers = source.servers;
    for (const path of Object.keys(source.paths).filter(path => path.startsWith("/orgmanager/"))) {
      built.paths[path].post.servers = source.paths[path].post.servers;
    }
    assert.deepEqual(built, source);
    assert.equal(await readFile(new URL("../openapi.yaml", import.meta.url), "utf8"), sourceBefore);
  } finally {
    const result = run("scripts/build.mjs");
    assert.equal(result.status, 0, result.stderr);
  }
});

test("deployment dry run prints commands without connecting and rejects unsafe destinations", () => {
  const env = {
    HELIOS_HOST: "helios.example.invalid", HELIOS_USER: "student", HELIOS_PORT: "2222",
    HELIOS_WEB_DIR: "public_html/soa-lab1", HELIOS_PUBLIC_URL: "https://example.invalid/~student/soa-lab1/"
  };
  const result = run("scripts/deploy.mjs", ["--dry-run"], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /'ssh' '-p' '2222' 'student@helios.example.invalid'/);
  assert.match(result.stdout, /'scp' '-P' '2222' '-r'/);
  assert.match(result.stdout, /no SSH connection or upload was performed/);
  for (const invalid of [
    { HELIOS_HOST: "-oProxyCommand=bad" }, { HELIOS_USER: "student;bad" },
    { HELIOS_WEB_DIR: "public_html/../other" }, { HELIOS_WEB_DIR: "public_html/$(bad)" },
    { HELIOS_WEB_DIR: "" }, { HELIOS_PORT: "0" }, { HELIOS_PORT: "65536" }
  ]) {
    const rejected = run("scripts/deploy.mjs", ["--dry-run"], { ...env, ...invalid });
    assert.notEqual(rejected.status, 0);
    assert.equal(rejected.stdout, "");
  }
});
