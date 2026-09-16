import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dryRun = process.argv.includes("--dry-run");
const unknown = process.argv.slice(2).filter(arg => arg !== "--dry-run");
if (unknown.length) throw new Error(`Unknown argument: ${unknown.join(", ")}`);
const host = process.env.HELIOS_HOST;
const user = process.env.HELIOS_USER;
const port = process.env.HELIOS_PORT || "22";
const directory = process.env.HELIOS_WEB_DIR;
const publicUrl = process.env.HELIOS_PUBLIC_URL;
if (!host || !user || !directory) {
  throw new Error("Set HELIOS_HOST, HELIOS_USER and HELIOS_WEB_DIR. Optionally set HELIOS_PORT and HELIOS_PUBLIC_URL. Use --dry-run to inspect commands without connecting.");
}
if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host) || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(user)) {
  throw new Error("Use a plain hostname (or SSH alias) and username.");
}
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("Invalid HELIOS_PORT.");
if (!/^\/?[a-zA-Z0-9_][a-zA-Z0-9_./-]*$/.test(directory) || directory.split("/").some(part => part === ".." || part === ".")) {
  throw new Error("HELIOS_WEB_DIR must be an absolute or home-relative path containing letters, numbers, underscores, dots, dashes and slashes, without . or .. segments. Do not use ~.");
}
if (publicUrl && !["http:", "https:"].includes(new URL(publicUrl).protocol)) throw new Error("HELIOS_PUBLIC_URL must use HTTP(S).");
const source = fileURLToPath(new URL("../dist/", import.meta.url));
await access(new URL("../dist/index.html", import.meta.url));
const destination = `${user}@${host}`;
const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
const commands = [
  ["ssh", ["-p", port, destination, `mkdir -p '${directory}'`]],
  ["scp", ["-P", port, "-r", `${source}.`, `${destination}:${directory}/`]]
];
for (const [command, args] of commands) {
  console.log([command, ...args].map(quote).join(" "));
  if (!dryRun) {
    const result = spawnSync(command, args, { stdio: "inherit", shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
if (dryRun) console.log("Dry run: no SSH connection or upload was performed.");
else console.log(publicUrl ? `Uploaded documentation. Verify it at ${publicUrl}` : "Uploaded documentation. Verify the configured public web URL.");
