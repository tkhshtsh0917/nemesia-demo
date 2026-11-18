# Contributing

[日本語](CONTRIBUTING.ja.md) · [Browser quick start](docs/browser-quickstart.md)

This repository owns the reference browser integration, demo data preparation, browser tests and Pages site. Changes to matching, extraction, the index and the WASM ABI belong in [Nemesia](https://github.com/tkhshtsh0917/nemesia).

## Set up and check a change

Install mise and Python 3. From the checkout, install the pinned Node and pnpm versions, then run the local checks:

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise run check
```

`check` runs Biome, TypeScript, fixture-based tests, and Markdown checks. It can run before any CLI, WASM or dictionary downloads.

## Build and test the demo

This path also uses Bash, `curl`, `unzip`, `jq`, `shasum` and the wasm-bindgen CLI version listed in the release metadata (0.2.129 for v0.1.0). Obtain one published release from the [Nemesia Releases page](https://github.com/tkhshtsh0917/nemesia/releases), or run the following with the GitHub CLI installed:

```sh
gh release download v0.1.0 --repo tkhshtsh0917/nemesia --dir artifacts/release \
  -p 'nemesia-*' -p nemesia_wasm.wasm -p SHA256SUMS
cargo install wasm-bindgen-cli --locked --version 0.2.129
bash tools/dictionary.sh artifacts/dictionary/system.dic
mise exec -- bash tools/build-release.sh artifacts/release v0.1.0 artifacts/dictionary/system.dic
mise exec -- pnpm exec playwright install chromium firefox webkit
mise exec -- pnpm test:e2e
mise exec -- pnpm preview
```

The build checks release hashes, prepares the index with the native CLI, compares CLI and WASM output, and writes the deployable site to `dist/`. Browser tests serve that build under `/nemesia-demo/`. Use the URL printed by Vite to preview the site locally.

## Prepare a pull request

Use fixed fixtures for functional tests. Cover stale replies and rendering when changing the query lifecycle. Update the English source and Japanese translation together and list the checks you ran. See [release and validation](docs/release.md) for the artifact contract and [performance](docs/performance.md) to reproduce measurements.
