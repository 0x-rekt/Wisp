import { spawn } from "node:child_process";

const MAX_COMMAND_LENGTH = 2_000;
const COMMAND_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 1_000_000;

const SENSITIVE_ENV_VARS = [
  "OPENROUTER_API_KEY",
  "TAVILY_API_KEY",
  "WISP_CONFIG_DIR",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "SSH_AUTH_SOCK",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
];

export const getSanitizedEnv = (): Record<string, string | undefined> => {
  const env = { ...process.env };
  for (const key of SENSITIVE_ENV_VARS) {
    delete env[key];
  }
  return env;
};

const BLOCKED_COMMAND_PATTERNS = [
  /(?:^|[\s;&|()])(?:(?:\/[\w.-]+)+\/|(?:[\w.-]+\/)+)?(?:sudo|su|doas|rm|rmdir|mkfs(?:\.[\w-]+)?|fdisk|parted|dd)(?:[\s;&|()]|$)/i,
  /(?:^|[\s;&|()])(?:shutdown|reboot|poweroff|halt|systemctl|service)(?:[\s;&|()]|$)/i,
  /(?:^|[\s;&|()])git[\s]+.*\b(?:push[\s]+.*(?:--force|-f)|reset[\s]+.*--hard|clean[\s]+-[^\s]*f|checkout[\s]+--|restore[\s]+--)/i,
  /(?:^|[\s;&|()])(?:(?:\/[\w.-]+)+\/|(?:[\w.-]+\/)+)?(?:curl|wget)[^\n]*[|][^\n]*(?:sh|bash|zsh|fish)(?:[\s;&|()]|$)/i,
  /(?:^|[\s;&|()])(?:nc|netcat|socat)[\s]+.*-[a-z]*l/i,
  /\/dev\/(?:mem|kmem|sd[a-z]|nvme)/i,
  /:\s*\(\s*\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;?\s*:/,
  /(?:^|[\s;&|()])(?:nohup|disown)(?:[\s;&|()]|$)/i,
];

const checkCommandSafety = (command: string): void => {
  const trimmed = command.trim();

  if (trimmed.length === 0)
    throw new Error("run_command: command cannot be empty");
  if (trimmed.length > MAX_COMMAND_LENGTH)
    throw new Error(
      `run_command: command exceeds ${MAX_COMMAND_LENGTH} characters`,
    );

  if (/(?:^|[;&|])\s*cd\s+\/[^\s;&|]*/i.test(trimmed)) {
    throw new Error(
      `run_command: commands already start in ${process.cwd()}; remove the absolute cd prefix`,
    );
  }

  for (const pattern of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error("run_command: potentially destructive command blocked");
    }
  }
};

export type CommandResult = {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export const runCommand = async (command: string): Promise<CommandResult> => {
  const trimmed = command.trim();
  checkCommandSafety(trimmed);

  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const child = spawn("bash", ["-c", trimmed], {
      cwd: process.cwd(),
      env: getSanitizedEnv(),
    });

    const finish = (exitCode: number, timedOut = false) => {
      if (settled) return;
      settled = true;

      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const rawStderr = Buffer.concat(stderrChunks).toString("utf8");
      const stderr = timedOut
        ? `${rawStderr}\n[run_command: timed out after ${COMMAND_TIMEOUT_MS / 1000}s – output above is partial]`.trimStart()
        : rawStderr;

      resolve({
        command: trimmed,
        cwd: process.cwd(),
        stdout,
        stderr,
        exitCode: timedOut ? -1 : exitCode,
      });
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(0, true);
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_OUTPUT_BYTES) stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= MAX_OUTPUT_BYTES) stderrChunks.push(chunk);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      finish(code ?? 1);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({
        command: trimmed,
        cwd: process.cwd(),
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
};
