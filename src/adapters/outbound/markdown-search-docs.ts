import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { SearchDocsPort } from "../../application/ports/search-docs-port.js";
import {
  SearchDocsInputSchema,
  SearchDocsOutputSchema,
  type SearchDocumentMatch,
  type SearchDocsInput,
  type SearchDocsOutput,
} from "../../domain/agent-contracts.js";

const MAX_EXCERPT_CHARACTERS = 240;

interface LoadedDocument {
  readonly documentId: string;
  readonly title: string;
  readonly content: string;
  readonly terms: ReadonlySet<string>;
  readonly contentLines: readonly string[];
}

export interface MarkdownSearchDocsOptions {
  readonly root: string;
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function tokenize(value: string): string[] {
  return value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function uniqueTerms(value: string): string[] {
  return [...new Set(tokenize(value))];
}

function boundedExcerpt(line: string): string {
  return Array.from(line).slice(0, MAX_EXCERPT_CHARACTERS).join("");
}

function firstMatchingExcerpt(
  document: LoadedDocument,
  matchedTerms: readonly string[],
): string {
  const matchingLine = document.contentLines.find((line) => {
    const lineTerms = new Set(tokenize(line));
    return matchedTerms.some((term) => lineTerms.has(term));
  });

  return matchingLine === undefined ? "" : boundedExcerpt(matchingLine);
}

async function loadDocument(root: string, filename: string): Promise<LoadedDocument> {
  const content = await readFile(join(root, filename), "utf8");
  const lines = content.split(/\r?\n/u);
  const firstContentLine = lines.find((line) => line.trim().length > 0)?.trim();
  const title = firstContentLine?.match(/^#\s+(.+?)\s*$/u)?.[1]?.trim();

  if (title === undefined) {
    throw new Error(
      `Markdown fixture ${filename} first non-empty line must be a level-one heading.`,
    );
  }

  const contentLines = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return Object.freeze({
    documentId: basename(filename, ".md"),
    title,
    content,
    terms: new Set(tokenize(content)),
    contentLines: Object.freeze(contentLines),
  });
}

export class MarkdownSearchDocs implements SearchDocsPort {
  readonly #documents: readonly LoadedDocument[];

  private constructor(documents: readonly LoadedDocument[]) {
    this.#documents = Object.freeze([...documents]);
  }

  static async load(options: MarkdownSearchDocsOptions): Promise<MarkdownSearchDocs> {
    const entries = await readdir(options.root, { withFileTypes: true });
    const filenames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort(compareOrdinal);
    const documents = await Promise.all(
      filenames.map((filename) => loadDocument(options.root, filename)),
    );

    return new MarkdownSearchDocs(documents);
  }

  async search(input: SearchDocsInput, signal: AbortSignal): Promise<SearchDocsOutput> {
    signal.throwIfAborted();
    const parsedInput = SearchDocsInputSchema.parse(input);
    const queryTerms = uniqueTerms(parsedInput.query);
    const matches = this.#documents
      .map((document): SearchDocumentMatch | undefined => {
        const matchedTerms = queryTerms.filter((term) => document.terms.has(term));
        if (matchedTerms.length === 0) return undefined;

        return {
          documentId: document.documentId,
          title: document.title,
          excerpt: firstMatchingExcerpt(document, matchedTerms),
          matchedTerms,
        };
      })
      .filter((match): match is SearchDocumentMatch => match !== undefined)
      .sort(
        (left, right) =>
          right.matchedTerms.length - left.matchedTerms.length ||
          compareOrdinal(left.documentId, right.documentId),
      )
      .slice(0, parsedInput.limit);

    signal.throwIfAborted();
    return SearchDocsOutputSchema.parse({ matches });
  }
}
