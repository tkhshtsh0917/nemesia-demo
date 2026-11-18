import assert from "node:assert/strict";
import test from "node:test";
import { bounded, parseManifest } from "../src/worker/assets.ts";
import { mixedRomaji, readRules } from "../src/worker/romaji.ts";

test("converts mixed IME without changing a plain Latin or kana query", () => {
  const rules = readRules({
    び: "bi",
    ビ: "bi",
    ー: "-",
    に: "ni",
    きょ: "kyo",
  });
  assert.equal(mixedRomaji("びーt", rules), "bi-t");
  assert.equal(mixedRomaji("にh", rules), "nih");
  assert.equal(mixedRomaji("きょu", rules), "kyou");
  assert.equal(mixedRomaji("bi-t", rules), undefined);
  assert.equal(mixedRomaji("びー", rules), undefined);
  assert.throws(() => readRules({ __proto__x: "bad" }));
  assert.throws(() => readRules({ び: "/" }));
});

test("manifest cannot redirect an asset or exceed decoded budgets", () => {
  const sha = "1".repeat(64);
  const manifest = {
    format: "nemesia-data/1",
    abi: 1,
    normalization: 1,
    generation: sha,
    index: { file: `${sha}.nmsi`, sha256: sha, bytes: 40 },
    rules: { file: `${sha}.json`, sha256: sha, bytes: 10 },
  };
  assert.equal(parseManifest(manifest).index.bytes, 40);
  assert.throws(() => parseManifest({ ...manifest, abi: 2 }));
  assert.throws(() =>
    parseManifest({
      ...manifest,
      index: { ...manifest.index, file: "../index.nmsi" },
    }),
  );
  assert.throws(() =>
    parseManifest({
      ...manifest,
      rules: { ...manifest.rules, bytes: 3 * 1024 * 1024 },
    }),
  );
});

test("rejects both long and short reads before use", async () => {
  const url = new URL("data:text/plain,abcd");
  await assert.rejects(() => bounded(url, 3, 3), /byte limit/);
  await assert.rejects(() => bounded(url, 5, 5), /length mismatch/);
  assert.equal(new TextDecoder().decode(await bounded(url, 4, 4)), "abcd");
});
