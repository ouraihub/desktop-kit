/** Stable machine-readable codes; the CLI logs `code: message` and maps them to exit codes. */
export type ErrorCode = 'E_USAGE' | 'E_CONFIG' | 'E_VERSION' | 'E_COMMAND' | 'E_ARTIFACT' | 'E_UNSAFE_PATH' | 'E_PUBLISH' | 'E_INTERNAL';
export interface ErrorDetails {
    /** One actionable line for the user; never a stack trace. */
    readonly hint?: string;
    readonly cause?: unknown;
}
/** Base of every error desktop-kit throws on purpose. Anything else reaching the CLI is a bug (E_INTERNAL). */
export declare class DesktopKitError extends Error {
    readonly code: ErrorCode;
    readonly hint: string | undefined;
    constructor(code: ErrorCode, message: string, details?: ErrorDetails);
    /** BSD sysexits: 64 usage, 78 configuration; everything else 1. */
    get exitCode(): number;
    static from(error: unknown): DesktopKitError;
}
export declare class UsageError extends DesktopKitError {
    constructor(message: string, details?: ErrorDetails);
}
export declare class ConfigError extends DesktopKitError {
    constructor(message: string, details?: ErrorDetails);
}
export declare class VersionMismatchError extends DesktopKitError {
    constructor(message: string, details?: ErrorDetails);
}
export declare class CommandError extends DesktopKitError {
    readonly command: string;
    readonly status: number | null;
    constructor(command: string, status: number | null, details?: ErrorDetails);
}
export declare class ArtifactError extends DesktopKitError {
    constructor(message: string, details?: ErrorDetails);
}
export declare class UnsafePathError extends DesktopKitError {
    readonly path: string;
    constructor(path: string, reason: string);
}
export declare class PublishError extends DesktopKitError {
    constructor(message: string, details?: ErrorDetails);
}
