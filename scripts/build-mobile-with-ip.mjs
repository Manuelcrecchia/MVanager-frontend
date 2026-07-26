import { readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { spawnSync } from "node:child_process";

const ipAddress = String(process.argv[2] || "").trim();

if (isIP(ipAddress) !== 4) {
  console.error("Uso: npm run build:mobile:ip -- 192.168.1.92");
  process.exit(1);
}

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

if (configuredEnvironment === originalEnvironment && !originalEnvironment.includes(localApiUrl)) {
  console.error("Nessun URL locale sulla porta 5001 trovato nell'environment mobile.");
  process.exit(1);
}

console.log(`Build mobile locale collegata a ${localApiUrl}`);
writeFileSync(environmentPath, configuredEnvironment);

try {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", "build:mobile:local"], {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  writeFileSync(environmentPath, originalEnvironment);
}
