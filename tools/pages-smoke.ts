/** Verifies the exact uploaded demo provenance and the deployed index bytes. */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { bounded, parseManifest, verified } from "../src/worker/assets.ts";

const decoder = new TextDecoder("utf-8", { fatal: true });

export async function verifyDeployment(
  base: URL,
  expected: string,
  attempt: string,
): Promise<void> {
  const fresh = (path: string) => {
    const url = new URL(path, base);
    url.searchParams.set("run", attempt);
    return url;
  };

  const provenance = await bounded(fresh("provenance.json"), 4096);
  if (createHash("sha256").update(provenance).digest("hex") !== expected)
    throw new Error("deployed provenance differs from the uploaded artifact");

  const manifestUrl = fresh("generated/current.json");
  const raw = JSON.parse(decoder.decode(await bounded(manifestUrl, 4096)));
  const manifest = parseManifest(raw);
  const metadata = JSON.parse(decoder.decode(provenance));
  if (
    metadata.generation !== manifest.generation ||
    metadata.indexSha256 !== manifest.index.sha256 ||
    metadata.corpusSha256 !== raw.corpusSha256
  )
    throw new Error("deployed manifest differs from the uploaded artifact");

  await verified(manifestUrl, manifest.index);
  const page = await bounded(fresh("."), 64 * 1024);
  if (createHash("sha256").update(page).digest("hex") !== metadata.pageSha256)
    throw new Error("deployed HTML differs from the uploaded artifact");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [site, expected, attempt] = process.argv.slice(2);
  if (!site || !expected || !/^[0-9a-f]{64}$/.test(expected) || !attempt)
    throw new Error("Usage: node tools/pages-smoke.ts SITE SHA256 ATTEMPT");

  await verifyDeployment(
    new URL(`${site.replace(/\/$/, "")}/`),
    expected,
    attempt,
  );
}
