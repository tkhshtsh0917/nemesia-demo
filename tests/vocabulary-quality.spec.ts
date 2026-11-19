import { expect, test } from "@playwright/test";
import evaluation from "../data/fineweb-evaluation.json" with { type: "json" };

test("retains reviewed terms and excludes fragments and adult terms", async ({
  page,
}) => {
  await page.goto(".");
  await expect(page.getByRole("status")).toHaveText("補完できます。");
  const input = page.getByRole("combobox");

  for (const { query, expected, excluded, rank } of evaluation) {
    const terms = await input.evaluate(
      async (field: HTMLInputElement, value) => {
        const rendered = new Promise<string[]>((resolve, reject) => {
          const listener = new AbortController();
          const timeout = setTimeout(() => {
            listener.abort();
            reject(new Error(`No completion rendered for ${value}`));
          }, 4000);
          window.addEventListener(
            "nemesia:render",
            () => {
              clearTimeout(timeout);
              resolve(
                Array.from(
                  document.querySelectorAll('[role="option"]'),
                  (option) => option.textContent?.trim() ?? "",
                ),
              );
            },
            { once: true, signal: listener.signal },
          );
        });

        field.focus();
        field.value = value;
        field.setSelectionRange(value.length, value.length);
        field.dispatchEvent(
          new InputEvent("input", {
            inputType: "insertText",
            data: value,
            bubbles: true,
          }),
        );
        return rendered;
      },
      query,
    );

    if (rank !== undefined) {
      expect(terms[rank - 1], query).toBe(expected);
    } else if (expected) {
      expect(terms, query).toContain(expected);
    }
    if (excluded) expect(terms, query).not.toContain(excluded);
  }
});
