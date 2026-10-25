// Library entry for app-specific scripts (smoke tests read the candidate a build produced).
export { DesktopKit } from './kit.mjs';
export { loadConfig } from './config.mjs';
export { CandidateStore, packageNames } from './release/candidate.mjs';
export { ConsoleLogger } from './core/logger.mjs';
export { ProcessRunner, ToolchainRunner } from './core/runner.mjs';
export * from './core/errors.mjs';
export { PLATFORMS, PLATFORM_SPECS, hostPlatform } from './platform.mjs';
