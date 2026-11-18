# Browser integration

[日本語](ja/browser.md) · [Release and validation](release.md)

## Responsibilities

| Location         | Contents                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `src/generated/` | Generated bindings for the pinned WASM ABI                                                |
| `src/worker/`    | Worker protocol, manifest and byte validation, query conversion and index lifecycle       |
| `src/view/`      | Search input and listbox, selection, host callbacks and status                            |
| `tools/data/`    | Build-time export of the host's searchable fields, native CLI calls and provenance checks |
| `tests/`         | Browser E2E, keyboard/touch interaction, stale response and fault injection tests         |

Use TypeScript, Vite, pnpm, Biome and Playwright via mise. The demo uses original Japanese documents. Its host search matches each submitted word against the original text or the normalized terms that Sudachi extracted from that document at build time. Build the candidate corpus with the native `nemesia extract` and `nemesia build` commands. Keep the demo's search implementation outside the completion adapter. Index preparation owns the dictionary, POS selection, corpus frequencies and the chosen static ranking weight. The Worker loads the artifacts and uses the resulting integer weights. See the [corpus specification](https://github.com/tkhshtsh0917/nemesia/blob/main/docs/corpus.md).

## Completion at the input

The engine completes a prefix of a candidate key. The Japanese demo offers one extracted word at a time. For a single input fragment, use the entire value. With multiple words separated by Unicode whitespace and the caret at the end, use the last fragment and preserve everything before it verbatim. An empty active fragment closes the list. Outside IME composition, a selection or caret inside the text closes it. Returning the caret to the end resumes completion. During composition, a selection within the last word can preview completions for that word. Japanese input without spaces is treated as one fragment. The host may instead provide a different fragment policy or use phrase candidates through the same core API.

For example, with `日本史 せか`, the demo can offer `日本史 世界史` when the term `世界史` is indexed with the reading `せかいし`. Send the original fragment plus one bounded kana/Latin alternative where applicable. A matching original fragment does not stop the alternative. The Worker delegates matching and ranking both variants to one WASM request.

Render an editable combobox with a listbox popup and no automatic selection. Keep DOM focus on the input. Arrow keys move the active option, Escape closes the popup, and Enter on an active option inserts it. Enter with no active option submits the input to the host. Pointer selection also inserts a candidate. Provide a separate submit action, keep Tab on its normal focus path, and leave text editing keys to the browser. Show suggestions during IME composition but defer committing a suggestion or submitting until that composition is finished. An Enter that commits an IME composition cannot also choose or submit a candidate. Render all text as text nodes. Use a live status for readiness, no results and errors without mirroring every suggestion as an announcement. [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) · [W3C UI Events composition events](https://www.w3.org/TR/uievents/#events-compositionevents).

## Scheduling and recovery

A request carries a monotonically increasing ID, a Worker instance identity and the active index generation. Invalidate older IDs when input, selection state or generation changes, including composition events. Keep one running query and at most one pending query, replacing the pending request with the latest. Check freshness before accepting a Worker reply and again before committing the DOM. Also require current input and fragment identity before a click or key action applies a rendered candidate.

A failed query clears its own suggestions, leaves the index available, and allows the next query. A stopped Worker is replaceable. When a host loads a replacement in the same Worker, a failed or oversized load leaves the previous generation active. The demo loads at startup and offers a restart on load or Worker failure. Disconnect or dispose without leaking requests, listeners or old results. No browser-side tokenizer or completion query logging is part of the design.
