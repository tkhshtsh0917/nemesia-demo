/** Demonstrates submission against precisely the documents used for candidate extraction. */
import documents from "../../data/documents.json" with { type: "json" };

export function showSearch(
  value: string,
  summary: HTMLElement,
  results: HTMLElement,
) {
  const words = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
  const hits = words.length
    ? documents.filter((row) =>
        words.every((word) =>
          row.text.normalize("NFKC").toLowerCase().includes(word),
        ),
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
