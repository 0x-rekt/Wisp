import { tool } from "@openrouter/agent";
import { z } from "zod";
import {
  writeFile,
  editFile,
  getFileContent,
  listFiles,
  deleteFile,
} from "./files";

const filePathSchema = z
  .string()
  .min(1)
  .describe("A path relative to the current workspace");

const readFileTool = tool({
  name: "read_file",
  description:
    "Read a UTF-8 text file inside the workspace. Excluded files cannot be read.",
  inputSchema: z.object({ filepath: filePathSchema }),
  outputSchema: z.object({ path: z.string(), content: z.string() }),
  execute: async (params) => getFileContent((params as { filepath: string }).filepath),
});

const writeFileTool = tool({
  name: "write_file",
  description:
    "Create a new file or overwrite an existing file with the given content.",
  inputSchema: z.object({ filepath: filePathSchema, content: z.string() }),
  outputSchema: z.object({
    path: z.string(),
    created: z.literal(true),
    content: z.string(),
  }),
  requireApproval: true,
  execute: async (params) => { const { filepath, content } = params as { filepath: string; content: string }; return writeFile(filepath, content); },
});

const editFileTool = tool({
  name: "edit_file",
  description:
    "Edit a file using find-and-replace style replacement of oldStr with newStr.",
  inputSchema: z.object({
    filepath: filePathSchema,
    oldStr: z.string(),
    newStr: z.string(),
  }),
  outputSchema: z.object({ path: z.string(), content: z.string() }),
  requireApproval: true,
  execute: async (params) => { const { filepath, oldStr, newStr } = params as { filepath: string; oldStr: string; newStr: string }; return editFile(filepath, oldStr, newStr); },
});

const deleteFileTool = tool({
  name: "delete_file",
  description:
    "Delete a file inside the workspace. Excluded files cannot be deleted.",
  inputSchema: z.object({ filepath: filePathSchema }),
  outputSchema: z.object({ path: z.string(), deleted: z.literal(true) }),
  requireApproval: true,
  execute: async (params) => { const { filepath } = params as { filepath: string }; return deleteFile(filepath); },
});

const listFilesTool = tool({
  name: "list_files",
  description:
    "List files inside a workspace directory, optionally recursively. Excluded files are omitted.",
  inputSchema: z.object({
    filepath: filePathSchema,
    recursive: z.boolean().optional().default(false),
  }),
  outputSchema: z.object({ path: z.string(), files: z.array(z.string()) }),
  execute: async (params) => { const { filepath, recursive } = params as { filepath: string; recursive: boolean }; return listFiles(filepath, recursive); },
});

export { readFileTool, writeFileTool, editFileTool, deleteFileTool, listFilesTool };
