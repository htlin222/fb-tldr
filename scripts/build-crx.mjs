// Packs extension/ into a signed CRX3 (+ a plain zip) named by manifest version.
// Requires key.pem (the RSA signing key) in the repo root.
import crx3 from "crx3";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("../extension/manifest.json", import.meta.url))
);
const version = manifest.version;
const base = `fb-tldr-${version}`;

await crx3(["extension/manifest.json"], {
  keyPath: "key.pem",
  crxPath: `${base}.crx`,
  zipPath: `${base}.zip`,
});

console.log(`built ${base}.crx and ${base}.zip (v${version})`);
