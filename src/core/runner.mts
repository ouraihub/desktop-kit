import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import path from 'node:path'
import { CommandError } from './errors.mjs'
import type { Logger } from './logger.mjs'

/** Root of the installed package; msvc/ ships next to dist/. */
export const KIT_ROOT = path.resolve(import.meta.dirname, '..', '..')

export interface CommandSpec {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
}

/** Executes external tools; callers describe what to run, implementations decide how. */
export interface CommandRunner {
  /** Streams output to the console. Throws CommandError on failure. */
  run(spec: CommandSpec): void
  /** Returns stdout. Throws CommandError on failure. */
  capture(spec: CommandSpec): string
}

/** Spawns the executable directly: git, gh, powershell, cargo metadata. */
export class ProcessRunner implements CommandRunner {
  constructor(private readonly logger: Logger) {}

  run(spec: CommandSpec): void {
    this.exec(spec, { stdio: 'inherit' }, false)
  }

  capture(spec: CommandSpec): string {
    return this.exec(spec, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, false)
  }

  /** `verbatim` passes args unescaped on Windows, which `cmd /s /c "..."` requires; `label` names the tool in errors. */
  exec(spec: CommandSpec, options: SpawnSyncOptions, verbatim: boolean, label = spec.command): string {
    this.logger.debug(`${spec.command} ${spec.args.join(' ')}`)
    const result = spawnSync(spec.command, spec.args, {
      ...options,
      cwd: spec.cwd,
      env: spec.env ? { ...process.env, ...spec.env } : process.env,
      windowsVerbatimArguments: verbatim,
    })
    if (result.error) throw new CommandError(label, null, { cause: result.error })
    if (result.status !== 0) {
      const stderr = typeof result.stderr === 'string' ? result.stderr.trim().slice(-2000) : ''
      throw new CommandError(label, result.status, stderr === '' ? undefined : { hint: stderr })
    }
    return typeof result.stdout === 'string' ? result.stdout : ''
  }
}

/**
 * Runs toolchain commands (cargo, pnpm, tauri). On Windows they go through cmd with the portable
 * MSVC injected first, so Git's coreutils link.exe never shadows the MSVC linker and `.cmd` shims
 * resolve. On other platforms it spawns directly.
 */
export class ToolchainRunner implements CommandRunner {
  constructor(
    private readonly process: ProcessRunner,
    private readonly platform: NodeJS.Platform = globalThis.process.platform,
  ) {}

  run(spec: CommandSpec): void {
    if (this.platform !== 'win32') return this.process.run(spec)
    this.process.exec(this.throughCmd(spec), { stdio: 'inherit' }, true, spec.command)
  }

  capture(spec: CommandSpec): string {
    if (this.platform !== 'win32') return this.process.capture(spec)
    return this.process.exec(this.throughCmd(spec, ' >nul'), { encoding: 'utf8' }, true, spec.command)
  }

  private throughCmd(spec: CommandSpec, silenceEnv = ''): CommandSpec {
    const quote = (arg: string): string => (/^[\w./:=@\\+-]+$/.test(arg) ? arg : `"${arg.replaceAll('"', '\\"')}"`)
    const env = path.join(KIT_ROOT, 'msvc', 'msvc-env.bat')
    const line = `call "${env}"${silenceEnv} && ${[spec.command, ...spec.args].map(quote).join(' ')}`
    return { ...spec, command: globalThis.process.env['ComSpec'] ?? 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`] }
  }
}
