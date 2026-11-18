/** Demonstrates submission against precisely the documents used for candidate extraction. */
import documents from "../../data/documents.json" with { type: "json" };
import hostTerms from "../generated/host-terms.js";

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

const searchable = documents.map((document) => ({
  ...document,
  body: normalize(document.text),
  terms: new Set(hostTerms[document.id].map(normalize)),
}));

export function showSearch(
  value: string,
  summary: HTMLElement,
  results: HTMLElement,
) {
  const words = normalize(value).trim().split(/\s+/u).filter(Boolean);
  const hits = words.length
    ? searchable.filter(({ body, terms }) =>
        words.every((word) => body.includes(word) || terms.has(word)),
      )
    : [];
  summary.textContent = words.length
    ? `「${value}」の検索結果（${hits.length}件）`
    : "検索語を入力してください。";
  results.replaceChildren(
    ...hits.map(({ text }) => {
      const row = document.createElement("li");
      row.textContent = text;
      return row;
    }),
  );
}
