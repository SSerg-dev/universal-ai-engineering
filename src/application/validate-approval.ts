import { ApprovalSnapshotSchema, GuardBoundaryError, PreparedExportPayloadSchema,
  type ApprovalSnapshot, type PreparedExportPayload } from "../domain/guard-contracts.js";
import { renderGroundedAnswer } from "./grounded-answer.js";
import type { ContentIdentityPort } from "./ports/content-identity-port.js";

export function validatePreparedExport(raw: unknown, identity: ContentIdentityPort): {
  payload: PreparedExportPayload; contentDigest: string; contentBytes: number;
} {
  try {
    const payload = PreparedExportPayloadSchema.parse(raw), { result } = payload;
    const sourceIds = result.sources.map(({ documentId }) => documentId);
    const claimIds = new Set(result.grounding.claims.map(({ citation }) => citation.documentId));
    if (result.answer !== renderGroundedAnswer(result.grounding) || new Set(sourceIds).size !== sourceIds.length ||
      sourceIds.length !== claimIds.size || sourceIds.some((id) => !claimIds.has(id))) throw new Error();
    return { payload, contentDigest: identity.digest(payload.markdown), contentBytes: new TextEncoder().encode(payload.markdown).byteLength };
  } catch { throw new GuardBoundaryError("GUARD_RESULT_INVALID"); }
}

/** Structural validation alone cannot establish the cryptographic binding. */
export function validateApprovalSnapshot(raw: unknown, identity: ContentIdentityPort): ApprovalSnapshot {
  try {
    const snapshot = ApprovalSnapshotSchema.parse(raw);
    if (snapshot.intent && identity.digest(JSON.stringify(snapshot.intent)) !== snapshot.proposalDigest) throw new Error();
    if (snapshot.payload) {
      const checked = validatePreparedExport(snapshot.payload, identity);
      if (!snapshot.intent || snapshot.intent.contentDigest !== checked.contentDigest || snapshot.intent.contentBytes !== checked.contentBytes) throw new Error();
    }
    return snapshot;
  } catch { throw new GuardBoundaryError("GUARD_RESULT_INVALID"); }
}
