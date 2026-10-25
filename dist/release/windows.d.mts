import type { CommandRunner } from '../core/runner.mjs';
/** Windows-only package operations: embedded versions and portable zips. Inputs travel as env vars, never interpolated. */
export declare class WindowsPackager {
    private readonly runner;
    constructor(runner: CommandRunner);
    /** ProductVersion of an exe or NSIS installer must equal the release version. */
    assertVersion(file: string, version: string): void;
    /** Zips `folder` so the archive holds the folder itself at its root. */
    zip(folder: string, destination: string): void;
    /** The zip holds exactly `<root>/<entries>` (forward slashes), nothing else. */
    assertZipEntries(zip: string, root: string, entries: readonly string[]): void;
    private powershell;
}
