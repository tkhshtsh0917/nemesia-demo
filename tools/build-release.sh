#!/usr/bin/env bash
set -euo pipefail
bundle="${1:?expected bundle path}"
tag="${2:?expected release tag}"
dictionary="${3:?expected system dictionary}"

node tools/verify-release.ts "$bundle" "$tag"
case "$(uname -sm)" in
  'Linux x86_64') cli="$bundle/nemesia-linux-x86_64" ;;
  'Darwin arm64') cli="$bundle/nemesia-macos-aarch64" ;;
  *) exit 1 ;;
esac
expected="$(jq -er .systemSha256 data/dictionary.lock.json)"
actual="$(shasum -a 256 "$dictionary")"
[[ "${actual%% *}" == "$expected" ]]
[[ "$(wasm-bindgen --version)" == 'wasm-bindgen 0.2.129' ]]

mkdir -p src/generated artifacts public
wasm-bindgen --target web --out-dir src/generated "$bundle/nemesia_wasm.wasm"
cp "$bundle/release.lock.json" artifacts/
mkdir -p public/notices
cp "$bundle/nemesia-licenses.tar.gz" public/notices/
cp data/notices/SudachiDict-* public/notices/
cp node_modules/vite/LICENSE.md public/notices/vite-LICENSE.md
node tools/data/prepare.ts "$cli" "$dictionary"
node tools/verify-wasm.ts "$cli"
pnpm build
python3 tools/install-rustdoc.py "$bundle/nemesia-rustdoc.tar.gz" dist/api/rust

node --input-type=module - "$tag" <<'JS'
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("dist/generated/current.json", "utf8"));
const release = JSON.parse(readFileSync("artifacts/release.lock.json", "utf8"));
if (release.tag !== process.argv[2]) throw new Error("release pin differs");
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
writeFileSync("dist/provenance.json", JSON.stringify({ revision, release, generation: manifest.generation, indexSha256: manifest.index.sha256 }) + "\n");
JS
