# Wisp

Wisp is a terminal-based AI coding agent for inspecting, editing, testing, and reasoning about software projects from an interactive TUI.

It combines:

- OpenRouter-powered model access
- Tool calling for workspace inspection and code changes
- Approval-gated file and shell operations
- Diff previews before changes
- Project and repository discovery
- Session persistence and resume
- Verification-aware completion
- Optional Tavily web search
- Structured local telemetry and crash recovery

Wisp is intentionally scoped: it is a local developer tool, not a hosted coding platform or a fully isolated execution environment.

## Current status

Wisp is an active MVP/prototype. The core agent loop, file tools, approval flow, session resume flow, web search integration, verification workflow, and automated test coverage are implemented.

The project currently has:

- TypeScript compilation with `npx tsc --noEmit`
- 152 automated tests covering tools, safety, sessions, context limits, approval previews, web search, and end-to-end workflows
- OpenRouter retry configuration with exponential backoff
- Tavily retry handling for transient failures
- Local session files under `.agent/sessions/`
- Local structured logs under `.agent/logs/`
- Configurable approval modes
- Workspace path and symlink protection for file operations

## Features

### Interactive terminal UI

Wisp runs as an OpenTUI application with:

- Chat-style conversation history
- Streaming model responses
- Tool execution status messages
- Approval prompts
- Diff and command previews
- Model selection
- Session selection and session-id copying
- Visible changed-file history
- Error and recovery messages

### Agent workflow

For a typical coding request, Wisp can:

1. Inspect the workspace.
2. Discover the project language, package manager, scripts, repository state, entry points, and ignore files.
3. Read relevant files.
4. Propose or apply edits.
5. Ask for approval before protected operations.
6. Run tests, type checks, builds, or linters.
7. Inspect failures and continue fixing where possible.
8. Keep the session active until verification succeeds.
9. Save the conversation and tool history for later resume.

The model is instructed to use a verification loop:

```text
discover → edit → verify → inspect failures → patch → verify again → complete
```

A successful tool call does not automatically mean a task is complete. After a mutation, the session remains active until a recognized verification command exits successfully.

## Requirements

- [Bun](https://bun.sh/) 1.3 or newer is recommended.
- An OpenRouter API key.
- A Tavily API key only if web search is needed.
- A terminal environment that supports the OpenTUI runtime.

Wisp uses OpenRouter, so the selected model and its provider availability can affect latency, cost, context limits, and tool-calling behavior.

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/0x-rekt/Wisp
cd wisp
bun install
```

Start Wisp:

```bash
bun run index.ts
```

You can also run the entry point directly:

```bash
bun index.ts
```

There is currently no separate package-binary installation flow. Wisp is run from the project checkout.

## First-time setup

### Option 1: Configure keys in the TUI

Start Wisp:

```bash
bun run index.ts
```

Then enter:

```text
/auth
```

Wisp asks for:

1. Your OpenRouter API key.
2. Your optional Tavily API key.

Keys are saved locally to the Wisp config file. They are not sent anywhere except the provider service that uses the corresponding key.

### Option 2: Configure environment variables

Set the provider keys before starting Wisp:

```bash
export OPENROUTER_API_KEY="your-openrouter-key"
export TAVILY_API_KEY="your-tavily-key"
bun run index.ts
```

The current lookup order is:

- OpenRouter: `openRouterApiKey` in Wisp config, then `OPENROUTER_API_KEY`
- Tavily: `tavilyApiKey` in Wisp config, then `TAVILY_API_KEY`

Do not commit keys to the repository. The included `.gitignore` should be checked before committing local configuration or environment files.

## Configuration

The default configuration file is:

```text
~/.wisp/config.json
```

If `XDG_CONFIG_HOME` is set, Wisp uses:

```text
$XDG_CONFIG_HOME/wisp/config.json
```

You can override the configuration directory with:

```bash
export WISP_CONFIG_DIR="/path/to/wisp-config"
```

A configuration file can look like this:

```json
{
  "model": "nvidia/nemotron-3-super-120b-a12b:free",
  "openRouterApiKey": "sk-or-v1-...",
  "tavilyApiKey": "tvly-...",
  "permissionMode": "always-ask"
}
```

The default model is:

```text
nvidia/nemotron-3-super-120b-a12b:free
```

Change it in the TUI with `/model`, or edit the config file directly.

### Permission modes

The configuration supports four permission modes:

| Mode              | Behavior                                                               |
| ----------------- | ---------------------------------------------------------------------- |
| `always-ask`      | Ask before write and destructive tools.                                |
| `ask-write`       | Ask before file writes and destructive tools.                          |
| `ask-destructive` | Ask only before destructive tools such as deletion and shell commands. |
| `never-ask`       | Execute tools without interactive approval.                            |

Use `always-ask` when evaluating Wisp or working in an unfamiliar repository. Treat `never-ask` as an advanced mode for trusted, controlled environments.

The current TUI exposes approval decisions per tool call. Permission modes are configured in `config.json`.

## Slash commands

Wisp handles slash commands locally instead of sending them to the model.

### `/model`

Open the model selector.

```text
/model
```

Set a model directly:

```text
/model provider/model-name
```

The selection is persisted for future sessions.

### `/auth`

Open the API-key setup flow:

```text
/auth
```

This configures the OpenRouter key first and then optionally the Tavily key.

### `/config`

Display the active config path and masked key status:

```text
/config
```

### `/sessions`

List saved sessions and open the selectable session modal:

```text
/sessions
```

Use the arrow keys to select a session. Press the platform copy shortcut shown in the modal, or press Enter, to copy the selected session ID.

### `/resume`

Open the session selector:

```text
/resume
```

Resume a specific session by ID:

```text
/resume 20260816-123456-abcdef
```

When a session is resumed, Wisp restores:

- The saved model
- The saved model conversation state when available
- Previous user prompts
- Previous assistant responses
- Previously changed files
- The session's tool and approval history on disk

The selected session keeps its original ID and continues accumulating context.

## Tools

The model can use the following tools.

### `project_info`

Inspects the current workspace and returns:

- Detected package manager
- Package scripts
- Test command
- Build or type-check command
- Lint command
- Primary language
- Relevant configuration files
- Git branch and working-tree state
- Common entry points
- Key directories
- Active ignore files
- Suggested verification commands

Wisp is instructed to call this before making code changes.

### `read_file`

Reads a UTF-8 text file inside the workspace.

```json
{
  "filepath": "src/app.ts"
}
```

Paths are workspace-relative. Excluded files and paths outside the workspace are rejected.

### `write_file`

Creates a new file or replaces the complete contents of an existing file.

```json
{
  "filepath": "src/app.ts",
  "content": "export const app = true;\n"
}
```

This is the appropriate tool when the entire target content is known. It is approval-gated and produces a diff preview.

### `edit_file`

Performs an exact, unique find-and-replace edit.

```json
{
  "filepath": "src/app.ts",
  "oldStr": "export const app = false;",
  "newStr": "export const app = true;"
}
```

Important behavior:

- `oldStr` must exist in the current file.
- `oldStr` must occur exactly once.
- The file is not changed when the match is missing or ambiguous.
- If the file changed since it was read, re-read it and provide a fresh exact snippet.
- Line-ending differences between CRLF and LF are handled when locating the old text.
- Set `newStr` to an empty string to remove the matched content.
- The operation is approval-gated and produces a diff preview.

### `delete_file`

Deletes one file inside the workspace after approval.

```json
{
  "filepath": "tmp/old-config.json"
}
```

Deletion is blocked for excluded paths and paths that escape the workspace.

### `list_files`

Lists files and directories from a workspace-relative directory.

Supported inputs include:

```json
{
  "filepath": ".",
  "recursive": true,
  "pattern": "src/**/*.ts"
}
```

Excluded files are omitted. Results are sorted for stable model context.

### `search_code`

Searches file contents for a text query.

```json
{
  "query": "createServer",
  "filepath": "src",
  "globPattern": "**/*.ts",
  "recursive": true
}
```

Results include the path, line number, character offset, and matching line. Excluded files are omitted.

### `run_command`

Runs a shell command from the current workspace directory.

```json
{
  "command": "bun test"
}
```

The command runner currently provides:

- Workspace-root current working directory
- A 2,000-character command limit
- A 15-second timeout
- A 1 MB stdout and stderr capture limit
- Sanitization of provider and credential-related environment variables
- A denylist for destructive commands and common destructive Git operations
- Structured stdout, stderr, exit code, command, and cwd results
- Partial output on timeout
- Approval before execution according to permission mode

Use relative paths. Do not prepend paths such as `cd /app` or `cd /workspace`; Wisp already starts in the workspace.

Examples:

```bash
bun test
npx tsc --noEmit
git status --short
python -m pytest
cargo check
go test ./...
```

A non-zero exit code is a real failure. Wisp is instructed to inspect the output, repair the cause, and retry instead of masking it with `|| true`.

### `web_search`

Searches the web through Tavily.

```json
{
  "query": "OpenTUI tool approval API",
  "maxResults": 5
}
```

Limits and behavior:

- Query must be non-empty.
- Query length is limited to 500 characters.
- Results are limited to 1–10.
- Tavily is optional; the rest of Wisp works without it.
- Transient network and server failures are retried with backoff.
- Invalid keys, quota errors, and other permanent failures are surfaced.

## Workspace and file safety

File tools resolve paths relative to the process working directory and protect the workspace boundary.

They reject:

- Absolute paths that escape the workspace
- `..` traversal outside the workspace
- Symlinks that resolve outside the workspace
- Excluded files and directories
- Ambiguous `edit_file` matches

Built-in exclusions include common generated, dependency, secret, and noisy paths:

```text
node_modules/
.git/
dist/
build/
.next/
coverage/
.cache/
.DS_Store
.env*
*.log
```

Wisp also reads these optional workspace-level ignore files:

```text
.gitignore
.agentignore
.wispignore
.ignore
```

Patterns support common ignore behavior, including negation patterns beginning with `!`.

The ignore implementation is intentionally lightweight and is not a complete replacement for Git's ignore engine. See the roadmap for planned ergonomics improvements.

## Approval and diff previews

Protected operations are shown before execution.

For file changes, the approval preview includes:

- Target path
- Added lines
- Removed lines
- Context around changes
- A no-change indication when the content is identical

For shell commands, the preview includes the command and the approval prompt.

The approval flow records:

- Tool-call ID
- Tool name
- Whether it was approved or rejected
- Decision timestamp
- Tool result or structured error

A rejected tool call remains visible in the session and allows the agent to continue with another approach.

## Sessions and persistence

Sessions are stored under the current workspace:

```text
.agent/sessions/<session-id>.json
```

A session stores:

- Session ID and timestamps
- Selected model
- User prompts
- Assistant responses
- Tool calls and arguments
- Approval decisions
- Tool results and errors
- Changed files
- Bounded agent conversation state
- Verification status and last verification command

Writes use a temporary file followed by an atomic rename to reduce corruption risk during interruption.

Wisp detects previously active sessions at startup and logs that interrupted sessions are available for recovery.

Local logs are written to:

```text
.agent/logs/wisp.log
```

Set `WISP_LOG_DIR` to use a different log directory.

Do not treat session files or logs as public artifacts: prompts, responses, paths, and tool metadata may contain project-sensitive information.

## Context management

Conversation state is bounded before being sent back to the model. When context grows too large, Wisp preserves the most recent messages and truncates oversized message content.

This reduces the chance of exceeding a provider's context limit, but it can remove older details from the active model context. The persisted session still contains the local session history, subject to the current session format.

For very large tasks, use focused prompts and resume sessions rather than keeping every unrelated repository detail in one conversation.

## Reliability behavior

### Model requests

OpenRouter requests use retry configuration with:

- Exponential backoff
- A maximum retry interval
- A maximum elapsed retry window
- Connection-error retries

Provider errors are classified into categories such as authentication, credits, rate limiting, service availability, and network failure.

### Web requests

Tavily search retries transient network and server errors. Permanent configuration and authorization errors are returned immediately.

### Tool failures

Tool failures are:

- Converted into structured session tool results
- Associated with the originating tool-call ID
- Returned to the model as errors
- Kept in the persisted session history

The agent instructions tell Wisp to inspect command failures, refresh stale file contents, and retry corrected operations.

### Completion verification

Successful mutations mark the session as requiring verification. A session cannot be marked complete until an appropriate verification command has returned exit code 0.

Recognized verification commands include common test, lint, build, type-check, Python, Rust, and Go commands. This is a safety net, not a substitute for choosing the right project-specific command.

## Development

Install dependencies:

```bash
bun install
```

Run the type checker:

```bash
npx tsc --noEmit
```

Run all tests:

```bash
bun test
```

Run a focused test file:

```bash
bun test tests/e2e-pipeline.test.ts
bun test tests/approval.test.ts
bun test tests/path-safety.test.ts
```

Useful test areas:

| Test file                         | Coverage                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `tests/e2e-pipeline.test.ts`      | Prompt, tool call, approval, execution, persistence, and resume              |
| `tests/approval-recovery.test.ts` | Tool-call correlation and failed-command recovery                            |
| `tests/hardening.test.ts`         | Permission modes, sanitized environment, telemetry, and interrupted sessions |
| `tests/commands.test.ts`          | Command filtering, execution, output, and timeout                            |
| `tests/path-safety.test.ts`       | Traversal and symlink protection                                             |
| `tests/ignore-rules.test.ts`      | Built-in and custom ignore behavior                                          |
| `tests/project-info.test.ts`      | Project and repository discovery                                             |
| `tests/context.test.ts`           | Conversation size bounds                                                     |
| `tests/web.test.ts`               | Tavily configuration and response handling                                   |

When changing agent behavior, test both the direct tool and the complete session lifecycle.

## Project structure

```text
wisp/
├── agent/
│   ├── client.ts       OpenRouter client, agent instructions, tool loop
│   ├── context.ts      Conversation state bounds
│   └── errors.ts       Provider and request error classification
├── config/
│   └── index.ts        Local configuration and environment lookup
├── session/
│   └── index.ts        Session model, persistence, resume, recovery
├── telemetry/
│   └── logger.ts       Structured local JSONL logging
├── tools/
│   ├── commands.ts     Shell execution and command safety checks
│   ├── diff.ts         Text diff generation
│   ├── files.ts        File operations, ignore rules, and path safety
│   ├── format-approval.ts Approval preview formatting
│   ├── project-info.ts Workspace and repository discovery
│   ├── tools.ts        OpenRouter tool definitions and session recording
│   └── web.ts          Tavily search integration
├── ui/
│   ├── chat-history.ts Conversation display
│   ├── header.ts       Header and status presentation
│   ├── input-bar.ts    User input
│   ├── message-block.ts Message rendering
│   ├── model-modal.ts  Model selection
│   ├── session-modal.ts Session selection and copy flow
│   └── theme.ts        TUI theme values
├── tests/              Unit, hardening, and end-to-end tests
├── index.ts            Application entry point and slash commands
├── PRD-wisp.md         Product requirements and design direction
├── package.json        Dependencies and package metadata
└── tsconfig.json       TypeScript configuration
```

## Typical usage examples

### Ask Wisp to inspect a project

```text
What package manager and test commands does this project use? Inspect the repository structure first.
```

Wisp should call `project_info`, then explain what it found.

### Make a focused code change

```text
Add input validation to the signup endpoint. Inspect the existing route, schema, and tests first. Make the smallest change and run the relevant verification command.
```

### Recover from a failed edit

If Wisp reports that `oldStr` was not found:

```text
Re-read the current file, locate the exact current implementation, and apply the edit using a fresh unique snippet.
```

The tool intentionally refuses stale or ambiguous replacements rather than guessing.

### Review and resume a previous task

```text
/sessions
```

Select a session, copy its ID, then use:

```text
/resume <copied-session-id>
```

Wisp reloads the saved transcript summary and model conversation state when available.

### Ask for research

```text
Search for the current official documentation for the library API, compare the relevant options, and cite the useful URLs in your answer.
```

This requires a configured Tavily key and should be used when current or niche information is needed.

## Security model and limitations

Wisp is designed to reduce accidental changes, not to provide a hardened security boundary against a malicious model, malicious repository, or hostile shell command.

Current protections include:

- Approval prompts for protected tools
- Configurable permission modes
- Workspace and symlink checks for file tools
- Ignore rules for secrets, dependencies, generated output, and noisy files
- Command length and timeout limits
- Output capture limits
- Sanitized credential environment variables
- A destructive-command denylist
- Session and tool-result audit history

Never run Wisp with unrestricted approval in a repository or environment you do not trust.

### Important shell limitation

`run_command` executes through the local shell from the workspace directory. It is not an OS-level sandbox. A command may still be able to read or write outside the workspace through shell features, interpreters, child processes, or tools that are not covered by the denylist.

Use approvals, run Wisp with least privilege, and consider a container or separate OS account when working with untrusted code.

## Known gaps and roadmap

The following items are intentionally documented rather than hidden.

### Stronger sandboxing for shell commands

The current command runner uses a heuristic denylist, environment sanitization, a timeout, output limits, and approval gates. It does not provide a true filesystem, process, network, or syscall sandbox.

Planned work:

- Optional container or OS-level sandbox backend
- Explicit filesystem read/write boundaries
- Network policy controls
- Process and child-process restrictions
- Platform-specific capability detection
- Clear fallback behavior when a sandbox backend is unavailable

### Broader end-to-end tests

The current end-to-end tests exercise the complete local lifecycle with deterministic tool calls. They do not consistently exercise:

- A live OpenRouter model response
- Provider rate limits and outages
- Real TUI keyboard interaction across terminals
- Clipboard behavior on every operating system
- Multi-turn tool recursion against a real model
- Large repositories and long-running sessions

Planned work:

- Mock-provider integration tests
- TUI input and approval interaction tests
- Cross-platform clipboard tests
- Fixture repositories for common languages and package managers
- Optional opt-in live-provider smoke tests

### More resilient failure recovery

Wisp has retries, structured tool errors, interrupted-session detection, atomic session writes, bounded context, and model instructions to retry failures. Recovery is still partly model-driven.

Planned work:

- Explicit retry budgets per tool class
- Automatic retry policies for safe transient commands
- Better recovery after process termination
- Resume checkpoints for in-flight tool calls
- Background jobs for commands longer than the interactive timeout
- Clearer distinction between retryable and unrecoverable errors

### Better file exclusion and repository discovery ergonomics

The current implementation supports built-in exclusions and several ignore files, plus project metadata discovery. Ignore matching is intentionally lightweight.

Planned work:

- Git-compatible ignore semantics
- A visible “why excluded?” explanation
- Ignore previews and configuration diagnostics
- Better monorepo/workspace detection
- Repository-root detection when Wisp starts in a subdirectory
- More complete source, test, generated-file, and configuration discovery
- User-configurable default exclusion rules

### Clearer first-time-user documentation and examples

This README documents the main setup and workflows, but onboarding can still improve.

Planned work:

- Interactive first-run setup wizard
- More copy-pasteable examples for each supported language
- Troubleshooting guide for API keys, provider errors, TTY compatibility, and clipboard support
- Example config files and example ignore files
- Short video or terminal walkthrough
- Distribution and install instructions for packaged releases

## Contributing

Before opening a pull request:

```bash
npx tsc --noEmit
bun test
git diff --check
```

Good contributions include:

- Regression tests for tool and session behavior
- Improvements that preserve workspace safety
- More precise error messages
- Provider-independent test fixtures
- Cross-platform TUI fixes
- Documentation and onboarding improvements

When adding a tool, update:

1. Its implementation and input/output schema.
2. Approval behavior and preview formatting.
3. Session tool-call and result recording.
4. Error handling.
5. Verification behavior if it mutates the workspace.
6. Unit tests.
7. End-to-end coverage.
8. This README.

## License

No license file is currently included. Until a license is added, assume the repository is not available for unrestricted redistribution or reuse.

## Acknowledgements

Wisp is built with:

- [Bun](https://bun.sh/)
- [TypeScript](https://www.typescriptlang.org/)
- [OpenRouter](https://openrouter.ai/)
- [OpenRouter Agent SDK](https://github.com/OpenRouterTeam/ai-sdk-provider)
- [OpenTUI](https://github.com/anomalyco/opentui)
- [Tavily](https://tavily.com/)
- [Zod](https://zod.dev/)
