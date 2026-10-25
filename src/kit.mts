import path from 'node:path'
import { CargoProject } from './cargo.mjs'
import { Cleaner, DataDirectoryPolicy } from './clean/cleaner.mjs'
import { loadConfig, type KitConfig } from './config.mjs'
import type { Logger } from './core/logger.mjs'
import { ProcessRunner, ToolchainRunner, type CommandRunner } from './core/runner.mjs'
import { ReleaseBuilder } from './release/builder.mjs'
import { CandidateStore } from './release/candidate.mjs'
import { Publisher, ReleaseNotes } from './release/publisher.mjs'
import { WindowsPackager } from './release/windows.mjs'
import { VersionCheck } from './version.mjs'

/** Composition root: wires every component for one app directory. Components get dependencies, never globals. */
export class DesktopKit {
  readonly config: KitConfig
  readonly process: ProcessRunner
  readonly toolchain: CommandRunner
  readonly cargo: CargoProject
  readonly versions: VersionCheck
  readonly candidates: CandidateStore

  constructor(
    appDir: string,
    private readonly logger: Logger,
  ) {
    this.config = loadConfig(path.resolve(appDir))
    this.process = new ProcessRunner(logger.child('exec'))
    this.toolchain = new ToolchainRunner(this.process)
    this.cargo = new CargoProject(this.config, this.toolchain)
    this.versions = new VersionCheck(this.config, this.cargo)
    this.candidates = new CandidateStore(this.config.productName, this.config.portable.format)
  }

  builder(): ReleaseBuilder {
    const packager = new WindowsPackager(this.process)
    return new ReleaseBuilder(this.config, this.cargo, this.versions, this.toolchain, this.process, this.candidates, packager, this.logger.child('build'))
  }

  publisher(): Publisher {
    return new Publisher(this.config, this.versions, this.candidates, new ReleaseNotes(this.config), this.process, this.logger.child('publish'))
  }

  cleaner(): Cleaner {
    return new Cleaner(this.config, this.cargo.targetDir, new DataDirectoryPolicy(this.config.repoRoot), this.logger.child('clean'))
  }

  /** cargo against the Tauri workspace from inside the app, so rust-toolchain.toml applies. */
  cargoRun(args: readonly string[]): void {
    const [subcommand, ...rest] = args
    const manifest = subcommand === undefined ? [] : [subcommand, '--manifest-path', this.cargo.manifest]
    this.toolchain.run({ command: 'cargo', args: [...manifest, ...rest], cwd: this.config.tauriDir })
  }
  dev(args: readonly string[]): void {
    this.toolchain.run({ command: 'pnpm', args: ['exec', 'tauri', 'dev', ...args], cwd: this.config.appDir })
  }
}
