import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { loadConfig } from '../dist/config.mjs'
import { PublishError } from '../dist/core/errors.mjs'
import { ConsoleLogger } from '../dist/core/logger.mjs'
import type { CommandRunner, CommandSpec } from '../dist/core/runner.mjs'
import { CandidateStore, packageNames, type PackageKind } from '../dist/release/candidate.mjs'
import { Publisher, ReleaseNotes } from '../dist/release/publisher.mjs'
import { VersionCheck } from '../dist/version.mjs'
import { makeApp, write } from './fixture.mts'

const SHA = 'c'.repeat(40)
const quiet = new ConsoleLogger('test', 'error', () => {})

/** Answers git/gh queries from fixtures and records every `run` (the release creation). */
class FakeGitHub implements CommandRunner {
  readonly created: CommandSpec[] = []
  workflowRun: Record<string, unknown> = { status: 'completed', conclusion: 'success', event: 'push', path: '.github/workflows/desktop.yml', head_branch: 'main', head_sha: SHA }
  jobs: unknown[] = [{ name: 'Build (windows)', conclusion: 'success' }, { name: 'Build (linux)', conclusion: 'success' }]

  capture(spec: CommandSpec): string {
    if (spec.command === 'git') return `${SHA}\n`
    if (spec.args.some((arg) => arg.endsWith('/jobs?per_page=100'))) return JSON.stringify([{ jobs: this.jobs }])
    return JSON.stringify(this.workflowRun)
  }

  run(spec: CommandSpec): void {
    this.created.push(spec)
  }
}

function setup(desktopKit: object, runId = '77') {
  const fixture = makeApp({ desktopKit: { platforms: ['windows', 'linux'], tagPrefix: 'desktop-v', ...desktopKit } })
  const config = loadConfig(fixture.app)
  const store = new CandidateStore('Fixture', 'zip')
  const from = path.join(fixture.app, 'dist', 'candidates')
  for (const platform of ['windows', 'linux'] as const) {
    const sources = new Map<PackageKind, string>()
    for (const kind of Object.keys(packageNames('Fixture', platform, 'zip')) as PackageKind[]) sources.set(kind, write(path.join(fixture.repo, 'src', platform, kind), kind))
    store.write(path.join(from, `candidate-${platform}`), { version: '1.2.3', platform, sourceSha: SHA, buildRunId: runId }, sources)
  }
  const github = new FakeGitHub()
  const versions = new VersionCheck(config, { version: '1.2.3' })
  const publisher = new Publisher(config, versions, store, new ReleaseNotes(config), github, quiet)
  return { ...fixture, github, publisher, from }
}

test('publishes exactly the verified packages with changelog and checksums', () => {
  process.env['GITHUB_REPOSITORY'] = 'org/app'
  const { repo, github, publisher, from } = setup({ release: { repo: 'org/public', workflow: '.github/workflows/desktop.yml' } })
  try {
    publisher.publish({ tag: 'desktop-v1.2.3', from, changes: '- 新功能 A\n' })
    const [spec] = github.created
    assert.ok(spec !== undefined)
    assert.deepEqual(spec.args.slice(0, 6), ['release', 'create', 'desktop-v1.2.3', '--repo', 'org/public', '--title'])
    const notes = spec.args[spec.args.indexOf('--notes') + 1] ?? ''
    assert.match(notes, /## 更新内容\n\n- 新功能 A\n\n## SHA256/)
    assert.deepEqual(
      spec.args.filter((arg) => path.isAbsolute(arg)).map((file) => path.basename(file)),
      ['Fixture-windows-setup.exe', 'Fixture-windows-portable.zip', 'Fixture-linux-x64.AppImage', 'Fixture-linux-x64.deb'],
    )
    assert.equal(spec.args.includes('--verify-tag'), false, 'cross-repo release creates its own tag')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('refuses wrong tags, foreign runs and runs missing a successful build job', () => {
  process.env['GITHUB_REPOSITORY'] = 'org/app'
  const cases: readonly [(github: FakeGitHub) => void, string, RegExp][] = [
    [() => {}, 'v1.2.3', /does not match/],
    [(github) => (github.workflowRun = { ...github.workflowRun, head_sha: 'd'.repeat(40) }), 'desktop-v1.2.3', /not a successful/],
    [(github) => (github.workflowRun = { ...github.workflowRun, event: 'pull_request' }), 'desktop-v1.2.3', /not a successful/],
    [(github) => (github.workflowRun = { ...github.workflowRun, path: '.github/workflows/other.yml' }), 'desktop-v1.2.3', /not a successful/],
    [(github) => (github.jobs = [{ name: 'Build (windows)', conclusion: 'success' }]), 'desktop-v1.2.3', /no successful "Build \(linux\)"/],
    [(github) => (github.jobs = [...github.jobs, { name: 'Build (linux)', conclusion: 'success' }]), 'desktop-v1.2.3', /no successful "Build \(linux\)"/],
  ]
  for (const [mutate, tag, pattern] of cases) {
    const { repo, github, publisher, from } = setup({ release: { workflow: '.github/workflows/desktop.yml' } })
    try {
      mutate(github)
      assert.throws(() => publisher.publish({ tag, from }), pattern)
      assert.equal(github.created.length, 0, 'nothing published')
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  }
  const local = setup({ release: { workflow: '.github/workflows/desktop.yml' } }, 'local')
  try {
    assert.throws(() => local.publisher.publish({ tag: 'desktop-v1.2.3', from: local.from }), (error: unknown) => error instanceof PublishError && /not built by GitHub Actions/.test(error.message))
  } finally {
    rmSync(local.repo, { recursive: true, force: true })
  }
})
