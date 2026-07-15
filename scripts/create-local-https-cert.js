#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const certDir = path.join(projectRoot, "certs");
const certPath = path.join(certDir, "mvanager-local.pem");
const keyPath = path.join(certDir, "mvanager-local-key.pem");
const configPath = path.join(certDir, "mvanager-local-openssl.cnf");

function localIPv4Addresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
  });
  return result.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} fallito: ${output}`);
  }
}

function buildOpenSslConfig(hosts, ips) {
  const dnsLines = hosts.map((host, index) => `DNS.${index + 1} = ${host}`);
  const ipLines = ips.map((ip, index) => `IP.${index + 1} = ${ip}`);
  return [
    "[req]",
    "default_bits = 2048",
    "prompt = no",
    "default_md = sha256",
    "distinguished_name = dn",
    "x509_extensions = v3_req",
    "",
    "[dn]",
    "CN = mvanager.local",
    "",
    "[v3_req]",
    "subjectAltName = @alt_names",
    "keyUsage = digitalSignature, keyEncipherment",
    "extendedKeyUsage = serverAuth",
    "",
    "[alt_names]",
    ...dnsLines,
    ...ipLines,
    "",
  ].join("\n");
}

function main() {
  fs.mkdirSync(certDir, { recursive: true });

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log(`[local-https] Certificato gia' presente: ${certPath}`);
    return;
  }

  if (!commandExists("openssl")) {
    throw new Error("OpenSSL non trovato. Installa openssl oppure genera manualmente certs/mvanager-local.pem e certs/mvanager-local-key.pem.");
  }

  const localIps = unique([
    process.env.MVANAGER_LOCAL_IP,
    "127.0.0.1",
    "192.168.1.92",
    ...localIPv4Addresses(),
  ]);
  const hosts = unique([
    "localhost",
    "mvanager.localhost",
    "sami.localhost",
    "emmeci.localhost",
    "mvanager.local",
    "sami.local",
    "emmeci.local",
  ]);

  fs.writeFileSync(configPath, buildOpenSslConfig(hosts, localIps));
  run("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-days",
    "825",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-config",
    configPath,
  ]);
  fs.chmodSync(keyPath, 0o600);

  console.log(`[local-https] Certificato creato: ${certPath}`);
  console.log("[local-https] Se il browser lo segnala come non attendibile, va autorizzato o installato tra i certificati attendibili del dispositivo.");
}

main();
