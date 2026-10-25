import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { KitConfig } from '../config.mjs'
import { PublishError } from '../core/errors.mjs'
import { isRecord } from '../core/fs.mjs'
import type { Logger } from '../core/logger.mjs'
import type { CommandRunner } from '../core/runner.mjs'
import type { VersionCheck } from '../version.mjs'
import type { CandidateStore, PublicFile } from './candidate.mjs'

export interface PublishOptions {
  readonly tag: string
  /** Directory holding candidate-<platform>/ for every configured platform. */
  readonly from: string
}

/** Release body: the version's CHANGELOG section, the app's notes file, then package checksums. */
export class ReleaseNotes {
  constructor(private readonly config: KitConfig) {}

  render(version: string, files: readonly PublicFile[]): string {
    const parts = [this.changelog(version), this.notesFile(version)].filter((part) => part !== '')
    parts.push(`## SHA256\n\n${files.map((file) => `- \`${file.path}\`: \`${file.sha256}\``).join('\n')}`)
    return `${parts.join('\n\n')}\n`
  }

  /** Body of the `## [version]` section release-please writes, without its heading. */
  private changelog(version: string): string {
    const file = path.join(this.config.repoRoot, 'CHANGELOG.md')
    if (!existsSync(file)) return ''
    const lines = readFileSync(file, 'utf8').replaceAll('\r', '').split('\n')
    const heading = new RegExp(`^##\\s+\\[?${version.replaceAll('.', '\\.').replaceAll('+', '\\+')}\\]?(\\s|\\(|$)`)
    const start = lines.findIndex((line) => heading.test(line))
    if (start === -1) return ''
    const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line))
    const body = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim()
    return body === '' ? '' : `## 更新内容\n\n${body}`
  }

  private notesFile(version: string): string {
    const file = this.config.release.notesFile
    return file === undefined ? '' : readFileSync(file, 'utf8').replaceAll('{version}', version).trim()
  }
}

/**
 * Publishes verified candidates as a GitHub Release. Never builds: every package must come from
 * candidates whose hashes, version and commit check out and, when release.workflow is set, from a
 * successful push run of that workflow on main for exactly the tag's commit.
 */
export class Publisher {
  constructor(
    private readonly config: KitConfig,
    private readonly versions: VersionCheck,
    private readonly candidates: CandidateStore,
    private readonly notes: ReleaseNotes,
    private readonly process: CommandRunner,
    private readonly logger: Logger,
  ) {}

  publish(options: PublishOptions): void {
    const version = this.versions.verify(options.tag)
    const repo = this.config.release.repo ?? process.env['GITHUB_REPOSITORY']
    if (repo === undefined) throw new PublishError('No target repository', { hint: 'Set desktopKit.release.repo or GITHUB_REPOSITORY' })
    const sourceSha = this.process.capture({ command: 'git', args: ['rev-parse', 'HEAD'], cwd: this.config.repoRoot }).trim()
    const { manifests, files } = this.candidates.aggregate(options.from, this.config.platforms, { product: this.config.productName, version, sourceSha })
    const runIds = [...new Set(manifests.map((manifest) => manifest.buildRunId))]
    const runId = runIds[0]
    if (runId === undefined || runIds.length !== 1) throw new PublishError(`Candidates must come from one run, found: ${runIds.join(', ')}`)
    if (this.config.release.workflow !== undefined) this.verifyRun(runId, sourceSha)

    const stage = mkdtempSync(path.join(tmpdir(), 'desktop-kit-release-'))
    try {
      const assets = files.map((file) => {
        const destination = path.join(stage, file.path)
        copyFileSync(file.file, destination)
        return destination
      })
      const title = this.config.release.title.replaceAll('{version}', version)
      // Same-repo releases must find the pushed tag; a cross-repo release creates its own.
      const sameRepo = repo === process.env['GITHUB_REPOSITORY']
      this.process.run({
        command: 'gh',
        args: ['release', 'create', options.tag, '--repo', repo, '--title', title, '--notes', this.notes.render(version, files), ...(sameRepo ? ['--verify-tag'] : []), ...assets],
        env: { GH_TOKEN: process.env['RELEASE_TOKEN'] ?? process.env['GH_TOKEN'] ?? '' },
      })
      this.logger.info('published', { repo, tag: options.tag, packages: assets.length })
    } finally {
      rmSync(stage, { recursive: true, force: true })
    }
  }

  private verifyRun(runId: string, sourceSha: string): void {
    const source = process.env['GITHUB_REPOSITORY']
    if (!/^\d+$/.test(runId) || source === undefined) throw new PublishError(`Candidates were not built by GitHub Actions (run ${runId})`)
    const run: unknown = JSON.parse(this.process.capture({ command: 'gh', args: ['api', `repos/${source}/actions/runs/${runId}`] }))
    if (
      !isRecord(run) ||
      run['status'] !== 'completed' ||
      run['conclusion'] !== 'success' ||
      !['push', 'workflow_dispatch'].includes(String(run['event'])) ||
      run['path'] !== this.config.release.workflow ||
      run['head_branch'] !== 'main' ||
      run['head_sha'] !== sourceSha
    )
      throw new PublishError(`Run ${runId} is not a successful ${this.config.release.workflow} main run of ${sourceSha.slice(0, 7)}`)
    const pages: unknown = JSON.parse(this.process.capture({ command: 'gh', args: ['api', '--paginate', '--slurp', `repos/${source}/actions/runs/${runId}/jobs?per_page=100`] }))
    const jobs = Array.isArray(pages) ? pages.flatMap((page: unknown) => (isRecord(page) && Array.isArray(page['jobs']) ? (page['jobs'] as unknown[]) : [])) : []
    for (const platform of this.config.platforms) {
      const name = this.config.release.buildJob.replaceAll('{platform}', platform)
      const matches = jobs.filter((job) => isRecord(job) && job['name'] === name)
      if (matches.length !== 1 || !isRecord(matches[0]) || matches[0]['conclusion'] !== 'success') throw new PublishError(`Run ${runId} has no successful "${name}" job`)
    }
  }
}
