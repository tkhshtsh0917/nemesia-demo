import { expect, test } from "@playwright/test";

test("Latin prefixes and mixed IME reach Sudachi-derived candidates", async ({
  page,
  isMobile,
}) => {
  await page.goto(".");
  await expect(
    page.getByRole("link", { name: /FineWeb2 Edu Japanese/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "検索結果" })).toHaveCount(0);

  const query = page.getByRole("combobox");
  const vitamin = page.getByRole("option", { name: "ビタミン", exact: true });
  for (const value of ["bitmi", "bitam", "びたm", "びたみ"]) {
    await query.fill(value);
    await expect(vitamin).toBeVisible();
  }
  if (isMobile) {
    await vitamin.tap();
  } else {
    await vitamin.click();
  }
  await expect(query).toHaveValue("ビタミン");
  await expect(page.getByRole("listbox")).toBeHidden();
});

test("composition Enter does not choose a candidate or submit the form", async ({
  page,
}) => {
  await page.goto(".");
  const query = page.getByRole("combobox");
  await query.fill("日本史 せか");
  await expect(
    page.getByRole("option", { name: "世界", exact: true }),
  ).toBeVisible();
  await query.dispatchEvent("compositionstart");
  await expect(
    page.getByRole("option", { name: "世界", exact: true }),
  ).toBeVisible();
  await query.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(query).toHaveValue("日本史 せか");
  await expect(page.getByRole("listbox")).toBeVisible();
  await query.dispatchEvent("compositionend");
  await expect(
    page.getByRole("option", { name: "世界", exact: true }),
  ).toBeVisible();
  await query.fill("日本史 せかい");
  await expect(
    page.getByRole("option", { name: "世界", exact: true }),
  ).toBeVisible();
  await query.press("ArrowDown");
  await expect(query).toHaveAttribute("aria-activedescendant", /completion-/);
  await query.press("Enter");
  await expect(query).toHaveValue("日本史 世界");
});

test("stale results do not paint after replacement and invalid input recovers", async ({
  page,
}) => {
  await page.goto(".");
  const query = page.getByRole("combobox");
  await query.fill("bitam");
  await expect(
    page.getByRole("option", { name: "ビタミン", exact: true }),
  ).toBeVisible();
  await query.evaluate((input: HTMLInputElement) => {
    input.value = "bitam";
    input.setSelectionRange(5, 5);
    input.dispatchEvent(new Event("input"));
    input.value = "にh";
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new Event("input"));
  });
  await expect(
    page.getByRole("option", { name: "日本", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "ビタミン", exact: true }),
  ).toHaveCount(0);
  await query.fill("niho");
  await expect(
    page.getByRole("option", { name: "日本", exact: true }),
  ).toBeVisible();
  await query.fill("x".repeat(129));
  await expect(page.getByRole("status")).toHaveText(
    "この入力を補完できませんでした。",
  );
  await query.fill("bitam");
  await expect(
    page.getByRole("option", { name: "ビタミン", exact: true }),
  ).toBeVisible();
  await query.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
});

test("failed load can be retried", async ({ page }) => {
  await page.route("**/generated/current.json", (route) =>
    route.fulfill({ body: "invalid" }),
  );
  await page.goto(".");
  await expect(page.getByRole("status")).toHaveText(
    "索引を読み込めませんでした。",
  );
  await page.unroute("**/generated/current.json");
  await page.getByRole("button", { name: "補完を再起動" }).click();
  await page.getByRole("combobox").fill("kyouto");
  await expect(
    page.getByRole("option", { name: "京都", exact: true }),
  ).toBeVisible();
});
