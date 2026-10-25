import { existsSync, lstatSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { ArtifactError } from '../core/errors.mjs';
/**
 * User libraries live in a `data/` directory beside a built exe (target/<profile>/data,
 * dist/<product>/data). Only path segments below `base` count, so a repo that itself sits
 * under some D:\data\ is still cleanable.
 */
export class DataDirectoryPolicy {
    base;
    names;
    constructor(base, names = ['data']) {
        this.base = base;
        this.names = names;
    }
    isProtected(target) {
        const relative = path.relative(this.base, path.resolve(target));
        if (relative.startsWith('..') || path.isAbsolute(relative))
            return true;
        return relative.split(path.sep).some((segment) => this.names.includes(segment.toLowerCase()));
    }
}
/**
 * Removes build output, keeping every protected subtree and its ancestors. With --deep it also
 * removes dependency folders wholesale: packages ship their own `data/` dirs (caniuse-lite),
 * which are not user data. Symlinks and junctions are unlinked, never entered.
 */
export class Cleaner {
    config;
    targetDir;
    policy;
    logger;
    constructor(config, targetDir, policy, logger) {
        this.config = config;
        this.targetDir = targetDir;
        this.policy = policy;
        this.logger = logger;
    }
    /** Generated roots; never source, lockfiles, tool state (.wrangler) or vendored tools. */
    generatedRoots() {
        const app = this.config.appDir;
        return [...new Set([this.targetDir, path.join(this.config.tauriDir, 'gen', 'schemas'), path.join(app, 'build'), path.join(app, '.svelte-kit'), path.join(app, 'dist'), ...this.config.clean.paths])];
    }
    /** The repo's and every workspace package's node_modules, plus configured extras. */
    dependencyRoots() {
        const roots = [path.join(this.config.repoRoot, 'node_modules'), path.join(this.config.appDir, 'node_modules')];
        for (const parent of [this.config.repoRoot, path.join(this.config.repoRoot, 'packages'), path.join(this.config.repoRoot, 'apps')]) {
            if (!existsSync(parent))
                continue;
            for (const entry of readdirSync(parent, { withFileTypes: true }))
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && existsSync(path.join(parent, entry.name, 'package.json')))
                    roots.push(path.join(parent, entry.name, 'node_modules'));
        }
        return [...new Set([...roots, ...this.config.clean.deepPaths])];
    }
    clean(options) {
        const kept = [];
        let removed = 0;
        try {
            for (const root of this.generatedRoots())
                if (existsSync(root))
                    removed += this.remove(root, kept);
        }
        catch (error) {
            throw new ArtifactError('Clean stopped: a file is in use', { cause: error, hint: `Close ${this.config.productName}, dev servers and cargo, then rerun` });
        }
        // Node's recursive rm unlinks links instead of following them and retries read-only files on Windows.
        if (options.deep)
            for (const root of this.dependencyRoots())
                if (existsSync(root)) {
                    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
                    removed += 1;
                }
        for (const dir of kept)
            this.logger.info('kept', { path: dir });
        this.logger.info('clean finished', { removed, kept: kept.length, deep: options.deep });
        return { removed, kept };
    }
    /** Returns entries removed. A directory stays when anything below it had to stay. */
    remove(target, kept) {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink()) {
            rmSync(target, { force: true });
            return 1;
        }
        if (this.policy.isProtected(target)) {
            kept.push(target);
            return 0;
        }
        if (!stat.isDirectory()) {
            rmSync(target, { force: true, maxRetries: 3 });
            return 1;
        }
        let removed = 0;
        for (const entry of readdirSync(target))
            removed += this.remove(path.join(target, entry), kept);
        if (readdirSync(target).length > 0)
            return removed;
        rmdirSync(target);
        return removed + 1;
    }
}
