import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { CommandError } from './errors.mjs';
/** Root of the installed package; msvc/ ships next to dist/. */
export const KIT_ROOT = path.resolve(import.meta.dirname, '..', '..');
/** Spawns the executable directly: git, gh, powershell, cargo metadata. */
export class ProcessRunner {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    run(spec) {
        this.exec(spec, { stdio: 'inherit' }, false);
    }
    capture(spec) {
        return this.exec(spec, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, false);
    }
    /** `verbatim` passes args unescaped on Windows, which `cmd /s /c "..."` requires; `label` names the tool in errors. */
    exec(spec, options, verbatim, label = spec.command) {
        this.logger.debug(`${spec.command} ${spec.args.join(' ')}`);
        const result = spawnSync(spec.command, spec.args, {
            ...options,
            cwd: spec.cwd,
            env: spec.env ? { ...process.env, ...spec.env } : process.env,
            windowsVerbatimArguments: verbatim,
        });
        if (result.error)
            throw new CommandError(label, null, { cause: result.error });
        if (result.status !== 0) {
            const stderr = typeof result.stderr === 'string' ? result.stderr.trim().slice(-2000) : '';
            throw new CommandError(label, result.status, stderr === '' ? undefined : { hint: stderr });
        }
        return typeof result.stdout === 'string' ? result.stdout : '';
    }
}
/**
 * Runs toolchain commands (cargo, pnpm, tauri). On Windows they go through cmd with the portable
 * MSVC injected first, so Git's coreutils link.exe never shadows the MSVC linker and `.cmd` shims
 * resolve. On other platforms it spawns directly.
 */
export class ToolchainRunner {
    process;
    platform;
    constructor(process, platform = globalThis.process.platform) {
        this.process = process;
        this.platform = platform;
    }
    run(spec) {
        if (this.platform !== 'win32')
            return this.process.run(spec);
        this.process.exec(this.throughCmd(spec), { stdio: 'inherit' }, true, spec.command);
    }
    capture(spec) {
        if (this.platform !== 'win32')
            return this.process.capture(spec);
        return this.process.exec(this.throughCmd(spec, ' >nul'), { encoding: 'utf8' }, true, spec.command);
    }
    throughCmd(spec, silenceEnv = '') {
        const quote = (arg) => (/^[\w./:=@\\+-]+$/.test(arg) ? arg : `"${arg.replaceAll('"', '\\"')}"`);
        const env = path.join(KIT_ROOT, 'msvc', 'msvc-env.bat');
        const line = `call "${env}"${silenceEnv} && ${[spec.command, ...spec.args].map(quote).join(' ')}`;
        return { ...spec, command: globalThis.process.env['ComSpec'] ?? 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`] };
    }
}
