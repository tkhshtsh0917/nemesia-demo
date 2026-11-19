import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  verifyCompiledIndex,
  verifyVocabularyLineage,
} from "../tools/data/provenance.ts";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));

test("the checked-in vocabulary matches the source locks and generation report", () => {
  verifyVocabularyLineage(
    read("data/demo-vocabulary/snapshot.json"),
    read("data/demo-vocabulary/corpus.json"),
    read("data/fineweb.lock.json"),
    read("data/dictionary.lock.json"),
  );
});

test("a changed generation setting fails even when the candidate and input pins agree", () => {
  const snapshot = read("data/demo-vocabulary/snapshot.json");
  const report = read("data/demo-vocabulary/corpus.json");
  const dataset = read("data/fineweb.lock.json");
  const dictionary = read("data/dictionary.lock.json");

  for (const changed of [
    { minEducationalScore: 4 },
    { documentLimit: 40_001 },
    { maxProjectedCharacters: 2_401 },
    { minDocumentFrequency: 6 },
    { cliVersion: "nemesia 0.2.0" },
  ]) {
    assert.throws(
      () =>
        verifyVocabularyLineage(
          snapshot,
          { ...report, ...changed },
          dataset,
          dictionary,
        ),
      /report generation settings differ/,
    );
  }
});

test("the same compiler version must reproduce both the size and digest", () => {
  const version = "nemesia 0.1.0";
  const index = { bytes: 1_024, sha256: "a".repeat(64) };
  verifyCompiledIndex(index, index, version, version);
  assert.throws(
    () =>
      verifyCompiledIndex({ ...index, bytes: 1_025 }, index, version, version),
    /compiled index size differs/,
  );
  assert.throws(
    () =>
      verifyCompiledIndex(
        { ...index, sha256: "b".repeat(64) },
        index,
        version,
        version,
      ),
    /compiled index digest differs/,
  );

  verifyCompiledIndex(
    index,
    { bytes: 2_048, sha256: "c".repeat(64) },
    version,
    "nemesia 0.2.0",
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
