# Nemesia Demo

[日本語](README.ja.md)

[Nemesia](https://github.com/tkhshtsh0917/nemesia) adds typo-tolerant query completions to a web page. The demo completes 10,000 Japanese nouns extracted from FineWeb2 Edu Japanese. It supports readings, Latin input, typos and IME composition.

[Open the demo](https://tkhshtsh0917.github.io/nemesia-demo/). Try `bitam`, `びたm`, or `にh` to see completions for partial Latin and mixed-script input.

- **Add it to your app.** Follow the [browser quick start](docs/browser-quickstart.md) for a plain HTML example, or see the [browser integration guide](docs/browser.md) for the Worker and combobox used in the demo.
- **Run or develop the demo.** Follow [Contributing](CONTRIBUTING.md) for the release download, local build and test commands.
- **Inspect behavior and performance.** See [FineWeb2 Edu Japanese vocabulary](docs/fineweb.md), [release and validation](docs/release.md), the [Rust API reference](https://tkhshtsh0917.github.io/nemesia/), and [measured latency and ranking quality](docs/performance.md).

The demo code is licensed under [MIT](LICENSE). See [data notices](data/notices/) for the dictionary and [FineWeb2 Edu Japanese vocabulary](docs/fineweb.md) for the corpus attribution.
