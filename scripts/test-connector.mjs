import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const local =
  process.platform === "win32"
    ? "connector/.venv/Scripts/python.exe"
    : "connector/.venv/bin/python";
const result = spawnSync(
  existsSync(local)
    ? local
    : process.platform === "win32"
      ? "python"
      : "python3",
  ["-m", "unittest", "discover", "-s", "connector", "-p", "test_*.py"],
  { stdio: "inherit", windowsHide: true },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
