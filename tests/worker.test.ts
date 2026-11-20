import assert from "node:assert/strict";
import test from "node:test";
import { bounded, parseManifest } from "../src/worker/assets.ts";
import { queryVariant, readRules } from "../src/worker/romaji.ts";

test("converts mixed IME without changing a plain Latin or kana query", () => {
  const rules = readRules({
    び: "bi",
    ビ: "bi",
    ー: "-",
    に: "ni",
    きょ: "kyo",
  });
  assert.equal(queryVariant("びーt", rules), "bi-t");
  assert.equal(queryVariant("にh", rules), "nih");
  assert.equal(queryVariant("きょu", rules), "kyou");
  assert.equal(queryVariant("bi-t", rules), undefined);
  assert.equal(queryVariant("びー", rules), undefined);
  assert.throws(() => readRules({ __proto__x: "bad" }));
  assert.throws(() => readRules({ び: "/" }));
});

test("a reviewed IME prefix uses one alternate without folding ordinary hyphens", () => {
  const rules = readRules({ め: "me", メ: "me", ー: "-", る: "ru" });

  for (const query of ["eme-", "eめ-", "ｅメＲ", "eめーr", "eめる"]) {
    assert.equal(queryVariant(query, rules), "eメール");
  }
  for (const query of ["e-", "e-m", "i-", "i-m", "i-me-", "eme-ru "]) {
    assert.equal(queryVariant(query, rules), undefined);
  }
  assert.equal(queryVariant("eめx", rules), "emex");
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
