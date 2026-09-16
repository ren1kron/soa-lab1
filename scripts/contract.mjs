import assert from "node:assert/strict";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { fileURLToPath } from "node:url";

export const methods = ["get", "post", "put", "delete", "patch", "head", "options", "trace"];
export const specPath = fileURLToPath(new URL("../openapi.yaml", import.meta.url));
export const loadSpec = () => SwaggerParser.validate(specPath);

export function isLocalDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month]
    && hour <= 23 && minute <= 59 && second <= 59;
}

export function createValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true });
  ajv.addFormat("local-date-time", isLocalDateTime);
  ajv.addFormat("int32", { type: "number", validate: value => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 });
  ajv.addFormat("int64", { type: "number", validate: Number.isInteger });
  ajv.addFormat("float", { type: "number", validate: Number.isFinite });
  return ajv;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  ignoreDeclaration: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false
});

function shape(schema) {
  return schema.type ? schema : { ...schema, ...schema.allOf?.[0] };
}

function entries(node, path) {
  if (node === "") return [];
  assert(node && typeof node === "object" && !Array.isArray(node), `${path}: expected XML elements`);
  return Object.entries(node).filter(([key, value]) => {
    if (key === "#text") {
      assert.equal(value.trim(), "", `${path}: unexpected mixed text`);
      return false;
    }
    assert(!key.startsWith("@_"), `${path}: XML attributes and xsi:nil are unsupported`);
    return true;
  });
}

function decode(node, schema, path) {
  const current = shape(schema);
  if (current.type === "object") {
    return Object.fromEntries(entries(node, path).map(([key, value]) => {
      const property = Object.entries(current.properties).find(([name, child]) => (child.xml?.name || name) === key);
      assert(property, `${path}: unknown element ${key}`);
      assert(!Array.isArray(value), `${path}.${key}: duplicate singular element`);
      return [property[0], decode(value, property[1], `${path}.${key}`)];
    }));
  }
  if (current.type === "array") {
    const childName = current.items.xml?.name;
    const children = entries(node, path);
    assert(children.every(([key]) => key === childName), `${path}: unexpected array item`);
    const values = children.length ? children[0][1] : [];
    return (Array.isArray(values) ? values : [values]).map(value => decode(value, current.items, `${path}.${childName}`));
  }
  assert.equal(typeof node, "string", `${path}: expected a scalar XML element`);
  if (current.type === "integer") {
    assert(/^[+-]?\d+$/.test(node), `${path}: invalid integer`);
    const exact = BigInt(node);
    if (current.format === "int64") {
      assert(exact >= -9223372036854775808n && exact <= 9223372036854775807n, `${path}: outside Java Long range`);
    }
    if (current.format === "int32") {
      assert(exact >= -2147483648n && exact <= 2147483647n, `${path}: outside Java int range`);
    }
    return Number(node);
  }
  if (current.type === "number") {
    assert(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(node), `${path}: invalid finite number`);
    assert(Number.isFinite(Number(node)), `${path}: non-finite number`);
    return Number(node);
  }
  if (current.type === "boolean") {
    assert(["true", "false"].includes(node), `${path}: invalid boolean`);
    return node === "true";
  }
  return node;
}

export function decodeXml(xml, schema) {
  const wellFormed = XMLValidator.validate(xml);
  assert.equal(wellFormed, true, `Malformed XML: ${JSON.stringify(wellFormed)}`);
  assert(!/<!DOCTYPE/i.test(xml), "DTD declarations are unsupported in documentation examples");
  const document = parser.parse(xml);
  const roots = Object.keys(document);
  assert.deepEqual(roots, [schema.xml.name], "Unexpected XML root");
  return decode(document[roots[0]], schema, roots[0]);
}

export function validateXml(xml, schema, ajv = createValidator()) {
  const data = decodeXml(xml, schema);
  const validate = ajv.compile(schema);
  assert(validate(data), JSON.stringify(validate.errors, null, 2));
  return data;
}

export function* operations(spec) {
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of methods) {
      if (item[method]) yield { path, method, item, operation: item[method] };
    }
  }
}

export function validateContract(spec) {
  const ids = new Set();
  const ajv = createValidator();
  let examples = 0;
  for (const { path, method, item, operation } of operations(spec)) {
    const label = `${method.toUpperCase()} ${path}`;
    assert(operation.operationId && !ids.has(operation.operationId), `${label}: missing/duplicate operationId`);
    ids.add(operation.operationId);
    assert(operation.summary && operation.description, `${label}: missing operation documentation`);
    const params = [...(item.parameters || []), ...(operation.parameters || [])];
    const names = new Set();
    for (const parameter of params) {
      assert(["path", "query"].includes(parameter.in), `${label}: operation parameter is outside the URL`);
      const name = `${parameter.in}:${parameter.name}`;
      assert(!names.has(name), `${label}: duplicate parameter ${name}`);
      names.add(name);
      if (parameter.in === "path") assert(parameter.required, `${label}: optional path parameter`);
      if (parameter.example !== undefined) {
        const validate = ajv.compile(parameter.schema);
        assert(validate(parameter.example), `${label}: invalid parameter example ${name}`);
      }
    }
    const expectedNames = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(params.filter(param => param.in === "path").map(param => param.name).sort(), expectedNames, `${label}: path parameters`);
    for (const [status, response] of Object.entries(operation.responses)) {
      if (status === "204") {
        assert.equal(response.content, undefined, `${label}: 204 cannot have a body`);
        continue;
      }
      assert.deepEqual(Object.keys(response.content), ["application/xml"], `${label}: non-XML response`);
      const media = response.content["application/xml"];
      const values = media.examples ? Object.values(media.examples).map(example => example.value) : [media.example];
      for (const xml of values) {
        assert.equal(typeof xml, "string", `${label}: missing XML example for ${status}`);
        const result = validateXml(xml, media.schema, ajv);
        if (Number(status) >= 400) assert.equal(result.status, Number(status), `${label}: error example status mismatch`);
        examples++;
      }
    }
    if (operation.requestBody) {
      assert(operation.requestBody.required, `${label}: body must be required`);
      assert.deepEqual(Object.keys(operation.requestBody.content), ["application/xml"], `${label}: non-XML request`);
      const media = operation.requestBody.content["application/xml"];
      for (const example of Object.values(media.examples)) {
        validateXml(example.value, media.schema, ajv);
        examples++;
      }
    }
  }
  return { operations: ids.size, examples };
}
