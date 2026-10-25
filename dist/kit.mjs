import path from 'node:path';
import { CargoProject } from './cargo.mjs';
import { Cleaner, DataDirectoryPolicy } from './clean/cleaner.mjs';
import { loadConfig } from './config.mjs';
import { ProcessRunner, ToolchainRunner } from './core/runner.mjs';
import { ReleaseBuilder } from './release/builder.mjs';
import { CandidateStore } from './release/candidate.mjs';
import { Publisher, ReleaseNotes } from './release/publisher.mjs';
import { WindowsPackager } from './release/windows.mjs';
import { VersionCheck } from './version.mjs';
/** Composition root: wires every component for one app directory. Components get dependencies, never globals. */
export class DesktopKit {
    logger;
    config;
    process;
    toolchain;
    cargo;
    versions;
    candidates;
    constructor(appDir, logger) {
        this.logger = logger;
        this.config = loadConfig(path.resolve(appDir));
        this.process = new ProcessRunner(logger.child('exec'));
        this.toolchain = new ToolchainRunner(this.process);
        this.cargo = new CargoProject(this.config, this.toolchain);
        this.versions = new VersionCheck(this.config, this.cargo);
        this.candidates = new CandidateStore(this.config.productName, this.config.portable.format);
    }
    builder() {
        const packager = new WindowsPackager(this.process);
        return new ReleaseBuilder(this.config, this.cargo, this.versions, this.toolchain, this.process, this.candidates, packager, this.logger.child('build'));
    }
    publisher() {
        return new Publisher(this.config, this.versions, this.candidates, new ReleaseNotes(this.config), this.process, this.logger.child('publish'));
    }
    cleaner() {
        return new Cleaner(this.config, this.cargo.targetDir, new DataDirectoryPolicy(this.config.repoRoot), this.logger.child('clean'));
    }
    /** cargo against the Tauri workspace from inside the app, so rust-toolchain.toml applies. */
    cargoRun(args) {
        const [subcommand, ...rest] = args;
        const manifest = subcommand === undefined ? [] : [subcommand, '--manifest-path', this.cargo.manifest];
        this.toolchain.run({ command: 'cargo', args: [...manifest, ...rest], cwd: this.config.tauriDir });
    }
    dev(args) {
        this.toolchain.run({ command: 'pnpm', args: ['exec', 'tauri', 'dev', ...args], cwd: this.config.appDir });
    }
}
