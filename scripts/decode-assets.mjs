// Restores binary assets that are stored as base64 text in the repository
// (the repository was populated through a text-only API). Runs before dev/build.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ASSETS = [{ from: "assets/hero-harbor.webp.b64", to: "public/media/hero-harbor.webp" }];

for (const { from, to } of ASSETS) {
  const bytes = Buffer.from(readFileSync(from, "utf8").replace(/\s+/g, ""), "base64");
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, bytes);
  console.log(`decoded ${from} -> ${to} (${bytes.length} bytes)`);
}
