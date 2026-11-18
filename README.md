# Nemesia Demo

[日本語](README.ja.md)

Browser demo and integration tests for [Nemesia](https://github.com/tkhshtsh0917/nemesia), a Rust and WASM query autocompletion engine. The demo suggests words extracted from the same corpus used for search. A native build step prepares the suggestions. The browser offers them as the user types, including during IME composition.

**Status:** Design draft. The demo and Pages workflow are pending implementation.

- [Browser integration](docs/browser.md) describes the TypeScript adapter, data prep and combobox behavior.
- [Release and validation](docs/release.md) describes how this repo consumes Nemesia assets, tests them and deploys Pages.
- [Project roadmap](https://github.com/tkhshtsh0917/nemesia/blob/main/docs/roadmap.md) defines cross-repo milestones.
