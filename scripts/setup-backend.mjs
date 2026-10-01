import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const venvDir = path.join(backendDir, ".venv");
const envExample = path.join(backendDir, ".env.example");
const envFile = path.join(backendDir, ".env");

console.log("==> Setting up Python backend environment...");

// Copy .env if missing
if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, envFile);
  console.log("✓ Copied backend/.env.example -> backend/.env");
}

// Check Python executable
const isWin = process.platform === "win32";
let pyCmd = isWin ? "python" : "python3";

// Create venv if missing
const venvPython = isWin
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");

if (!fs.existsSync(venvPython)) {
  console.log("Creating virtual environment in backend/.venv...");
  const venvRes = spawnSync(pyCmd, ["-m", "venv", venvDir], {
    stdio: "inherit",
    cwd: backendDir,
  });
  if (venvRes.status !== 0) {
    console.error("Failed to create Python virtual environment.");
    process.exit(1);
  }
}

// Install requirements
console.log("Installing backend requirements from requirements.txt...");
const pipRes = spawnSync(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"], {
  stdio: "inherit",
  cwd: backendDir,
});

if (pipRes.status !== 0) {
  console.error("Failed to install Python requirements.");
  process.exit(1);
}

console.log("✓ Backend setup completed successfully.");
