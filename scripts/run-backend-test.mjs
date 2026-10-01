import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const venvDir = path.join(backendDir, ".venv");

const isWin = process.platform === "win32";
const venvPython = isWin
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");

const pythonExec = fs.existsSync(venvPython) ? venvPython : (isWin ? "python" : "python3");

const res = spawnSync(pythonExec, ["-m", "pytest", "tests"], {
  cwd: backendDir,
  stdio: "inherit",
  env: { ...process.env },
});

process.exit(res.status ?? 0);
