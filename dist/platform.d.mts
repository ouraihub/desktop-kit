export declare const PLATFORMS: readonly ["windows", "macos", "linux"];
export type Platform = (typeof PLATFORMS)[number];
export interface PlatformSpec {
    readonly triple: string;
    readonly arch: string;
    /** Tauri bundle targets built for this platform. */
    readonly bundles: readonly string[];
}
/** One supported build host per platform: x64 Windows/Linux, Apple Silicon macOS. */
export declare const PLATFORM_SPECS: Readonly<Record<Platform, PlatformSpec>>;
export declare function hostPlatform(platform?: NodeJS.Platform, arch?: string): Platform;
