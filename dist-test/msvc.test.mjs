import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
const msvc = path.join(import.meta.dirname, '..', 'msvc');
// Local builds must never fall back to an installed Visual Studio: a missing portable toolchain
// fails, even when a stray CI=true is set outside GitHub Actions.
test('missing portable MSVC fails closed outside GitHub Actions', { skip: process.platform !== 'win32' }, () => {
    for (const script of ['msvc-env.bat', 'cargo-msvc.bat']) {
        const result = spawnSync('cmd', ['/d', '/c', `call ${script} --version`], {
            cwd: msvc,
            encoding: 'utf8',
            env: { ...process.env, CI: 'true', GITHUB_ACTIONS: 'false', PORTABLE_MSVC_ROOT: path.join(msvc, 'no-portable') },
        });
        assert.notEqual(result.status, 0, `${script}: must not fall back to an installed VS`);
        assert.match(result.stderr, /portable MSVC not found/);
    }
});
