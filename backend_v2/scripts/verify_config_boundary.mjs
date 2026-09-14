import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const backendRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(backendRoot, "..");
const frontendRoot = path.resolve(repositoryRoot, "..", "mediconnect-hub");

const forbiddenResourceNames = [
  "mediconnect-drug-interactions",
  "mediconnect-chat-history",
  "mediconnect-chat-connections",
  "mediconnect-consent-ledger",
  "mediconnect-knowledge-base",
  "mediconnect-dicom-studies",
  "mediconnect-hl7-messages",
  "mediconnect-health-records",
  "mediconnect-pharmacy-inventory",
];

const ignoredDirectories = new Set([
  ".git",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "site-packages",
  "tests",
  "venv",
  ".venv",
  "__tests__",
]);

function walk(directory, extensions) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath, extensions));
    else if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function envKeys(examplePath) {
  return new Set(
    fs
      .readFileSync(examplePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter(Boolean),
  );
}

function collectMatches(files, expressions) {
  const names = new Set();
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const expression of expressions) {
      for (const match of content.matchAll(expression)) names.add(match[1]);
    }
  }
  return names;
}

const maintainedBackendFiles = [
  ...walk(backendRoot, new Set([".ts", ".js", ".mjs", ".py"])),
  ...walk(path.join(repositoryRoot, "legacy_lambdas"), new Set([".js", ".mjs", ".py"])),
].filter(
  (file) =>
    (!file.startsWith(path.join(repositoryRoot, "legacy_lambdas")) ||
      path.relative(repositoryRoot, file).split(path.sep).length <= 3) &&
    !new Set([
      "verify_data_integrity.js",
      "verify_config_boundary.mjs",
      "service_health_test.mjs",
    ]).has(
      path.basename(file),
    ),
);

const failures = [];
for (const service of ['patient', 'doctor', 'booking', 'communication', 'staff']) {
  const entry = fs.readFileSync(path.join(backendRoot, `${service}-service/src/index.ts`), 'utf8');
  if (!entry.includes('getApiBrowserPolicy()') || /const (?:allowedOrigins|mobileOrigins)\s*=|const allowedOrigins:/.test(entry)) {
    failures.push(`${service} duplicates browser origin configuration instead of the shared policy`);
  }
  if (/https?:\/\/(?:localhost|\*\.)/.test(entry)) {
    failures.push(`${service} contains a hardcoded browser origin or wildcard provider host`);
  }
}
const configurationFallback = /process\.env\.[A-Z][A-Z0-9_]*\s*\|\|\s*["']/;
const obviousSecretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bgh[pousr]_[0-9A-Za-z]{36,}\b/,
];

for (const file of maintainedBackendFiles) {
  const content = fs.readFileSync(file, "utf8");
  if (configurationFallback.test(content)) {
    failures.push(`${path.relative(repositoryRoot, file)} contains a scattered environment fallback`);
  }
  if (obviousSecretPatterns.some((pattern) => pattern.test(content))) {
    failures.push(`${path.relative(repositoryRoot, file)} contains an obvious secret pattern`);
  }
  for (const resourceName of forbiddenResourceNames) {
    if (content.includes(resourceName)) {
      failures.push(`${path.relative(repositoryRoot, file)} contains ${resourceName}`);
    }
  }
}

const backendReferences = collectMatches(maintainedBackendFiles, [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /setting\(["']([A-Z][A-Z0-9_]*)["']\)/g,
  /requiredResourceName\(["']([A-Z][A-Z0-9_]*)["']\)/g,
  /requireEnv\(["']([A-Z][A-Z0-9_]*)["']\)/g,
  /required_resource_name\(["']([A-Z][A-Z0-9_]*)["']\)/g,
  // Model-router keys are passed through a small typed loader, so they are
  // configuration names even when the helper call receives a variable.
  /["'](MODEL_[A-Z0-9_]+)["']/g,
]);
const frontendReferences = collectMatches(
  [path.join(frontendRoot, "src", "config", "env.ts")],
  [/["'](VITE_[A-Z0-9_]+)["']/g],
);

for (const file of walk(path.join(frontendRoot, "src"), new Set([".ts", ".tsx"]))) {
  if (file.endsWith(path.join("src", "config", "env.ts"))) continue;
  if (/import\.meta\.env\.VITE_|import\.meta\.env\[["']VITE_/.test(fs.readFileSync(file, "utf8"))) {
    failures.push(`${path.relative(frontendRoot, file)} bypasses src/config/env.ts`);
  }
}

const backendExample = envKeys(path.join(backendRoot, ".env.example"));
const frontendExample = envKeys(path.join(frontendRoot, ".env.example"));

for (const name of backendReferences) {
  if (!backendExample.has(name)) failures.push(`backend .env.example is missing ${name}`);
}
for (const name of frontendReferences) {
  if (!frontendExample.has(name)) failures.push(`frontend .env.example is missing ${name}`);
}

if (failures.length > 0) {
  console.error(`Configuration-boundary verification failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Configuration-boundary verification passed: ${backendReferences.size} backend and ${frontendReferences.size} frontend variables documented; scattered fallbacks, direct frontend env reads, obvious secret patterns, and 9 forbidden resource literals absent from maintained source.`,
);
