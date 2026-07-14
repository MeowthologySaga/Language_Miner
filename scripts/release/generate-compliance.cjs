"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = resolveOutputDirectory(process.argv[2]);
const packageJson = readJson(path.join(repoRoot, "package.json"));
const packageLock = readJson(path.join(repoRoot, "package-lock.json"));

assertProjectLicenseMetadata();
fs.mkdirSync(outputDir, { recursive: true });

const sbom = generateSbom();
const sbomPath = path.join(
  outputDir,
  `language-miner-${packageJson.version}.cdx.json`
);
fs.writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");

const licenseRecords = collectInstalledLicenseRecords();
const unknownLicenses = licenseRecords.filter((record) =>
  /^(?:UNKNOWN|UNLICENSED|PROPRIETARY)$/i.test(record.license)
);
const licenseJsonPath = path.join(outputDir, "third-party-licenses.json");
const licenseMarkdownPath = path.join(outputDir, "third-party-licenses.md");
fs.writeFileSync(
  licenseJsonPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      rootLicense: packageJson.license,
      packageCount: licenseRecords.length,
      packages: licenseRecords
    },
    null,
    2
  )}\n`,
  "utf8"
);
fs.writeFileSync(licenseMarkdownPath, renderLicenseMarkdown(licenseRecords), "utf8");

if (unknownLicenses.length > 0) {
  process.stderr.write("Dependency license validation failed:\n");
  for (const record of unknownLicenses) {
    process.stderr.write(`- ${record.name}@${record.version}: ${record.license}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Compliance artifacts generated: ${path.relative(repoRoot, sbomPath)} and ${licenseRecords.length} dependency license records.\n`
  );
}

function generateSbom() {
  const records = collectLockRecords();
  return {
    $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        {
          vendor: "MeowthologySaga",
          name: "Language Miner release tooling",
          version: packageJson.version
        }
      ],
      component: {
        type: "application",
        "bom-ref": `language-miner@${packageJson.version}`,
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        licenses: [{ license: { id: packageJson.license } }],
        externalReferences: [
          { type: "vcs", url: packageJson.repository.url },
          { type: "website", url: packageJson.homepage },
          { type: "issue-tracker", url: packageJson.bugs.url }
        ]
      }
    },
    components: records.map((record) => ({
      type: "library",
      "bom-ref": record.bomRef,
      name: record.name,
      version: record.version,
      scope: record.optional ? "optional" : record.developmentOnly ? "excluded" : "required",
      purl: createPackageUrl(record.name, record.version),
      licenses: [{ expression: record.license }],
      ...(record.resolved
        ? { externalReferences: [{ type: "distribution", url: record.resolved }] }
        : {}),
      ...(record.hash ? { hashes: [record.hash] } : {}),
      properties: [
        { name: "language-miner:package-lock-path", value: record.lockPath },
        { name: "language-miner:development-only", value: String(record.developmentOnly) }
      ]
    }))
  };
}

function collectInstalledLicenseRecords() {
  return collectLockRecords().map(({ bomRef, hash, integrity, lockPath, resolved, ...record }) => record);
}

function collectLockRecords() {
  const records = [];
  for (const [lockPath, lockEntry] of Object.entries(packageLock.packages ?? {})) {
    if (!lockPath || !lockPath.includes("node_modules/")) continue;
    const name = packageNameFromLockPath(lockPath);
    const version = String(lockEntry.version || "UNKNOWN");
    const integrity = typeof lockEntry.integrity === "string" ? lockEntry.integrity : undefined;
    records.push({
      bomRef: `npm:${name}@${version}:${lockPath}`,
      lockPath,
      name,
      version,
      license: normalizeLicense(lockEntry.license),
      developmentOnly: lockEntry.dev === true,
      optional: lockEntry.optional === true,
      repository: undefined,
      resolved: typeof lockEntry.resolved === "string" ? lockEntry.resolved : undefined,
      integrity,
      hash: integrityToCycloneDxHash(integrity)
    });
  }
  return records.sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`, "en")
  );
}

function normalizeLicense(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const values = value.map(normalizeLicense).filter((item) => item !== "UNKNOWN");
    return values.length > 0 ? values.join(" OR ") : "UNKNOWN";
  }
  if (value && typeof value === "object" && typeof value.type === "string") {
    return value.type.trim() || "UNKNOWN";
  }
  return "UNKNOWN";
}

function renderLicenseMarkdown(records) {
  const lines = [
    "# Third-party package license report",
    "",
    `Generated for Language Miner ${packageJson.version}.`,
    "",
    "| Package | Version | License | Scope |",
    "| --- | --- | --- | --- |"
  ];
  for (const record of records) {
    lines.push(
      `| ${escapeTable(record.name)} | ${escapeTable(record.version)} | ${escapeTable(record.license)} | ${record.developmentOnly ? "development" : "runtime"} |`
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function assertProjectLicenseMetadata() {
  if (packageJson.license !== "GPL-3.0-only") {
    throw new Error("package.json must declare GPL-3.0-only.");
  }
  for (const fileName of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    if (!fs.existsSync(path.join(repoRoot, fileName))) {
      throw new Error(`${fileName} is required for a public release.`);
    }
  }
}

function resolveOutputDirectory(argument) {
  const candidate = path.resolve(repoRoot, argument || "artifacts/compliance");
  const artifactsRoot = path.join(repoRoot, "artifacts");
  if (candidate !== artifactsRoot && !candidate.startsWith(`${artifactsRoot}${path.sep}`)) {
    throw new Error("Compliance output must stay inside the repository artifacts directory.");
  }
  return candidate;
}

function packageNameFromLockPath(lockPath) {
  const marker = "node_modules/";
  return lockPath.slice(lockPath.lastIndexOf(marker) + marker.length);
}

function createPackageUrl(name, version) {
  if (name.startsWith("@") && name.includes("/")) {
    const [scope, packageName] = name.split("/", 2);
    return `pkg:npm/${encodeURIComponent(scope)}/${encodeURIComponent(packageName)}@${encodeURIComponent(version)}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function integrityToCycloneDxHash(integrity) {
  if (!integrity) return undefined;
  const match = /^(sha(?:256|384|512))-(.+)$/i.exec(integrity);
  if (!match) return undefined;
  const algorithm = match[1].toUpperCase().replace("SHA", "SHA-");
  return {
    alg: algorithm,
    content: Buffer.from(match[2], "base64").toString("hex")
  };
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
