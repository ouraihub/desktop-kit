// Library entry for app-specific scripts (smoke tests read the candidate a build produced).
export { DesktopKit } from './kit.mjs'
export { loadConfig, type KitConfig } from './config.mjs'
export { CandidateStore, packageNames, type Artifact, type CandidateManifest, type PackageKind } from './release/candidate.mjs'
export { ConsoleLogger, type Logger, type LogFields, type LogLevel } from './core/logger.mjs'
export { ProcessRunner, ToolchainRunner, type CommandRunner, type CommandSpec } from './core/runner.mjs'
export * from './core/errors.mjs'
export { PLATFORMS, PLATFORM_SPECS, hostPlatform, type Platform } from './platform.mjs'
