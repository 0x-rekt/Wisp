import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const MAX_COMMAND_LENGTH = 2_000;
const COMMAND_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 1_000_000;

const BLOCKED_COMMAND_PATTERNS = [
  /(?:^|[\s;&|()])(?:(?:\/[\w.-]+)+\/|(?:[\w.-]+\/)+)?(?:sudo|su|doas|rm|rmdir|mkfs(?:\.[\w-]+)?|fdisk|parted|dd)(?:[\s;&|()]|$)/i,
  /(?:^|[\s;&|()])(?:shutdown|reboot|poweroff|halt)(?:[\s;&|()]|$)/i,
  /(?:^|[\s;&|()])git[\s]+.*\b(?:push[\s]+.*(?:--force|-f)|reset[\s]+.*--hard|clean[\s]+-[^\s]*f|checkout[\s]+--|restore[\s]+--)/i,
  /(?:^|[\s;&|()])(?:(?:\/[\w.-]+)+\/|(?:[\w.-]+\/)+)?(?:curl|wget)[^\n]*[|][^\n]*(?:sh|bash|zsh|fish)(?:[\s;&|()]|$)/i,
];

const checkCommandSafety = (command: string): void => {
  const trimmed = command.trim();

  if (trimmed.length === 0) throw new Error("run_command: command cannot be empty");
  if (trimmed.length > MAX_COMMAND_LENGTH)
    throw new Error(`run_command: command exceeds ${MAX_COMMAND_LENGTH} characters`);

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

  try {
    const { stdout, stderr } = await execAsync(trimmed, {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    });

    return { command: trimmed, cwd: process.cwd(), stdout, stderr, exitCode: 0 };
  } catch (error) {
    const result = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
    };

    if (result.killed) {
      throw new Error(`run_command: command timed out after ${COMMAND_TIMEOUT_MS}ms`);
    }

    return {
      command: trimmed,
      cwd: process.cwd(),
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: typeof result.code === "number" ? result.code : 1,
    };
  }
};
