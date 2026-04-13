import { expect, test } from "@playwright/test";

async function openFocusedSymbolFlow(page: import("@playwright/test").Page) {
  const workspacesResponse = await page.request.get("/api/workspaces");
  const workspacesPayload = await workspacesResponse.json();
  const workspaceId = workspacesPayload.items[0]?.id;

  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByLabel("Repository scope").selectOption("apps/api");
  await page.getByLabel("Query").fill("listUsers");
  const searchResult = page
    .locator(".results-list .list-item")
    .filter({ hasText: "listUsers" })
    .first();
  await expect(searchResult).toBeVisible();
  await searchResult.click();
}

test("promotes graph and inspector above supporting panels on desktop", async ({
  page,
}) => {
  await openFocusedSymbolFlow(page);

  await expect(page.locator(".graph-panel")).toBeVisible();
  await expect(page.locator(".inspector-panel")).toContainText(
    /route-handler via/,
  );

  const graphBox = await page.locator(".graph-panel").boundingBox();
  const supportingBox = await page
    .locator(".workspace-supporting-panels")
    .boundingBox();

  expect(graphBox?.y ?? 0).toBeLessThan(supportingBox?.y ?? 0);
});

test.describe("mobile", () => {
  test.use({
    viewport: {
      width: 390,
      height: 844,
    },
  });

  test("keeps graph then inspector ahead of supporting panels on mobile", async ({
    page,
  }) => {
    await openFocusedSymbolFlow(page);

    const graphBox = await page.locator(".graph-panel").boundingBox();
    const inspectorBox = await page.locator(".inspector-panel").boundingBox();
    const supportingBox = await page
      .locator(".workspace-supporting-panels")
      .boundingBox();

    expect(graphBox?.y ?? 0).toBeLessThan(inspectorBox?.y ?? 0);
    expect(inspectorBox?.y ?? 0).toBeLessThan(supportingBox?.y ?? 0);
  });
});
