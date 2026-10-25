import type { KitConfig } from '../config.mjs';
import type { Logger } from '../core/logger.mjs';
export interface CleanOptions {
    /** Also remove node_modules. Restored by `pnpm install`. */
    readonly deep: boolean;
}
export interface CleanReport {
    readonly removed: number;
    readonly kept: readonly string[];
}
/** The rule deciding what a clean must keep. */
export interface ProtectionPolicy {
    isProtected(target: string): boolean;
}
/**
 * User libraries live in a `data/` directory beside a built exe (target/<profile>/data,
 * dist/<product>/data). Only path segments below `base` count, so a repo that itself sits
 * under some D:\data\ is still cleanable.
 */
export declare class DataDirectoryPolicy implements ProtectionPolicy {
    private readonly base;
    private readonly names;
    constructor(base: string, names?: readonly string[]);
    isProtected(target: string): boolean;
}
/**
 * Removes build output, keeping every protected subtree and its ancestors. With --deep it also
 * removes dependency folders wholesale: packages ship their own `data/` dirs (caniuse-lite),
 * which are not user data. Symlinks and junctions are unlinked, never entered.
 */
export declare class Cleaner {
    private readonly config;
    private readonly targetDir;
    private readonly policy;
    private readonly logger;
    constructor(config: KitConfig, targetDir: string, policy: ProtectionPolicy, logger: Logger);
    /** Generated roots; never source, lockfiles, tool state (.wrangler) or vendored tools. */
    generatedRoots(): readonly string[];
    /** The repo's and every workspace package's node_modules, plus configured extras. */
    dependencyRoots(): readonly string[];
    clean(options: CleanOptions): CleanReport;
    /** Returns entries removed. A directory stays when anything below it had to stay. */
    private remove;
}
