import { rm } from "node:fs/promises";

const generatedPaths = [
  "swarm-report.json",
  "swarm-report.md",
  "__pycache__",
];

for (const path of generatedPaths) {
  await rm(path, { recursive: true, force: true });
  console.log(`Removed generated output if present: ${path}`);
}

console.log("Cleanup complete. Source files, dependencies, environment files, and user data were not touched.");
