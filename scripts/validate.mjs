import { loadSpec, validateContract } from "./contract.mjs";

try {
  const spec = await loadSpec();
  const result = validateContract(spec);
  console.log(`OpenAPI ${spec.openapi} valid: ${result.operations} operations; ${result.examples} XML request/response examples checked.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
