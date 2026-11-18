import { expect, test } from "@playwright/test";

test("a selected normalized noun searches its original documents", async ({
  page,
}) => {
  await page.goto(".");
  const query = page.getByRole("combobox");
  const results = page.locator("#results li");
  const search = page.getByRole("button", { name: "検索", exact: true });

  await query.fill("りん");
  await page.getByRole("option", { name: "林檎", exact: true }).click();
  await expect(query).toHaveValue("林檎");
  await search.click();
  await expect(results).toHaveText([/りんご/, /リンゴ/]);

  await query.fill("京都 林檎 食べる");
  await search.click();
  await expect(results).toHaveText([/京都.*りんごを食べた/]);

  await query.fill("リンゴ");
  await search.click();
  await expect(results).toHaveText([/リンゴ/]);
});
