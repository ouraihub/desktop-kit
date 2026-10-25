import { type SpawnSyncOptions } from 'node:child_process';
import type { Logger } from './logger.mjs';
/** Root of the installed package; msvc/ ships next to dist/. */
export declare const KIT_ROOT: string;
export interface CommandSpec {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string>>;
}
/** Executes external tools; callers describe what to run, implementations decide how. */
export interface CommandRunner {
    /** Streams output to the console. Throws CommandError on failure. */
    run(spec: CommandSpec): void;
    /** Returns stdout. Throws CommandError on failure. */
    capture(spec: CommandSpec): string;
}
/** Spawns the executable directly: git, gh, powershell, cargo metadata. */
export declare class ProcessRunner implements CommandRunner {
    private readonly logger;
    constructor(logger: Logger);
    run(spec: CommandSpec): void;
    capture(spec: CommandSpec): string;
    /** `verbatim` passes args unescaped on Windows, which `cmd /s /c "..."` requires; `label` names the tool in errors. */
    exec(spec: CommandSpec, options: SpawnSyncOptions, verbatim: boolean, label?: string): string;
}
/**
 * Runs toolchain commands (cargo, pnpm, tauri). On Windows they go through cmd with the portable
 * MSVC injected first, so Git's coreutils link.exe never shadows the MSVC linker and `.cmd` shims
 * resolve. On other platforms it spawns directly.
 */
export declare class ToolchainRunner implements CommandRunner {
    private readonly process;
    private readonly platform;
    constructor(process: ProcessRunner, platform?: NodeJS.Platform);
    run(spec: CommandSpec): void;
    capture(spec: CommandSpec): string;
    private throughCmd;
}
