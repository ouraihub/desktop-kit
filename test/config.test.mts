import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { test } from 'node:test'
import { loadConfig } from '../dist/config.mjs'
import { ConfigError, VersionMismatchError } from '../dist/core/errors.mjs'
import { VersionCheck } from '../dist/version.mjs'
import { makeApp } from './fixture.mts'

test('defaults: windows only, v tag, verify script when present, zip portable', () => {
  const { repo, app } = makeApp()
  try {
    const config = loadConfig(app)
    assert.deepEqual(config.platforms, ['windows'])
    assert.equal(config.tagPrefix, 'v')
    assert.equal(config.verifyScript, 'verify')
    assert.equal(config.portable.format, 'zip')
    assert.equal(config.repoRoot, repo)
    assert.equal(config.release.title, 'Fixture {version}')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('rejects unknown keys, bad platforms, missing scripts and exe portables with extras', () => {
  for (const [desktopKit, pattern] of [
    [{ platfroms: ['windows'] }, /Unknown desktopKit keys: platfroms/],
    [{ platforms: ['android'] }, /Unknown platforms: android/],
    [{ beforeBuild: ['generate'] }, /no "generate" script/],
    [{ portable: { format: 'exe', binaries: ['cli'] } }, /portable "exe" is the bare executable/],
    [{ portable: { formats: 'zip' } }, /Unknown desktopKit.portable keys/],
    [{ release: { repo: 'not a repo' } }, /owner\/name/],
  ] as const) {
    const { repo, app } = makeApp({ desktopKit })
    try {
      assert.throws(() => loadConfig(app), (error: unknown) => error instanceof ConfigError && pattern.test(error.message))
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  }
})

test('versions must agree; tag must be prefix+version; tauri version can be forbidden', () => {
  const cases: readonly { tauri?: Record<string, unknown>; desktopKit?: unknown; cargo: string; tag?: string; error?: RegExp }[] = [
    { cargo: '1.2.3' },
    { cargo: '1.2.3', tauri: { version: '1.2.3' } },
    { cargo: '1.2.4', error: /Versions disagree/ },
    { cargo: '1.2.3', tauri: { version: '1.2.0' }, error: /Versions disagree/ },
    { cargo: '1.2.3', tauri: { version: '1.2.3' }, desktopKit: { forbidTauriVersion: true }, error: /must not set version/ },
    { cargo: '1.2.3', tag: 'v1.2.3' },
    { cargo: '1.2.3', tag: '1.2.3', error: /does not match/ },
    { cargo: '1.2.3', desktopKit: { tagPrefix: 'desktop-v' }, tag: 'desktop-v1.2.3' },
  ]
  for (const item of cases) {
    const { repo, app } = makeApp({ desktopKit: item.desktopKit, tauri: item.tauri })
    try {
      const check = new VersionCheck(loadConfig(app), { version: item.cargo })
      if (item.error === undefined) assert.equal(check.verify(item.tag), '1.2.3')
      else assert.throws(() => check.verify(item.tag), (error: unknown) => error instanceof VersionMismatchError && item.error!.test(error.message))
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  }
})
