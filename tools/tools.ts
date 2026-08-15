import { tool } from "@openrouter/agent";
import { z } from "zod";
import {
  writeFile,
  editFile,
  getFileContent,
  listFiles,
  searchFiles,
  deleteFile,
} from "./files";
import { runCommand } from "./commands";
import { webSearch } from "./web";
import { sessionManager } from "../session";

const filePathSchema = z
  .string()
  .min(1)
  .describe("A path relative to the current workspace");

const readFileInputSchema = z.object({ filepath: filePathSchema });
type ReadFileInput = z.infer<typeof readFileInputSchema>;

const writeFileInputSchema = z.object({
  filepath: filePathSchema,
  content: z.string(),
});
type WriteFileInput = z.infer<typeof writeFileInputSchema>;

const editFileInputSchema = z.object({
  filepath: filePathSchema,
  oldStr: z.string(),
  newStr: z.string(),
});
type EditFileInput = z.infer<typeof editFileInputSchema>;

const deleteFileInputSchema = z.object({ filepath: filePathSchema });
type DeleteFileInput = z.infer<typeof deleteFileInputSchema>;

const runCommandInputSchema = z.object({
  command: z.string().min(1).max(2000),
});
type RunCommandInput = z.infer<typeof runCommandInputSchema>;

const searchCodeInputSchema = z.object({
  query: z.string().min(1),
  filepath: filePathSchema.optional().default("."),
  globPattern: z.string().min(1).optional().default("**/*"),
  recursive: z.boolean().optional().default(true),
});
type SearchCodeInput = z.infer<typeof searchCodeInputSchema>;

const listFilesInputSchema = z.object({
  filepath: filePathSchema,
  recursive: z.boolean().optional().default(false),
});
type ListFilesInput = z.infer<typeof listFilesInputSchema>;

const readFileTool = tool({
  name: "read_file",
  description:
    "Read a UTF-8 text file inside the workspace. Excluded files cannot be read.",
  inputSchema: readFileInputSchema,
  outputSchema: z.object({ path: z.string(), content: z.string() }),
  execute: async (params: ReadFileInput) => {
    const result = getFileContent(params.filepath);
    sessionManager.appendToolResult({
      callId: "",
      name: "read_file",
      result,
      completedAt: new Date().toISOString(),
    });
    return result;
  },
});

const writeFileTool = tool({
  name: "write_file",
  description:
    "Create a new file or overwrite an existing file with the given content.",
  inputSchema: writeFileInputSchema,
  outputSchema: z.object({
    path: z.string(),
    created: z.literal(true),
    content: z.string(),
  }),
  requireApproval: true,
  execute: async (params: WriteFileInput) => {
    const result = writeFile(params.filepath, params.content);
    sessionManager.appendToolResult({
      callId: "",
      name: "write_file",
      result,
      changedFiles: [params.filepath],
      completedAt: new Date().toISOString(),
    });
    return result;
  },
});

const editFileTool = tool({
  name: "edit_file",
  description:
    "Edit a file using find-and-replace style replacement of oldStr with newStr.",
  inputSchema: editFileInputSchema,
  outputSchema: z.object({ path: z.string(), content: z.string() }),
  requireApproval: true,
  execute: async (params: EditFileInput) => {
    const result = editFile(params.filepath, params.oldStr, params.newStr);
    sessionManager.appendToolResult({
      callId: "",
      name: "edit_file",
      result,
      changedFiles: [params.filepath],
      completedAt: new Date().toISOString(),
    });
    return result;
  },
});

const deleteFileTool = tool({
  name: "delete_file",
  description:
    "Delete a file inside the workspace. Excluded files cannot be deleted.",
  inputSchema: deleteFileInputSchema,
  outputSchema: z.object({ path: z.string(), deleted: z.literal(true) }),
  requireApproval: true,
  execute: async (params: DeleteFileInput) => {
    const result = deleteFile(params.filepath);
    sessionManager.appendToolResult({
      callId: "",
      name: "delete_file",
      result,
      changedFiles: [params.filepath],
      completedAt: new Date().toISOString(),
    });
    return result;
  },
});

const runCommandTool = tool({
  name: "run_command",
  description:
    "Run a non-destructive shell command in the workspace. Commands are approval-gated, time-limited, output-limited, and filtered by a heuristic denylist rather than a sandbox.",
  inputSchema: runCommandInputSchema,
  outputSchema: z.object({
    command: z.string(),
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
  }),
  requireApproval: true,
  execute: async (params: RunCommandInput) => {
    const result = await runCommand(params.command);
    sessionManager.appendToolResult({
      callId: "",
      name: "run_command",
      result,
      completedAt: new Date().toISOString(),
    });
    return result;
  },
});

const searchCodeTool = tool({
  name: "search_code",
  description:
    "Search text in workspace files using a glob pattern. Excluded files are omitted.",
  inputSchema: searchCodeInputSchema,
  outputSchema: z.array(z.string()),
  execute: async (params: SearchCodeInput) => {
    const result = searchFiles(
      params.filepath,
      params.globPattern,
      params.query,
      params.recursive,
    );
    sessionManager.appendToolResult({
      callId: "",
      name: "search_code",
      result,
      completedAt: new Date().toISOString(),
    });
    return result;
  },
});

const listFilesTool = tool({
  name: "list_files",
  description:
    "List files inside a workspace directory, optionally recursively. Excluded files are omitted.",
  inputSchema: listFilesInputSchema,
  outputSchema: z.object({ path: z.string(), files: z.array(z.string()) }),
  execute: async (params: ListFilesInput) => {
    const result = listFiles(params.filepath, params.recursive);
    sessionManager.appendToolResult({
      callId: "",
      name: "list_files",
      result,
      completedAt: new Date().toISOString(),
    });
    return result;
  },
});

const webSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  maxResults: z.number().int().min(1).max(10).optional().default(5),
});

type WebSearchInput = z.infer<typeof webSearchInputSchema>;

const webSearchTool = tool({
  name: "web_search",
  description:
    "Search the public web for current information and return concise sources with URLs.",
  inputSchema: webSearchInputSchema,
  outputSchema: z.object({
    query: z.string(),
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        content: z.string(),
      }),
    ),
  }),
  execute: async (params: WebSearchInput) => {
    const result = await webSearch(params.query, params.maxResults);
    sessionManager.appendToolResult({
      callId: "",
      name: "web_search",
      result,
      completedAt: new Date().toISOString(),
    });
    return result;
  },
});

export {
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listFilesTool,
  searchCodeTool,
  runCommandTool,
  webSearchTool,
};
