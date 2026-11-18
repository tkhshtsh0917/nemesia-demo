import { expect, test } from "@playwright/test";

test("a selected IME clause previews a completion without committing it", async ({
  page,
}) => {
  await page.goto(".");
  const input = page.getByRole("combobox");
  await input.fill("音楽 ");
  await input.evaluate((element: HTMLInputElement) => {
    element.dispatchEvent(new CompositionEvent("compositionstart"));
    element.value = "音楽 びーt";
    element.setSelectionRange(3, 5);
    element.dispatchEvent(
      new InputEvent("input", {
        data: "びーt",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
  });

  const beatles = page.getByRole("option", { name: "ビート", exact: true });
  await expect(beatles).toBeVisible();
  await beatles.dispatchEvent("click", { detail: 0 });
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(input).toHaveValue("音楽 びーt");
  await expect(beatles).toBeVisible();

  await input.evaluate((element: HTMLInputElement) => {
    element.setSelectionRange(element.value.length, element.value.length);
    element.dispatchEvent(new CompositionEvent("compositionend"));
  });
  await expect(beatles).toBeVisible();
  await beatles.dispatchEvent("click", { detail: 0 });
  await expect(input).toHaveValue("音楽 ビート");
});

test("Chromium handles a selected range from its IME input pipeline", async ({
  browserName,
  isMobile,
  page,
}) => {
  test.skip(browserName !== "chromium" || isMobile);
  await page.goto(".");
  const input = page.getByRole("combobox");
  await input.focus();

  const session = await page.context().newCDPSession(page);
  await session.send("Input.imeSetComposition", {
    text: "びーt",
    selectionStart: 0,
    selectionEnd: 2,
  });
  await expect(input).toHaveValue("びーt");
  await expect(page.getByRole("option", { name: "ビート" })).toBeVisible();
});

test("the list returns when the caret moves back to the end", async ({
  page,
}) => {
  await page.goto(".");
  const input = page.getByRole("combobox");
  const list = page.getByRole("listbox");
  await input.fill("bi-t");
  await expect(list).toBeVisible();

  await input.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(0, 0),
  );
  await expect(list).toBeHidden();
  await input.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(element.value.length, element.value.length),
  );
  await expect(list).toBeVisible();

  await input.press("Escape");
  await expect(list).toBeHidden();
});
