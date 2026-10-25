import type { KitConfig } from './config.mjs';
import type { CommandRunner } from './core/runner.mjs';
/** The Tauri app crate: its version (no cargo needed) and its real target directory (cargo metadata). */
export declare class CargoProject {
    #private;
    private readonly config;
    private readonly runner;
    constructor(config: KitConfig, runner: CommandRunner);
    get manifest(): string;
    /** `[package] version`, following `version.workspace = true` to the enclosing `[workspace.package]`. */
    get version(): string | undefined;
    /** Honors CARGO_TARGET_DIR and .cargo/config.toml, so it is where `tauri build` really writes. */
    get targetDir(): string;
    private readTargetDir;
}
