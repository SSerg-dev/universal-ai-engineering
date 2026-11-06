import { readFile } from "node:fs/promises";
import type { Tool } from "../application/ports.js";

const documentUrl = new URL("../../fixtures/node-setup.md", import.meta.url);
const heading = "Check the installed version\n";

export const fixtureTool: Tool = {
  async execute(_input, signal) {
    const document = await readFile(documentUrl, { encoding: "utf8", signal });
    const section = document.replaceAll("\r\n", "\n").split(/^## /m)
      .find((part) => part.startsWith(heading));
    const text = section?.slice(heading.length).trim();
    if (!text) throw new Error("The Node.js version section is missing");
    return { text };
  },
};
