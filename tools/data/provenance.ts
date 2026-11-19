/** Ties the shipped vocabulary report to the current, reviewed input locks. */
import assert from "node:assert/strict";

type Dataset = { dataset: string; revision: string; subset: string };
type Generation = {
  cliVersion: string;
  minEducationalScore: number;
  documentLimit: number;
  maxProjectedCharacters: number;
  minDocumentFrequency: number;
};
type IndexDigest = { bytes: number; sha256: string };
type DatasetLock = Dataset & {
  file: string;
  sha256: string;
  generation: Generation;
  sudachiFilters: {
    revision: string;
    "stopwords.txt": string;
    "stoptags.txt": string;
  };
};
type Snapshot = {
  source: Dataset;
  count: number;
  documents: number;
  minDocumentFrequency: number;
  dictionarySha256: string;
  extractorSha256: string;
  rulesSha256: string;
  candidateSha256: string;
};
type Report = Generation & {
  source: Dataset;
  documents: number;
  parquet: { file: string; sha256: string };
  sudachiFilters: DatasetLock["sudachiFilters"];
  dictionarySha256: string;
  cliSha256: string;
  rulesSha256: string;
  indexes: (IndexDigest & { count: number; candidateSha256: string })[];
};

export function verifyVocabularyLineage(
  snapshot: Snapshot,
  report: Report,
  dataset: DatasetLock,
  dictionary: { systemSha256: string },
) {
  const {
    dataset: name,
    revision,
    subset,
    file,
    sha256,
    generation,
    sudachiFilters,
  } = dataset;
  const expectedSource = { dataset: name, revision, subset };
  assert.deepEqual(
    snapshot.source,
    expectedSource,
    "snapshot source differs from the dataset lock",
  );
  assert.deepEqual(
    report.source,
    expectedSource,
    "report source differs from the dataset lock",
  );
  assert.deepEqual(
    report.parquet,
    { file, sha256 },
    "report Parquet differs from the dataset lock",
  );
  assert.deepEqual(
    report.sudachiFilters,
    sudachiFilters,
    "report stop lists differ from the dataset lock",
  );
  const {
    cliVersion,
    minEducationalScore,
    documentLimit,
    maxProjectedCharacters,
    minDocumentFrequency,
  } = report;
  assert.deepEqual(
    {
      cliVersion,
      minEducationalScore,
      documentLimit,
      maxProjectedCharacters,
      minDocumentFrequency,
    },
    generation,
    "report generation settings differ from the dataset lock",
  );
  assert.equal(
    report.dictionarySha256,
    dictionary.systemSha256,
    "report dictionary differs from the dictionary lock",
  );
  assert.equal(
    snapshot.dictionarySha256,
    report.dictionarySha256,
    "snapshot dictionary differs from the report",
  );
  assert.equal(
    snapshot.extractorSha256,
    report.cliSha256,
    "snapshot extractor differs from the report",
  );
  assert.equal(
    snapshot.rulesSha256,
    report.rulesSha256,
    "snapshot rules differ from the report",
  );
  assert.equal(
    snapshot.documents,
    report.documents,
    "snapshot document count differs from the report",
  );
  assert.equal(
    snapshot.minDocumentFrequency,
    report.minDocumentFrequency,
    "snapshot minimum frequency differs from the report",
  );

  const indexes = report.indexes.filter(
    ({ count }) => count === snapshot.count,
  );
  assert.equal(
    indexes.length,
    1,
    "report must identify exactly one selected index",
  );
  const [index] = indexes;
  assert.equal(
    snapshot.candidateSha256,
    index.candidateSha256,
    "snapshot candidate digest differs from the report",
  );
  return index;
}

/** Checks deterministic output across platforms for the same compiler version. */
export function verifyCompiledIndex(
  reported: IndexDigest,
  compiled: IndexDigest,
  reportVersion: string,
  compilerVersion: string,
) {
  if (reportVersion !== compilerVersion) return;

  assert.equal(
    compiled.bytes,
    reported.bytes,
    "compiled index size differs from the report",
  );
  assert.equal(
    compiled.sha256,
    reported.sha256,
    "compiled index digest differs from the report",
  );
}
