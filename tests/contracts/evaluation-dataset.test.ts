import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { Sha256ContentIdentity } from "../../src/adapters/outbound/sha256-content-identity.js";
import { EvaluationDatasetBodySchema, EvaluationDatasetSchema } from "../../src/domain/evaluation-contracts.js";

describe("Published internal-documentation evaluation dataset", () => {
  it("pins v1 expectations and the canonical dataset revision", () => {
    const path = fileURLToPath(new URL("../../fixtures/evaluations/internal-docs.v1.json", import.meta.url));
    const { revision, ...body } = EvaluationDatasetSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    expect(body.datasetId).toBe("internal-docs");
    expect(body.version).toBe("1.0.0");
    expect(body.cases.map(({ expected }) => expected.kind)).toEqual(["answered", "abstained", "failed"]);
    expect(revision).toBe("1d04a965af0ff9b85355dbaaa5df72089a8c4971dc4b1155fc3178aaf9e931d2");
    expect(new Sha256ContentIdentity().digest(JSON.stringify(EvaluationDatasetBodySchema.parse(body)))).toBe(revision);
  });
});
