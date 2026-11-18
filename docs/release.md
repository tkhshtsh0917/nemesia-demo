# Release and validation

[日本語](ja/release.md) · [Browser integration](browser.md)

The Rust repository publishes the native CLI, WASM, toolchain and ABI metadata, checksums and notices after its tagged verification. The demo selects one exact published tag per run and verifies each input asset against the expected SHA-256. A release lock records the tag and expected asset hashes. A release-triggered or manual deployment may resolve an explicit tag once and record its resolved pin as provenance. In all cases, the same pin is used for native index generation, binding generation and browser tests. Development also permits explicit local artifact input with the same checks. The build does not discover a neighboring checkout.

The demo workflow verifies CLI/platform and ABI compatibility, corpus provenance, input hashes and expected outputs. It runs functional and browser tests and generates one static Pages artifact. Publish the exact validated artifact. Aggregate document statistics stay in the build outputs. The Pages payload carries only the assets needed for the experience and any required data attribution. Store the selected release, demo commit and data hashes as deployment provenance.

Provide two deployment entry points, sharing a validation workflow:

1. After publication, a trusted release notification starts validation of the supplied tag. Check that the tag is the newest eligible stable release before deploying and serialize production deployment so a delayed event cannot replace a newer Pages version.
2. A manual workflow explicitly selects any supported published tag, including one used for rollback. It uses the same validation and deploys only if it passes. Failed validation leaves the current Pages deployment available.

Use read-only permissions for verification jobs and grant Pages/OIDC permissions only to the deployment job. Validate URL origins and enforce decoded byte limits. Demo CI unit tests run against fixed local fixtures and must not depend on live dataset downloads. Playwright checks Chromium, Firefox and WebKit, with desktop and mobile profiles. Verify IME, keyboard, pointer, safe rendering, duplicate elimination, stale response handling, recovery, and subpath deployment. Mobile emulation validates browser behavior and layout on the test host. See [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
