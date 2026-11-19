import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { verifyVocabularyLineage } from "../tools/data/provenance.ts";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));

test("the checked-in vocabulary matches the source locks and generation report", () => {
  verifyVocabularyLineage(
    read("data/demo-vocabulary/snapshot.json"),
    read("data/demo-vocabulary/corpus.json"),
    read("data/fineweb.lock.json"),
    read("data/dictionary.lock.json"),
  );
});

test("stale Parquet, stop lists, dictionary and candidate pins fail the build check", () => {
  const snapshot = read("data/demo-vocabulary/snapshot.json");
  const report = read("data/demo-vocabulary/corpus.json");
  const dataset = read("data/fineweb.lock.json");
  const dictionary = read("data/dictionary.lock.json");

  assert.throws(
    () =>
      verifyVocabularyLineage(
        snapshot,
        report,
        { ...dataset, sha256: "0".repeat(64) },
        dictionary,
      ),
    /Parquet/,
  );
  assert.throws(
    () =>
      verifyVocabularyLineage(
        snapshot,
        report,
        {
          ...dataset,
          sudachiFilters: {
            ...dataset.sudachiFilters,
            "stopwords.txt": "1".repeat(64),
          },
        },
        dictionary,
      ),
    /stop lists/,
  );
  assert.throws(
    () =>
      verifyVocabularyLineage(snapshot, report, dataset, {
        systemSha256: "2".repeat(64),
      }),
    /dictionary/,
  );
  assert.throws(
    () =>
      verifyVocabularyLineage(
        { ...snapshot, candidateSha256: "3".repeat(64) },
        report,
        dataset,
        dictionary,
      ),
    /candidate digest/,
  );
});
