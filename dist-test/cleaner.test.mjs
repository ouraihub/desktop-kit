import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Cleaner, DataDirectoryPolicy } from '../dist/clean/cleaner.mjs';
import { loadConfig } from '../dist/config.mjs';
import { ConsoleLogger } from '../dist/core/logger.mjs';
import { makeApp, write } from "./fixture.mjs";
const quiet = new ConsoleLogger('test', 'error', () => { });
test('clean keeps every data/ subtree and link target; --deep removes dependencies wholesale', () => {
    const { repo, app } = makeApp({ desktopKit: { clean: { paths: ['.tmp'] } } });
    const outside = path.join(repo, 'outside');
    try {
        const target = path.join(app, 'src-tauri', 'target');
        const protectedFiles = [
            path.join(target, 'debug', 'data', 'library.db'),
            path.join(target, 'x86_64-pc-windows-msvc', 'release', 'data', 'files', 'a.bin'),
            path.join(app, 'dist', 'Fixture', 'data', 'library.db'),
            path.join(app, 'build', 'nested', 'data', 'keep.json'),
            path.join(outside, 'debug', 'deps', 'external.exe'),
            path.join(app, '.wrangler', 'state.json'),
            path.join(repo, 'tools', 'vendor', 'node_modules', 'pnpm.mjs'),
        ].map((file) => write(file, `keep ${file}`));
        const generated = [
            path.join(target, 'debug', 'deps', 'gen.rlib'),
            path.join(target, 'release', 'Fixture.exe'),
            path.join(app, 'dist', 'Fixture', 'Fixture.exe'),
            path.join(app, 'dist', 'candidate-windows', 'candidate.json'),
            path.join(app, '.svelte-kit', 'types.d.ts'),
            path.join(app, 'src-tauri', 'gen', 'schemas', 'acl.json'),
            path.join(app, '.tmp', 'scratch'),
        ].map((file) => write(file));
        const dependencies = [
            path.join(repo, 'node_modules', 'caniuse-lite', 'data', 'agents.js'),
            path.join(app, 'node_modules', 'x', 'index.js'),
        ].map((file) => write(file));
        symlinkSync(outside, path.join(target, 'release', 'deps'), process.platform === 'win32' ? 'junction' : 'dir');
        symlinkSync(outside, path.join(repo, 'node_modules', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
        const config = loadConfig(app);
        const cleaner = new Cleaner(config, target, new DataDirectoryPolicy(repo), quiet);
        const assertProtected = () => {
            for (const file of protectedFiles)
                assert.equal(readFileSync(file, 'utf8'), `keep ${file}`, `kept ${file}`);
        };
        const plain = cleaner.clean({ deep: false });
        assertProtected();
        for (const file of generated)
            assert.equal(existsSync(file), false, `removed ${file}`);
        for (const file of dependencies)
            assert.equal(existsSync(file), true, `plain clean keeps ${file}`);
        assert.equal(existsSync(path.join(target, 'release', 'deps')), false, 'link itself removed');
        assert.ok(plain.kept.some((dir) => dir.endsWith(path.join('dist', 'Fixture', 'data'))));
        cleaner.clean({ deep: true });
        assertProtected();
        for (const file of dependencies)
            assert.equal(existsSync(file), false, `deep removed ${file}`);
    }
    finally {
        rmSync(repo, { recursive: true, force: true });
    }
});
test('protection only counts segments below the repo, so a repo under some data/ is cleanable', () => {
    const policy = new DataDirectoryPolicy(path.resolve('/srv/data/repo'));
    assert.equal(policy.isProtected(path.resolve('/srv/data/repo/app/build/x')), false);
    assert.equal(policy.isProtected(path.resolve('/srv/data/repo/app/dist/App/data/x')), true);
    assert.equal(policy.isProtected(path.resolve('/srv/data/other')), true, 'outside the repo is never touched');
});
