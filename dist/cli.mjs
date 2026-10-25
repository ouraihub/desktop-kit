#!/usr/bin/env node
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DesktopKitError, UsageError } from './core/errors.mjs';
import { ConsoleLogger } from './core/logger.mjs';
import { DesktopKit } from './kit.mjs';
const USAGE = `Usage: desktop-kit <command> [options]   (run from the app directory, or set DESKTOP_KIT_APP)

  version [tag]            print the agreed app version; with a tag, also check it matches
  build [--skip-verify]    verify gate, tauri build, dist/candidate-<platform> (+ dist/<product> on Windows)
  candidate verify <dir>   check a candidate directory's manifest, file set and hashes
  publish <tag> [--from <dir>] [--changes <file>]
                           publish verified candidates (default dir: dist/candidates); --changes is
                           this version's notes, e.g. \`release-kit notes <version> > changes.md\`
  dev [args]               tauri dev
  cargo <args>             cargo on the Tauri workspace
  clean [--deep]           remove build output (keeps every data/ dir); --deep also node_modules

Environment: DESKTOP_KIT_LOG=debug|info|warn|error`;
function main(argv) {
    const [command, ...rest] = argv;
    // dev and cargo forward everything verbatim to tauri / cargo.
    const passthrough = command === 'dev' || command === 'cargo';
    const parsed = parseArgs({
        args: passthrough ? [] : rest,
        allowPositionals: true,
        strict: true,
        options: { 'skip-verify': { type: 'boolean' }, deep: { type: 'boolean' }, from: { type: 'string' }, changes: { type: 'string' } },
    });
    const appDir = process.env['DESKTOP_KIT_APP'] ?? process.cwd();
    const logger = new ConsoleLogger('desktop-kit');
    const kit = new DesktopKit(appDir, logger);
    const [first, second] = parsed.positionals;
    switch (command) {
        case 'version':
            process.stdout.write(`${kit.versions.verify(first)}\n`);
            return;
        case 'build':
            kit.builder().build({ skipVerify: parsed.values['skip-verify'] === true || process.env['DESKTOP_KIT_SKIP_VERIFY'] === '1' });
            return;
        case 'candidate':
            if (first !== 'verify' || second === undefined)
                throw new UsageError('candidate verify <dir>');
            process.stdout.write(`${JSON.stringify(kit.candidates.verify(path.resolve(second)), null, 2)}\n`);
            return;
        case 'publish':
            if (first === undefined)
                throw new UsageError('publish <tag>');
            kit.publisher().publish({
                tag: first,
                from: path.resolve(kit.config.appDir, parsed.values.from ?? 'dist/candidates'),
                changes: parsed.values.changes === undefined ? undefined : readFileSync(path.resolve(parsed.values.changes), 'utf8'),
            });
            return;
        case 'dev':
            kit.dev(rest);
            return;
        case 'cargo':
            kit.cargoRun(rest);
            return;
        case 'clean':
            kit.cleaner().clean({ deep: parsed.values.deep === true });
            return;
        default:
            throw new UsageError(command === undefined ? 'No command given' : `Unknown command: ${command}`, { hint: USAGE });
    }
}
try {
    main(process.argv.slice(2));
}
catch (thrown) {
    const error = DesktopKitError.from(thrown);
    const logger = new ConsoleLogger('desktop-kit');
    logger.error(`${error.code}: ${error.message}`);
    if (error.hint !== undefined)
        logger.error(error.hint);
    if (error.code === 'E_INTERNAL' && thrown instanceof Error && thrown.stack !== undefined)
        logger.debug(thrown.stack);
    process.exitCode = error.exitCode;
}
