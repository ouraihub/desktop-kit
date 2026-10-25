import type { CargoProject } from '../cargo.mjs';
import type { KitConfig } from '../config.mjs';
import type { Logger } from '../core/logger.mjs';
import type { CommandRunner } from '../core/runner.mjs';
import { type Platform } from '../platform.mjs';
import type { VersionCheck } from '../version.mjs';
import type { CandidateManifest, CandidateStore } from './candidate.mjs';
import type { WindowsPackager } from './windows.mjs';
export interface BuildOptions {
    readonly skipVerify: boolean;
}
/**
 * Native release for the host platform: version check, verify gate, `tauri build`, then
 * dist/candidate-<platform>. On Windows it also refreshes dist/<product>/, the local portable
 * install, replacing executables only and never touching anything else there (its data/).
 */
export declare class ReleaseBuilder {
    private readonly config;
    private readonly cargo;
    private readonly versions;
    private readonly toolchain;
    private readonly process;
    private readonly candidates;
    private readonly windows;
    private readonly logger;
    constructor(config: KitConfig, cargo: CargoProject, versions: VersionCheck, toolchain: CommandRunner, process: CommandRunner, candidates: CandidateStore, windows: WindowsPackager, logger: Logger);
    build(options: BuildOptions): CandidateManifest;
    private freshBundle;
    /** Executable names as built: Tauri renames the main binary to productName unless mainBinaryName is set. */
    private executables;
    /** Returns the portable package path; a zip is built inside `stage`. */
    private windowsPortable;
    /**
     * dist/<product>/ is where developers run the app with its data/ beside it: replace the shipped
     * files in place (each via a temporary + rename) and never touch anything else there.
     */
    private refreshLocalInstall;
    /** Tauri bundles need icon.icns on macOS; generate it from icons/icon.png when the repo has none. */
    private prepareMacIcon;
}
export type { Platform };
