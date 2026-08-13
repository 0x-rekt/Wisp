import { tool } from "@openrouter/agent";
import { z } from "zod";
import { writeFile, editFile, getFileContent } from "./files";

const filePathSchema = z
  .string()
  .min(1)
  .describe("A path relative to the current workspace");

const readFileTool = tool({
  name: "read_file",
  description: "Read a UTF-8 text file inside the workspace. Excluded files cannot be read.",
  inputSchema: z.object({ filepath: filePathSchema }),
  outputSchema: z.object({ path: z.string(), content: z.string() }),
  execute: async ({ filepath }) => getFileContent(filepath),
});

const writeFileTool = tool({
  name: "write_file",
  description: "Create a new file or overwrite an existing file with the given content.",
  inputSchema: z.object({ filepath: filePathSchema, content: z.string() }),
  outputSchema: z.object({ path: z.string(), created: z.literal(true), content: z.string() }),
  requireApproval: true,
  execute: async ({ filepath, content }) => writeFile(filepath, content),
});

const editFileTool = tool({
  name: "edit_file",
  description: "Edit a file using find-and-replace style replacement of oldStr with newStr.",
  inputSchema: z.object({ filepath: filePathSchema, oldStr: z.string(), newStr: z.string() }),
  outputSchema: z.object({ path: z.string(), content: z.string() }),
  requireApproval: true,
  execute: async ({ filepath, oldStr, newStr }) => editFile(filepath, oldStr, newStr),
});

export { readFileTool, writeFileTool, editFileTool };