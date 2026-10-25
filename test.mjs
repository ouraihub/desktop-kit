// Local builds must never fall back to an installed Visual Studio: a missing portable
// toolchain fails, even when a stray CI=true is set outside GitHub Actions.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

if (process.platform !== 'win32') {
  console.log('SKIP: Windows only')
  process.exit(0)
}
const here = import.meta.dirname
for (const script of ['msvc-env.bat', 'cargo-msvc.bat']) {
  const result = spawnSync('cmd', ['/d', '/c', `call ${script} --version`], {
    cwd: here,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', GITHUB_ACTIONS: 'false', PORTABLE_MSVC_ROOT: path.join(here, 'no-portable') },
  })
  assert.notEqual(result.status, 0, `${script}: local CI=true must not fall back to installed VS`)
  assert.match(result.stderr, /portable MSVC not found/)
}
console.log('PASS: missing portable toolchain fails closed')
