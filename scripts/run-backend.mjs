import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const venvDir = path.join(backendDir, ".venv");
const envExample = path.join(backendDir, ".env.example");
const envFile = path.join(backendDir, ".env");

if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, envFile);
}

const isWin = process.platform === "win32";
const venvPython = isWin
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");

const pythonExec = fs.existsSync(venvPython) ? venvPython : (isWin ? "python" : "python3");

const child = spawn(
  pythonExec,
  ["-m", "uvicorn", "main:app", "--reload", "--port", "8000"],
  {
    cwd: backendDir,
    stdio: "inherit",
    env: { ...process.env },
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
