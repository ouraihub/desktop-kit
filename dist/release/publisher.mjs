import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PublishError } from '../core/errors.mjs';
import { isRecord } from '../core/fs.mjs';
/** Release body: the version's changes, the app's notes file, then package checksums. */
export class ReleaseNotes {
    config;
    constructor(config) {
        this.config = config;
    }
    render(version, files, changes) {
        const file = this.config.release.notesFile;
        const parts = [
            changes === undefined || changes.trim() === '' ? '' : `## 更新内容\n\n${changes.trim()}`,
            file === undefined ? '' : readFileSync(file, 'utf8').replaceAll('{version}', version).trim(),
        ].filter((part) => part !== '');
        parts.push(`## SHA256\n\n${files.map((item) => `- \`${item.path}\`: \`${item.sha256}\``).join('\n')}`);
        return `${parts.join('\n\n')}\n`;
    }
}
/**
 * Publishes verified candidates as a GitHub Release. Never builds: every package must come from
 * candidates whose hashes, version and commit check out and, when release.workflow is set, from a
 * successful push run of that workflow on main for exactly the tag's commit.
 */
export class Publisher {
    config;
    versions;
    candidates;
    notes;
    process;
    logger;
    constructor(config, versions, candidates, notes, process, logger) {
        this.config = config;
        this.versions = versions;
        this.candidates = candidates;
        this.notes = notes;
        this.process = process;
        this.logger = logger;
    }
    publish(options) {
        const version = this.versions.verify(options.tag);
        const repo = this.config.release.repo ?? process.env['GITHUB_REPOSITORY'];
        if (repo === undefined)
            throw new PublishError('No target repository', { hint: 'Set desktopKit.release.repo or GITHUB_REPOSITORY' });
        const sourceSha = this.process.capture({ command: 'git', args: ['rev-parse', 'HEAD'], cwd: this.config.repoRoot }).trim();
        const { manifests, files } = this.candidates.aggregate(options.from, this.config.platforms, { product: this.config.productName, version, sourceSha });
        const runIds = [...new Set(manifests.map((manifest) => manifest.buildRunId))];
        const runId = runIds[0];
        if (runId === undefined || runIds.length !== 1)
            throw new PublishError(`Candidates must come from one run, found: ${runIds.join(', ')}`);
        if (this.config.release.workflow !== undefined)
            this.verifyRun(runId, sourceSha);
        const stage = mkdtempSync(path.join(tmpdir(), 'desktop-kit-release-'));
        try {
            const assets = files.map((file) => {
                const destination = path.join(stage, file.path);
                copyFileSync(file.file, destination);
                return destination;
            });
            const title = this.config.release.title.replaceAll('{version}', version);
            // Same-repo releases must find the pushed tag; a cross-repo release creates its own.
            const sameRepo = repo === process.env['GITHUB_REPOSITORY'];
            this.process.run({
                command: 'gh',
                args: ['release', 'create', options.tag, '--repo', repo, '--title', title, '--notes', this.notes.render(version, files, options.changes), ...(sameRepo ? ['--verify-tag'] : []), ...assets],
                env: { GH_TOKEN: process.env['RELEASE_TOKEN'] ?? process.env['GH_TOKEN'] ?? '' },
            });
            this.logger.info('published', { repo, tag: options.tag, packages: assets.length });
        }
        finally {
            rmSync(stage, { recursive: true, force: true });
        }
    }
    verifyRun(runId, sourceSha) {
        const source = process.env['GITHUB_REPOSITORY'];
        if (!/^\d+$/.test(runId) || source === undefined)
            throw new PublishError(`Candidates were not built by GitHub Actions (run ${runId})`);
        const run = JSON.parse(this.process.capture({ command: 'gh', args: ['api', `repos/${source}/actions/runs/${runId}`] }));
        if (!isRecord(run) ||
            run['status'] !== 'completed' ||
            run['conclusion'] !== 'success' ||
            !['push', 'workflow_dispatch'].includes(String(run['event'])) ||
            run['path'] !== this.config.release.workflow ||
            run['head_branch'] !== 'main' ||
            run['head_sha'] !== sourceSha)
            throw new PublishError(`Run ${runId} is not a successful ${this.config.release.workflow} main run of ${sourceSha.slice(0, 7)}`);
        const pages = JSON.parse(this.process.capture({ command: 'gh', args: ['api', '--paginate', '--slurp', `repos/${source}/actions/runs/${runId}/jobs?per_page=100`] }));
        const jobs = Array.isArray(pages) ? pages.flatMap((page) => (isRecord(page) && Array.isArray(page['jobs']) ? page['jobs'] : [])) : [];
        for (const platform of this.config.platforms) {
            const name = this.config.release.buildJob.replaceAll('{platform}', platform);
            const matches = jobs.filter((job) => isRecord(job) && job['name'] === name);
            if (matches.length !== 1 || !isRecord(matches[0]) || matches[0]['conclusion'] !== 'success')
                throw new PublishError(`Run ${runId} has no successful "${name}" job`);
        }
    }
}
