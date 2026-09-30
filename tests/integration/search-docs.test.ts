import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { MarkdownSearchDocs } from "../../src/adapters/outbound/markdown-search-docs.js";

const rootsToRemove: string[] = [];

async function temporaryDirectory(prefix = "uaos-search-"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  rootsToRemove.push(root);
  return root;
}

async function writeFixtures(
  root: string,
  fixtures: ReadonlyArray<readonly [filename: string, content: string]>,
): Promise<void> {
  for (const [filename, content] of fixtures) {
    await writeFile(join(root, filename), content, "utf8");
  }
}

afterEach(async () => {
  await Promise.all(
    rootsToRemove.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("MarkdownSearchDocs startup boundaries", () => {
  it("rejects invalid roots and fixtures whose first content line is not an H1", async () => {
    const missingRoot = join(await temporaryDirectory(), "missing");
    await expect(MarkdownSearchDocs.load({ root: missingRoot })).rejects.toThrow();

    const fileInsteadOfRoot = join(await temporaryDirectory(), "fixture.md");
    await writeFile(fileInsteadOfRoot, "# Fixture\n\nBody", "utf8");
    await expect(
      MarkdownSearchDocs.load({ root: fileInsteadOfRoot }),
    ).rejects.toThrow();

    const prefaceRoot = await temporaryDirectory();
    await writeFixtures(prefaceRoot, [
      ["preface.md", "Preface before title\n\n# Late title\n\nSearchable body."],
    ]);
    await expect(MarkdownSearchDocs.load({ root: prefaceRoot })).rejects.toThrow(
      /first non-empty line.*level-one heading/iu,
    );

    const missingTitleRoot = await temporaryDirectory();
    await writeFixtures(missingTitleRoot, [
      ["untitled.md", "## Secondary heading\n\nSearchable body."],
    ]);
    await expect(MarkdownSearchDocs.load({ root: missingTitleRoot })).rejects.toThrow(
      /level-one heading/iu,
    );
  });

  it("keeps the configured root isolated from query-derived path text", async () => {
    const parent = await temporaryDirectory();
    const root = join(parent, "trusted");
    await mkdir(root);
    await writeFixtures(root, [
      ["inside.md", "# Inside\n\nOnly controlled material is searchable."],
    ]);
    await writeFile(
      join(parent, "outside-doc.md"),
      "# Outside\n\nclassifiedrootescape must never be loaded",
      "utf8",
    );

    const search = await MarkdownSearchDocs.load({ root });
    await expect(
      search.search(
        { query: "../outside-doc.md classifiedrootescape", limit: 5 },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ matches: [] });
  });
});

describe("MarkdownSearchDocs lexical determinism", () => {
  it("normalizes Unicode and case while scoring unique first-seen terms", async () => {
    const root = await temporaryDirectory();
    await writeFixtures(root, [
      [
        "b-doc.md",
        "# Beta\n\nＡＧＥＮＴ journal journal １２ preserve evidence.",
      ],
      ["a-doc.md", "# Alpha\n\nAgent 12 evidence appears here."],
      ["c-doc.md", "# Gamma\n\nAn agent appears alone."],
    ]);
    const search = await MarkdownSearchDocs.load({ root });

    await expect(
      search.search(
        { query: "ＡＧＥＮＴ agent １２ 12 EVIDENCE evidence", limit: 5 },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      matches: [
        {
          documentId: "a-doc",
          title: "Alpha",
          excerpt: "Agent 12 evidence appears here.",
          matchedTerms: ["agent", "12", "evidence"],
        },
        {
          documentId: "b-doc",
          title: "Beta",
          excerpt: "ＡＧＥＮＴ journal journal １２ preserve evidence.",
          matchedTerms: ["agent", "12", "evidence"],
        },
        {
          documentId: "c-doc",
          title: "Gamma",
          excerpt: "An agent appears alone.",
          matchedTerms: ["agent"],
        },
      ],
    });
  });

  it("orders score ties by ordinal documentId and applies validated limits", async () => {
    const root = await temporaryDirectory();
    await writeFixtures(root, [
      ["b-guide.md", "# B Guide\n\nShared lexical term."],
      ["a-guide.md", "# A Guide\n\nShared lexical term."],
      ["c-guide.md", "# C Guide\n\nShared lexical term."],
    ]);
    const search = await MarkdownSearchDocs.load({ root });

    const one = await search.search(
      { query: "shared shared SHARED", limit: 1 },
      new AbortController().signal,
    );
    const five = await search.search(
      { query: "shared shared SHARED", limit: 5 },
      new AbortController().signal,
    );

    expect(one.matches.map(({ documentId }) => documentId)).toEqual(["a-guide"]);
    expect(five.matches.map(({ documentId }) => documentId)).toEqual([
      "a-guide",
      "b-guide",
      "c-guide",
    ]);
    expect(five.matches.every(({ matchedTerms }) => matchedTerms.length === 1)).toBe(
      true,
    );
  });

  it("uses the first matching non-heading line and bounds excerpts deterministically", async () => {
    const root = await temporaryDirectory();
    const longLine = `agent ${"x".repeat(300)}`;
    await writeFixtures(root, [
      [
        "01-Guide.md",
        `# Stable Guide\n\n## agent heading is not an excerpt\n\nUnrelated line.\n\n${longLine}\n\nagent later line.`,
      ],
    ]);
    const search = await MarkdownSearchDocs.load({ root });
    const result = await search.search(
      { query: "agent", limit: 3 },
      new AbortController().signal,
    );

    expect(result).toEqual({
      matches: [
        {
          documentId: "01-Guide",
          title: "Stable Guide",
          excerpt: Array.from(longLine).slice(0, 240).join(""),
          matchedTerms: ["agent"],
        },
      ],
    });
  });

  it("returns identical ordered output across creation orders and repeated runs", async () => {
    const firstRoot = await temporaryDirectory();
    const secondRoot = await temporaryDirectory();
    const fixtures = [
      ["b.md", "# B\n\nDeterministic journal evidence."],
      ["a.md", "# A\n\nDeterministic journal evidence."],
    ] as const;
    await writeFixtures(firstRoot, fixtures);
    await writeFixtures(secondRoot, [...fixtures].reverse());
    const first = await MarkdownSearchDocs.load({ root: firstRoot });
    const second = await MarkdownSearchDocs.load({ root: secondRoot });
    const input = { query: "journal evidence", limit: 5 } as const;

    const firstRun = await first.search(input, new AbortController().signal);
    const repeatedRun = await first.search(input, new AbortController().signal);
    const differentlyCreatedRun = await second.search(
      input,
      new AbortController().signal,
    );

    expect(repeatedRun).toEqual(firstRun);
    expect(differentlyCreatedRun).toEqual(firstRun);
    expect(firstRun.matches.map(({ documentId }) => documentId)).toEqual(["a", "b"]);
  });

  it("returns a successful empty result when no controlled document matches", async () => {
    const root = await temporaryDirectory();
    await writeFixtures(root, [
      ["known.md", "# Known\n\nOnly controlled terms are present."],
    ]);
    const search = await MarkdownSearchDocs.load({ root });

    await expect(
      search.search(
        { query: "xylophone zephyr 404", limit: 5 },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ matches: [] });
  });
});
