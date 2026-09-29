import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const bump = (process.argv[2] ?? "patch").toLowerCase();
if (bump === "skip") process.exit(0);
if (!["patch", "medium", "major"].includes(bump)) {
  throw new Error("VERSION_BUMP must be patch, medium, or major.");
}
const packagePath = new URL("../package.json", import.meta.url);
const lockPath = new URL("../package-lock.json", import.meta.url);
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const parts = String(packageJson.version).split(".").map(Number);
if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
  throw new Error(`Invalid package version: ${packageJson.version}`);
}

if (bump === "major") {
  parts[0] += 1;
  parts[1] = 0;
  parts[2] = 0;
} else if (bump === "medium") {
  parts[1] += 1;
  parts[2] = 0;
} else {
  parts[2] += 1;
}

packageJson.version = parts.join(".");
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
const packageLock = JSON.parse(readFileSync(lockPath, "utf8"));
packageLock.version = packageJson.version;
if (packageLock.packages?.[""]) packageLock.packages[""].version = packageJson.version;
writeFileSync(lockPath, `${JSON.stringify(packageLock, null, 2)}\n`);
execFileSync("git", ["add", "package.json", "package-lock.json"]);
