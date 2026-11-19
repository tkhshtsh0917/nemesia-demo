import { expect, test } from "@playwright/test";

test("a selected IME clause previews a completion without committing it", async ({
  page,
}) => {
  await page.goto(".");
  const input = page.getByRole("combobox");
  await input.fill("栄養 ");
  await input.evaluate((element: HTMLInputElement) => {
    element.dispatchEvent(new CompositionEvent("compositionstart"));
    element.value = "栄養 びたm";
    element.setSelectionRange(3, 5);
    element.dispatchEvent(
      new InputEvent("input", {
        data: "びたm",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
  });

  const vitamin = page.getByRole("option", { name: "ビタミン", exact: true });
  await expect(vitamin).toBeVisible();
  await vitamin.dispatchEvent("click", { detail: 0 });
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(input).toHaveValue("栄養 びたm");
  await expect(vitamin).toBeVisible();

  await input.evaluate((element: HTMLInputElement) => {
    element.setSelectionRange(element.value.length, element.value.length);
    element.dispatchEvent(new CompositionEvent("compositionend"));
  });
  await expect(vitamin).toBeVisible();
  await vitamin.dispatchEvent("click", { detail: 0 });
  await expect(input).toHaveValue("栄養 ビタミン");
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
  const firstOption = page.getByRole("option").first();
  for (const [text, expected] of [
    ["びたm", "ビタミン"],
    ["eめ", "eメール"],
  ]) {
    await session.send("Input.imeSetComposition", {
      text,
      selectionStart: 0,
      selectionEnd: 2,
    });
    await expect(input).toHaveValue(text);
    await expect(firstOption).toHaveText(expected);
  }
});

test("the list returns when the caret moves back to the end", async ({
  page,
}) => {
  await page.goto(".");
  const input = page.getByRole("combobox");
  const list = page.getByRole("listbox");
  await input.fill("bitam");
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
