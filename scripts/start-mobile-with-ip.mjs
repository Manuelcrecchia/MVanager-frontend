import { readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { spawn } from "node:child_process";

const ipAddress = String(process.argv[2] || "").trim();

if (isIP(ipAddress) !== 4) {
  console.error("Uso: npm run start:mobile:ip -- 192.168.1.69");
  process.exit(1);
}

const projectDirectory = new URL("..", import.meta.url);
const environmentPath = new URL(
  "../src/environments/environment.mobile-local.ts",
  import.meta.url,
);
const originalEnvironment = readFileSync(environmentPath, "utf8");
const localApiUrl = `http://${ipAddress}:5001`;
const configuredEnvironment = originalEnvironment.replace(
  /https?:\/\/[^'"]+:5001/g,
  localApiUrl,
);

if (
  configuredEnvironment === originalEnvironment &&
  !originalEnvironment.includes(localApiUrl)
) {
  console.error(
    "Nessun URL locale sulla porta 5001 trovato nell'environment mobile.",
  );
  process.exit(1);
}

let environmentRestored = false;
const restoreEnvironment = () => {
  if (environmentRestored) return;
  environmentRestored = true;
  writeFileSync(environmentPath, originalEnvironment);
};

writeFileSync(environmentPath, configuredEnvironment);

console.log(`Frontend mobile: http://${ipAddress}:4200/?tenant=sami`);
console.log(`Backend atteso: ${localApiUrl}`);
console.log("La configurazione locale verrà ripristinata alla chiusura.");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const angular = spawn(
  npmCommand,
  [
    "run",
    "ng",
    "--",
    "serve",
    "--host",
    "0.0.0.0",
    "--configuration",
    "mobileLocal",
  ],
  {
    cwd: projectDirectory,
    stdio: "inherit",
  },
);

let stopping = false;
const stopAngular = (signal) => {
  if (stopping) return;
  stopping = true;
  angular.kill(signal);
};

process.on("SIGINT", () => stopAngular("SIGINT"));
process.on("SIGTERM", () => stopAngular("SIGTERM"));
process.on("exit", restoreEnvironment);

angular.on("error", (error) => {
  restoreEnvironment();
  console.error("Impossibile avviare Angular:", error.message);
  process.exitCode = 1;
});

angular.on("exit", (code, signal) => {
  restoreEnvironment();
  if (typeof code === "number") {
    process.exitCode = code;
  } else if (signal === "SIGINT") {
    process.exitCode = 130;
  } else if (signal === "SIGTERM") {
    process.exitCode = 143;
  } else {
    process.exitCode = 1;
  }
});
