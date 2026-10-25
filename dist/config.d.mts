import { type Platform } from './platform.mjs';
export type PortableFormat = 'zip' | 'exe';
/** Validated `desktopKit` section of the app's package.json, with every path made absolute. */
export interface KitConfig {
    readonly appDir: string;
    readonly repoRoot: string;
    readonly tauriDir: string;
    readonly productName: string;
    /** `mainBinaryName` from tauri.conf.json when set; the built executable carries this name. */
    readonly mainBinaryName: string | undefined;
    readonly platforms: readonly Platform[];
    readonly tagPrefix: string;
    /** package.json script run before building; null when the app has none or disables it. */
    readonly verifyScript: string | null;
    readonly beforeBuild: readonly string[];
    readonly forbidTauriVersion: boolean;
    readonly portable: {
        readonly format: PortableFormat;
        /** Extra files in the portable zip: inside the app they keep their relative path, outside it their basename. */
        readonly files: readonly string[];
        /** Extra cargo packages built in release and shipped next to the main exe (binary = package name). */
        readonly binaries: readonly string[];
    };
    readonly release: {
        /** owner/name; defaults to GITHUB_REPOSITORY at publish time. */
        readonly repo: string | undefined;
        readonly title: string;
        readonly notesFile: string | undefined;
        /** When set, publish only accepts candidates from a successful push run of this workflow on main. */
        readonly workflow: string | undefined;
        readonly buildJob: string;
    };
    readonly clean: {
        readonly paths: readonly string[];
        readonly deepPaths: readonly string[];
    };
}
export declare function loadConfig(appDir: string): KitConfig;
