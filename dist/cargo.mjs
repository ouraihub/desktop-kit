import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigError } from './core/errors.mjs';
import { isRecord } from './core/fs.mjs';
/** Body of a `[name]` table in a Cargo.toml, up to the next table header. */
function table(toml, name) {
    const header = new RegExp(`^\\[${name.replaceAll('.', '\\.')}\\]\\s*$`, 'm');
    const start = toml.search(header);
    if (start === -1)
        return undefined;
    const rest = toml.slice(start).replace(header, '');
    const next = rest.search(/^\[/m);
    return next === -1 ? rest : rest.slice(0, next);
}
/** The Tauri app crate: its version (no cargo needed) and its real target directory (cargo metadata). */
export class CargoProject {
    config;
    runner;
    #targetDir;
    constructor(config, runner) {
        this.config = config;
        this.runner = runner;
    }
    get manifest() {
        return path.join(this.config.tauriDir, 'Cargo.toml');
    }
    /** `[package] version`, following `version.workspace = true` to the enclosing `[workspace.package]`. */
    get version() {
        const own = table(readFileSync(this.manifest, 'utf8'), 'package');
        if (own === undefined)
            throw new ConfigError(`${this.manifest} has no [package]`, { hint: 'desktopKit.tauriDir must point at the Tauri app crate' });
        const literal = own.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
        if (literal !== undefined)
            return literal;
        if (!/^version(\.workspace\s*=\s*true|\s*=\s*\{\s*workspace\s*=\s*true\s*\})/m.test(own))
            return undefined;
        for (let dir = this.config.tauriDir;; dir = path.dirname(dir)) {
            const file = path.join(dir, 'Cargo.toml');
            const workspace = existsSync(file) ? table(readFileSync(file, 'utf8'), 'workspace.package') : undefined;
            if (workspace !== undefined)
                return workspace.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
            if (dir === this.config.repoRoot || path.dirname(dir) === dir)
                return undefined;
        }
    }
    /** Honors CARGO_TARGET_DIR and .cargo/config.toml, so it is where `tauri build` really writes. */
    get targetDir() {
        this.#targetDir ??= this.readTargetDir();
        return this.#targetDir;
    }
    readTargetDir() {
        // cwd inside the app so rustup picks up its rust-toolchain.toml.
        const raw = this.runner.capture({ command: 'cargo', args: ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', this.manifest], cwd: this.config.tauriDir });
        const metadata = JSON.parse(raw);
        if (!isRecord(metadata) || typeof metadata['target_directory'] !== 'string')
            throw new ConfigError('Unexpected cargo metadata output');
        return metadata['target_directory'];
    }
}
