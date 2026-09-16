import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { createValidator, loadSpec, operations, validateContract, validateXml } from "../scripts/contract.mjs";

const spec = await loadSpec();
const schemas = spec.components.schemas;
const ajv = createValidator();
const validWrite = {
  name: "Example Organization", coordinates: { x: 12.5, y: 417 },
  annualTurnover: 1, type: "PUBLIC"
};
const validOrganization = { id: 1, ...validWrite, creationDate: "2026-09-12T10:30:00" };

function valid(schema, value) {
  return ajv.compile(schema)(value);
}

test("all operations, XML examples and URL parameters form a valid contract", () => {
  const result = validateContract(spec);
  assert.equal(result.operations, 13);
  assert(result.examples > 70);
  const expected = [
    "POST /organizations", "GET /organizations", "GET /organizations/{id}",
    "PUT /organizations/{id}", "DELETE /organizations/{id}",
    "DELETE /organizations/by-type/{type}", "GET /organizations/count-by-type-greater-than/{type}",
    "GET /organizations/by-annual-turnover-less-than/{annualTurnover}",
    "GET /organizations/{id}/headcount", "POST /organizations/{id}/hires",
    "POST /organization-acquisitions", "POST /orgmanager/hire/{id}",
    "POST /orgmanager/acquise/{acquirer-id}/{acquired-id}"
  ].sort();
  assert.deepEqual([...operations(spec)].map(({ path, method }) => `${method.toUpperCase()} ${path}`).sort(), expected);
});

test("required organization data and generated field separation", () => {
  assert(valid(schemas.OrganizationWrite, validWrite));
  assert(valid(schemas.Organization, validOrganization));
  for (const field of ["name", "coordinates", "annualTurnover", "type"]) {
    const omitted = { ...validWrite };
    delete omitted[field];
    assert(!valid(schemas.OrganizationWrite, omitted), `missing ${field}`);
    assert(!valid(schemas.OrganizationWrite, { ...validWrite, [field]: null }), `null ${field}`);
  }
  assert(!valid(schemas.OrganizationWrite, validOrganization));
  assert(!valid(schemas.Organization, validWrite));
  assert(!valid(schemas.OrganizationWrite, { ...validWrite, name: "" }));
  assert(valid(schemas.OrganizationWrite, { ...validWrite, name: " " }));
  assert(!valid(schemas.OrganizationWrite, { ...validWrite, employeeCount: 1 }));
  assert(!valid(schemas.Organization, { ...validOrganization, id: 0 }));
});

test("numeric boundaries, finite floats and nested required fields", () => {
  for (const annualTurnover of [0, -1, 1.5, 2147483648]) {
    assert(!valid(schemas.OrganizationWrite, { ...validWrite, annualTurnover }));
  }
  assert(valid(schemas.OrganizationWrite, { ...validWrite, annualTurnover: 2147483647 }));
  for (const coordinates of [{ x: 0, y: 417.01 }, { x: Infinity, y: 0 }, { x: 0, y: NaN }, { x: 3.5e38, y: 0 }, { x: 0 }, { y: 0 }]) {
    assert(!valid(schemas.OrganizationWrite, { ...validWrite, coordinates }));
  }
  assert(valid(schemas.Coordinates, { x: -123.5, y: -10000 }));
  assert(!valid(schemas.Headcount, { organizationId: 1, employeeCount: -1 }));
  assert(valid(schemas.Headcount, { organizationId: 1, employeeCount: 0 }));
});

test("nullable address/town and valid empty strings match the supplied class", () => {
  for (const officialAddress of [null, { zipCode: "" }, { zipCode: "x".repeat(18), town: null }, { zipCode: "", town: { x: -1, y: 0, name: "" } }]) {
    assert(valid(schemas.OrganizationWrite, { ...validWrite, officialAddress }));
  }
  for (const officialAddress of [{}, { zipCode: null }, { zipCode: "x".repeat(19) }, { zipCode: "", town: {} }, { zipCode: "", town: { x: null, y: 0, name: "" } }, { zipCode: "", town: { x: 0, y: 0 } }]) {
    assert(!valid(schemas.OrganizationWrite, { ...validWrite, officialAddress }));
  }
});

test("creationDate is a real local timestamp, including leap days and nanoseconds", () => {
  for (const value of ["2024-02-29T23:59:59.123456789", "2026-09-12T00:00:00", "2000-02-29T12:00:00.1"]) {
    assert(valid(schemas.LocalDateTime, value));
  }
  for (const value of ["2026-02-29T00:00:00", "1900-02-29T00:00:00", "0000-01-01T00:00:00", "2026-04-31T00:00:00", "2026-09-12T24:00:00", "2026-09-12T00:00:00Z", "2026-09-12T00:00:00+03:00", "2026-09-12T00:00:00.1234567890"]) {
    assert(!valid(schemas.LocalDateTime, value), value);
  }
});

test("XML wrapper, null omission, escaping, duplicates and exact int64 boundaries", () => {
  const input = spec.components.requestBodies.OrganizationInput.content["application/xml"].examples.complete.value;
  assert.equal(validateXml(input, schemas.OrganizationWrite).officialAddress.zipCode, "75001");
  assert.equal(validateXml(input.replace("Example Organization", "Research &amp; Development"), schemas.OrganizationWrite).name, "Research & Development");
  assert.deepEqual(validateXml("<organizations/>", schemas.OrganizationList), []);
  const output = spec.components.examples.OrganizationExample.value;
  assert.equal(validateXml(`<organizations>${output}${output.replace("<id>1</id>", "<id>2</id>")}</organizations>`, schemas.OrganizationList).length, 2);
  for (const xml of [input.replace("<name>Example Organization</name>", "<name>A</name><name>B</name>"), input.replace("<coordinates>", "<coordinates xsi:nil=\"true\">"), input.replace("<zipCode>75001</zipCode>", ""), "<organization>", "<wrong/>"]) {
    assert.throws(() => validateXml(xml, schemas.OrganizationWrite));
  }
  assert.doesNotThrow(() => validateXml(output.replace("<id>1</id>", "<id>9223372036854775807</id>"), schemas.Organization));
  assert.throws(() => validateXml(output.replace("<id>1</id>", "<id>9223372036854775808</id>"), schemas.Organization));
  const townMin = input.replace("<x>10</x>", "<x>-9223372036854775808</x>");
  assert.doesNotThrow(() => validateXml(townMin, schemas.OrganizationWrite));
  assert.throws(() => validateXml(townMin.replace("-9223372036854775808", "-9223372036854775809"), schemas.OrganizationWrite));
});

test("every scalar field is filterable and sortable; combined and nullable filters are exposed", () => {
  function leafPaths(schema, prefix = "") {
    return Object.entries(schema.properties).flatMap(([name, field]) => {
      const path = prefix ? `${prefix}.${name}` : name;
      return field.type === "object" ? leafPaths(field, path) : [path];
    });
  }
  const leaves = leafPaths(schemas.Organization);
  const params = spec.paths["/organizations"].get.parameters;
  const byName = new Map(params.map(parameter => [parameter.name, parameter]));
  const sort = byName.get("sort");
  assert.equal(sort.explode, false);
  for (const name of leaves) {
    assert(byName.has(name), `missing filter ${name}`);
    assert(sort.schema.items.enum.includes(name), `missing ascending sort ${name}`);
    assert(sort.schema.items.enum.includes(`-${name}`), `missing descending sort ${name}`);
  }
  for (const name of ["officialAddress.isNull", "officialAddress.town.isNull"]) assert.equal(byName.get(name).schema.type, "boolean");
  assert(valid(sort.schema, ["name", "-annualTurnover"]));
  assert(!valid(sort.schema, ["unknown"]));
  assert(!valid(sort.schema, ["id", "id"]));
  assert.match(spec.paths["/organizations"].get.description, /combined with AND/);
  assert.match(spec.paths["/organizations"].get.description, /Contradictory filters\s+produce an empty result/);
});

test("pagination defaults and limits are shared by both array operations", () => {
  for (const path of ["/organizations", "/organizations/by-annual-turnover-less-than/{annualTurnover}"]) {
    const operation = spec.paths[path].get;
    const page = operation.parameters.find(parameter => parameter.name === "page").schema;
    const size = operation.parameters.find(parameter => parameter.name === "size").schema;
    assert.equal(page.default, 1);
    assert.equal(size.default, 20);
    assert(valid(page, 1));
    assert(!valid(page, 0));
    assert(!valid(page, 1.5));
    assert(valid(size, 100));
    assert(!valid(size, 101));
    assert(!valid(size, 0));
    assert.deepEqual(Object.keys(operation.responses["200"].headers), ["X-Total-Count", "X-Page", "X-Page-Size"]);
    assert.equal(operation.responses["200"].content["application/xml"].examples.empty.value, "<organizations/>");
  }
  const threshold = spec.paths["/organizations/by-annual-turnover-less-than/{annualTurnover}"].get.parameters[0].schema;
  assert(valid(threshold, 0));
  assert(valid(threshold, -2147483648));
  assert(!valid(threshold, 2147483648));
});

test("enum declaration order and transactional failure requirements are explicit", () => {
  assert.deepEqual(schemas.OrganizationType.enum, ["PUBLIC", "GOVERNMENT", "TRUST", "PRIVATE_LIMITED_COMPANY"]);
  assert(!valid(schemas.OrganizationType, "public"));
  const acquisition = spec.paths["/organization-acquisitions"].post;
  for (const status of ["200", "400", "404", "409"]) assert(acquisition.responses[status]);
  assert.match(acquisition.description, /All failures\s+leave both organizations and headcounts unchanged/);
  assert.match(acquisition.description, /No employees are dismissed/);
  assert.match(acquisition.description, /2147483647/);
  assert.match(acquisition.description, /9223372036854775807/);
  for (const path of ["/orgmanager/hire/{id}", "/orgmanager/acquise/{acquirer-id}/{acquired-id}"]) {
    const item = spec.paths[path];
    assert.equal(item.post.servers[0].variables.baseUrl.default, "http://localhost:8081");
    for (const status of ["404", "409", "502", "504"]) assert(item.post.responses[status]);
    assert.equal(item.post.requestBody, undefined);
  }
});

test("source YAML preserves precise Java Long bounds", async () => {
  const source = YAML.parse(await readFile(new URL("../openapi.yaml", import.meta.url), "utf8"), { intAsBigInt: true });
  assert.equal(source.components.schemas.PositiveId.maximum, 9223372036854775807n);
  assert.equal(source.components.schemas.Location.properties.x.minimum, -9223372036854775808n);
});
