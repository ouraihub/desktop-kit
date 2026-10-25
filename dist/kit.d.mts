import { CargoProject } from './cargo.mjs';
import { Cleaner } from './clean/cleaner.mjs';
import { type KitConfig } from './config.mjs';
import type { Logger } from './core/logger.mjs';
import { ProcessRunner, type CommandRunner } from './core/runner.mjs';
import { ReleaseBuilder } from './release/builder.mjs';
import { CandidateStore } from './release/candidate.mjs';
import { Publisher } from './release/publisher.mjs';
import { VersionCheck } from './version.mjs';
/** Composition root: wires every component for one app directory. Components get dependencies, never globals. */
export declare class DesktopKit {
    private readonly logger;
    readonly config: KitConfig;
    readonly process: ProcessRunner;
    readonly toolchain: CommandRunner;
    readonly cargo: CargoProject;
    readonly versions: VersionCheck;
    readonly candidates: CandidateStore;
    constructor(appDir: string, logger: Logger);
    builder(): ReleaseBuilder;
    publisher(): Publisher;
    cleaner(): Cleaner;
    /** cargo against the Tauri workspace from inside the app, so rust-toolchain.toml applies. */
    cargoRun(args: readonly string[]): void;
    dev(args: readonly string[]): void;
}
