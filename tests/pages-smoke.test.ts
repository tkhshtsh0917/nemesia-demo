import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { verifyDeployment } from "../tools/pages-smoke.ts";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const base = new URL("https://example.test/nemesia-demo/");
const index = "NMSI";
const sha256 = hash(index);
const generation = "b".repeat(64);
const release = { tag: "v0.1.0" };
const html = "<html></html>";
const corpusSha256 = hash("corpus");
const deployed = JSON.stringify({
  generation,
  indexSha256: sha256,
  corpusSha256,
  release,
  pageSha256: hash(html),
});
const file = `${sha256}.nmsi`;
const manifest = {
  format: "nemesia-data/1",
  abi: 1,
  normalization: 1,
  generation,
  corpusSha256,
  index: { file, sha256, bytes: index.length },
  rules: { file: `${sha256}.json`, sha256, bytes: 2 },
};

test("Pages smoke compares the uploaded provenance, manifest and index", async (t) => {
  const records: Record<string, string> = {
    "": html,
    "provenance.json": deployed,
    "generated/current.json": JSON.stringify(manifest),
    [`generated/${file}`]: index,
  };
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    assert.ok(url.pathname.startsWith(base.pathname));
    const record = records[url.pathname.slice(base.pathname.length)];
    return record === undefined
      ? new Response(null, { status: 404 })
      : new Response(record);
  });

  await verifyDeployment(base, hash(deployed), "first");
  records["provenance.json"] = JSON.stringify({ release, revision: "old" });
  await assert.rejects(
    verifyDeployment(base, hash(deployed), "second"),
    /provenance differs/,
  );

  records["provenance.json"] = deployed;
  records["generated/current.json"] = JSON.stringify({
    ...manifest,
    generation: sha256,
  });
  await assert.rejects(
    verifyDeployment(base, hash(deployed), "third"),
    /manifest differs/,
  );

  records["generated/current.json"] = JSON.stringify(manifest);
  records[`generated/${file}`] = "stale";
  await assert.rejects(
    verifyDeployment(base, hash(deployed), "fourth"),
    /byte limit/,
  );

  records[`generated/${file}`] = index;
  records[""] = "<html>stale</html>";
  await assert.rejects(
    verifyDeployment(base, hash(deployed), "fifth"),
    /HTML differs/,
  );
});
