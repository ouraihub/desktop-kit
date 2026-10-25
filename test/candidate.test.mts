import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { ArtifactError, UnsafePathError } from '../dist/core/errors.mjs'
import { CandidateStore, packageNames, type PackageKind } from '../dist/release/candidate.mjs'
import { PLATFORMS } from '../dist/platform.mjs'
import { write } from './fixture.mts'

const identity = { version: '1.2.3', sourceSha: 'a'.repeat(40), buildRunId: '42' } as const

function stage(): string {
  return realpathSync(mkdtempSync(path.join(tmpdir(), 'desktop-kit-candidates-')))
}

/** Writes one candidate per platform through CandidateStore.write, from fake bundle files. */
function writeAll(store: CandidateStore, root: string): void {
  for (const platform of PLATFORMS) {
    const sources = new Map<PackageKind, string>()
    for (const kind of Object.keys(packageNames('Fixture', platform, 'zip')) as PackageKind[])
      sources.set(kind, write(path.join(root, '.src', platform, kind), `fixture ${platform} ${kind}`))
    store.write(path.join(root, 'out', `candidate-${platform}`), { ...identity, platform }, sources)
  }
}

test('write produces exactly the public package set and verifies it', () => {
  const root = stage()
  try {
    const store = new CandidateStore('Fixture', 'zip')
    writeAll(store, root)
    const { manifests, files } = store.aggregate(path.join(root, 'out'), PLATFORMS, { ...identity, product: 'Fixture' })
    assert.equal(manifests.length, 3)
    assert.deepEqual(
      files.map((file) => file.path),
      ['Fixture-windows-setup.exe', 'Fixture-windows-portable.zip', 'Fixture-macos-arm64.dmg', 'Fixture-linux-x64.AppImage', 'Fixture-linux-x64.deb'],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a missing package kind fails the write', () => {
  const root = stage()
  try {
    const sources = new Map<PackageKind, string>([['nsis', write(path.join(root, 'setup.exe'))]])
    assert.throws(() => new CandidateStore('Fixture', 'zip').write(path.join(root, 'candidate-windows'), { ...identity, platform: 'windows' }, sources), /No portable package/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('verify and aggregate fail closed on identity, set, hash, extras, empty files and links', () => {
  const root = stage()
  try {
    const store = new CandidateStore('Fixture', 'zip')
    writeAll(store, root)
    const out = path.join(root, 'out')
    const linux = path.join(out, 'candidate-linux')
    const manifestFile = path.join(linux, 'candidate.json')
    const original = JSON.parse(readFileSync(manifestFile, 'utf8')) as { artifacts: { path: string; sha256: string }[] }
    const rejects = (patch: object, pattern: RegExp): void => {
      writeFileSync(manifestFile, JSON.stringify({ ...original, ...patch }))
      assert.throws(() => store.verify(linux), (error: unknown) => error instanceof ArtifactError && pattern.test(error.message))
      writeFileSync(manifestFile, JSON.stringify(original))
    }
    for (const [key, value] of [['sourceSha', 'b'.repeat(40)], ['version', '1.2.0'], ['buildRunId', '7']] as const)
      assert.throws(() => store.aggregate(out, PLATFORMS, { ...identity, [key]: value }), new RegExp(`${key} mismatch`))
    rejects({ artifacts: original.artifacts.slice(1) }, /Wrong package set/)
    rejects({ artifacts: [original.artifacts[0], original.artifacts[0]] }, /Unexpected package/)
    rejects({ artifacts: [{ ...original.artifacts[0], path: '../outside.AppImage' }, original.artifacts[1]] }, /Invalid candidate manifest/)
    rejects({ artifacts: [{ ...original.artifacts[0], sha256: '0'.repeat(64) }, original.artifacts[1]] }, /Hash or size mismatch/)
    rejects({ arch: 'arm64' }, /Invalid candidate manifest/)

    const appimage = path.join(linux, 'Fixture-linux-x64.AppImage')
    const bytes = readFileSync(appimage)
    writeFileSync(appimage, '')
    assert.throws(() => store.verify(linux), /nonempty regular file/)
    writeFileSync(appimage, bytes)
    write(path.join(linux, 'private-state.db'))
    assert.throws(() => store.verify(linux), /Unexpected files/)
    rmSync(path.join(linux, 'private-state.db'))
    mkdirSync(path.join(out, 'candidate-android'))
    assert.throws(() => store.aggregate(out, PLATFORMS, identity), /Expected exactly/)
    rmSync(path.join(out, 'candidate-android'), { recursive: true })

    const link = path.join(root, 'linked')
    symlinkSync(linux, link, process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(() => store.verify(link), UnsafePathError)
    assert.equal(store.verify(linux).platform, 'linux')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
