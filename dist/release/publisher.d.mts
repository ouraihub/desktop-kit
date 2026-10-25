import type { KitConfig } from '../config.mjs';
import type { Logger } from '../core/logger.mjs';
import type { CommandRunner } from '../core/runner.mjs';
import type { VersionCheck } from '../version.mjs';
import type { CandidateStore, PublicFile } from './candidate.mjs';
export interface PublishOptions {
    readonly tag: string;
    /** Directory holding candidate-<platform>/ for every configured platform. */
    readonly from: string;
    /** This version's changes, e.g. `release-kit notes <version>` output; omitted when undefined. */
    readonly changes?: string | undefined;
    /** The run the caller downloaded candidates from; every manifest's buildRunId must equal it. */
    readonly runId?: string | undefined;
}
/** Release body: the version's changes, the app's notes file, then package checksums. */
export declare class ReleaseNotes {
    private readonly config;
    constructor(config: KitConfig);
    render(version: string, files: readonly PublicFile[], changes: string | undefined): string;
}
/**
 * Publishes verified candidates as a GitHub Release. Never builds: every package must come from
 * candidates whose hashes, version and commit check out and, when release.workflow is set, from a
 * successful push run of that workflow on main for exactly the tag's commit.
 */
export declare class Publisher {
    private readonly config;
    private readonly versions;
    private readonly candidates;
    private readonly notes;
    private readonly process;
    private readonly logger;
    constructor(config: KitConfig, versions: VersionCheck, candidates: CandidateStore, notes: ReleaseNotes, process: CommandRunner, logger: Logger);
    publish(options: PublishOptions): void;
    private verifyRun;
}
