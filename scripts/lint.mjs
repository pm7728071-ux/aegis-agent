import { execFileSync } from "node:child_process";
import { extname } from "node:path";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => [".js", ".cjs", ".mjs"].includes(extname(file).toLowerCase()));

let failed = 0;
for (const file of tracked) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch {
    failed += 1;
    process.stderr.write(`Syntax check failed: ${file}\n`);
  }
}

if (failed) {
  process.stderr.write(`${failed} of ${tracked.length} JavaScript files failed syntax checks.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Lint passed: ${tracked.length} tracked JavaScript files checked.\n`);
}
