import {
  GroundedAnswerSchema, RetrievalBoundaryError, RetrievalOutputSchema,
  type Citation, type GroundedAnswer, type Passage,
} from "../domain/retrieval-contracts.js";

export function citationFor(passage: Passage): Citation {
  return {
    indexId: passage.indexId, documentId: passage.documentId, revision: passage.revision,
    passageId: passage.passageId, start: passage.start, end: passage.end,
  };
}

export function validateGroundedAnswer(rawAnswer: unknown, rawEvidence: unknown): GroundedAnswer {
  const answer = GroundedAnswerSchema.safeParse(rawAnswer);
  const evidence = RetrievalOutputSchema.safeParse(rawEvidence);
  if (!answer.success || !evidence.success) throw new RetrievalBoundaryError("CITATION_INVALID");
  if (answer.data.status === "abstained") {
    if (evidence.data.passages.length !== 0) throw new RetrievalBoundaryError("CITATION_INVALID");
    return answer.data;
  }
  const seen = new Set<string>();
  for (const claim of answer.data.claims) {
    const passage = evidence.data.passages.find(({ passageId }) => passageId === claim.citation.passageId);
    if (passage === undefined || seen.has(passage.passageId) || claim.quote !== passage.text ||
      JSON.stringify(claim.citation) !== JSON.stringify(citationFor(passage))) throw new RetrievalBoundaryError("CITATION_INVALID");
    seen.add(passage.passageId);
  }
  return answer.data;
}

export function renderGroundedAnswer(answer: GroundedAnswer): string {
  if (answer.status === "abstained") return "No supporting indexed passages were found.";
  return answer.claims.map(({ quote, citation }) =>
    `> ${quote.replaceAll("\n", "\n> ")}\nCitation: ${JSON.stringify(citation)}`).join("\n\n");
}
