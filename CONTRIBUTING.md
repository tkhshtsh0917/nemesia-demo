# Contributing

[日本語](CONTRIBUTING.ja.md)

Run `mise install`, `mise exec -- pnpm install --frozen-lockfile` and `mise run check` in this checkout. Keep fixtures independent of live dataset downloads and update the English and Japanese docs together.

To build and preview a verified release, place the native CLI for your platform, raw WASM, ABI metadata, notices, and `SHA256SUMS` in `artifacts/release`. Install wasm-bindgen 0.2.129. The release tag must match the CLI version.

```sh
bash tools/dictionary.sh artifacts/dictionary/system.dic
mise exec -- bash tools/build-release.sh artifacts/release v0.1.0 artifacts/dictionary/system.dic
mise exec -- pnpm exec playwright install chromium firefox webkit
mise exec -- pnpm test:e2e
mise exec -- pnpm preview
```

The build prepares the index from the demo's actual searchable documents, compares CLI/WASM output, and writes the static site to `dist/`. See [release and validation](docs/release.md) for the artifact contract and [performance](docs/performance.md) for reproducible measurements.
