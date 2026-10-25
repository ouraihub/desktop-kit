import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CargoProject } from '../dist/cargo.mjs';
import { loadConfig } from '../dist/config.mjs';
import { ConsoleLogger } from '../dist/core/logger.mjs';
import { ProcessRunner } from '../dist/core/runner.mjs';
import { makeApp, write } from "./fixture.mjs";
const runner = new ProcessRunner(new ConsoleLogger('test', 'error', () => { }));
test('reads [package] version, following version.workspace to the enclosing workspace', () => {
    const layouts = [
        [{ 'app/src-tauri/Cargo.toml': '[package]\nname = "app"\nversion = "1.2.3"\n\n[dependencies]\nserde = { version = "1" }\n' }, '1.2.3'],
        // Workspace root is the crate itself (AutoNote, AutoBee).
        [{ 'app/src-tauri/Cargo.toml': '[workspace]\nmembers = ["core"]\n\n[workspace.package]\nversion = "2.0.0"\n\n[package]\nname = "app"\nversion.workspace = true\n' }, '2.0.0'],
        // Workspace root above the crate (AutoFox), inline-table form.
        [{ 'app/Cargo.toml': '[workspace]\nmembers = ["src-tauri"]\n\n[workspace.package]\nedition = "2024"\nversion = "3.1.0"\n', 'app/src-tauri/Cargo.toml': '[package]\nname = "app"\nversion = { workspace = true }\n' }, '3.1.0'],
        // Dependency versions under later tables are never mistaken for the package version.
        [{ 'app/src-tauri/Cargo.toml': '[package]\nname = "app"\nedition = "2021"\n\n[dependencies]\nversion = "9.9.9"\n' }, undefined],
    ];
    for (const [files, expected] of layouts) {
        const { repo, app } = makeApp();
        try {
            for (const [file, content] of Object.entries(files))
                write(path.join(repo, file), content);
            assert.equal(new CargoProject(loadConfig(app), runner).version, expected);
        }
        finally {
            rmSync(repo, { recursive: true, force: true });
        }
    }
});
