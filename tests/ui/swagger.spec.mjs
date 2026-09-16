import { test, expect } from "@playwright/test";

const xmlHeaders = { "content-type": "application/xml", "access-control-allow-origin": "*" };
const organization = '<organization><id>1</id><name>Browser Test</name><coordinates><x>1</x><y>417</y></coordinates><creationDate>2026-09-12T10:30:00</creationDate><annualTurnover>1</annualTurnover><type>PUBLIC</type></organization>';

async function openOperation(page, id) {
  const block = page.locator(`.opblock[id$="-${id}"]`);
  await block.locator(".opblock-summary-control").click();
  await expect(block.locator(".opblock-body")).toBeVisible();
  return block;
}

async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
}

test("all operations and local assets render under a Helios-style path", async ({ page }, testInfo) => {
  const errors = [];
  const origins = new Set();
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", request => origins.add(new URL(request.url()).origin));
  await page.goto("/~student/soa-lab1/");
  await expect(page.locator(".opblock")).toHaveCount(13);
  await expect(page.getByRole("heading", { name: /Organization Services/ })).toBeVisible();
  await expect(page.locator(".errors-wrapper")).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("overview.png"), fullPage: true });
  const block = await openOperation(page, "managerAcquireOrganization");
  await expect(block).toContainText("without dismissing employees");
  await block.getByRole("button", { name: "Try it out", exact: true }).click();
  await expect(block.locator(".servers")).toContainText("http://localhost:8081");
  await noOverflow(page);
  await block.screenshot({ path: testInfo.outputPath("acquisition.png") });
  expect(errors).toEqual([]);
  expect(origins.size).toBe(1);
});

test("Try it out sends an XML organization body with the correct method and headers", async ({ page }) => {
  let captured;
  await page.route("http://localhost:8080/organizations", async route => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { ...xmlHeaders, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" } });
      return;
    }
    captured = route.request();
    await route.fulfill({ status: 201, headers: { ...xmlHeaders, location: "/organizations/1" }, body: organization });
  });
  await page.goto("/");
  const block = await openOperation(page, "createOrganization");
  await block.getByRole("button", { name: "Try it out", exact: true }).click();
  const input = '<organization><name>Browser Test</name><coordinates><x>1</x><y>417</y></coordinates><annualTurnover>1</annualTurnover><type>PUBLIC</type></organization>';
  await block.locator("textarea.body-param__text").fill(input);
  await block.getByRole("button", { name: "Execute", exact: true }).click();
  await expect.poll(() => captured?.method()).toBe("POST");
  expect(captured.postData()).toBe(input);
  expect(captured.headers()["content-type"]).toContain("application/xml");
  expect(captured.headers().accept).toContain("application/xml");
  expect(new URL(captured.url()).search).toBe("");
  await expect(block.locator(".live-responses-table")).toContainText("201");
  await noOverflow(page);
});

test("combined nested filters, sorting and pagination are serialized into the URL", async ({ page }) => {
  let captured;
  await page.route("http://localhost:8080/organizations?**", async route => {
    captured = route.request();
    await route.fulfill({ status: 200, headers: { ...xmlHeaders, "x-total-count": "0", "x-page": "2", "x-page-size": "5" }, body: "<organizations/>" });
  });
  await page.goto("/");
  const block = await openOperation(page, "listOrganizations");
  await block.getByRole("button", { name: "Try it out", exact: true }).click();
  await block.locator('tr[data-param-name="page"] input').fill("2");
  await block.locator('tr[data-param-name="size"] input').fill("5");
  await block.locator('tr[data-param-name="name"] input').fill("Research & Development");
  await block.locator('tr[data-param-name="officialAddress.town.name"] input[type="text"]').fill("Paris");
  await block.locator('tr[data-param-name="coordinates.y"] input').fill("417");
  await block.locator('tr[data-param-name="type"] select').selectOption("PUBLIC");
  await block.locator('tr[data-param-name="sort"] select').selectOption(["name", "-annualTurnover"]);
  await block.getByRole("button", { name: "Execute", exact: true }).click();
  await expect.poll(() => captured?.method()).toBe("GET");
  const params = new URL(captured.url()).searchParams;
  expect(params.get("page")).toBe("2");
  expect(params.get("size")).toBe("5");
  expect(params.get("name")).toBe("Research & Development");
  expect(params.get("officialAddress.town.name")).toBe("Paris");
  expect(params.get("coordinates.y")).toBe("417");
  expect(params.get("type")).toBe("PUBLIC");
  expect(params.get("sort")).toBe("name,-annualTurnover");
  expect(captured.postData()).toBeNull();
  await expect(block.locator(".live-responses-table")).toContainText("200");
  await noOverflow(page);
});

test("manager acquisition uses the manager server and both required path IDs", async ({ page }) => {
  let captured;
  await page.route("http://localhost:8081/orgmanager/acquise/1/2", async route => {
    captured = route.request();
    await route.fulfill({ status: 200, headers: xmlHeaders, body: `<acquisition>${organization}<acquiredId>2</acquiredId><employeeCount>8</employeeCount></acquisition>` });
  });
  await page.goto("/");
  const block = await openOperation(page, "managerAcquireOrganization");
  await block.getByRole("button", { name: "Try it out", exact: true }).click();
  await block.locator('tr[data-param-name="acquirer-id"] input').fill("1");
  await block.locator('tr[data-param-name="acquired-id"] input').fill("2");
  await block.getByRole("button", { name: "Execute", exact: true }).click();
  await expect.poll(() => captured?.method()).toBe("POST");
  expect(captured.postData()).toBeNull();
  expect(new URL(captured.url()).search).toBe("");
  await expect(block.locator(".live-responses-table")).toContainText("200");
  await noOverflow(page);
});
