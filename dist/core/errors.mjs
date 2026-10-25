/** Base of every error desktop-kit throws on purpose. Anything else reaching the CLI is a bug (E_INTERNAL). */
export class DesktopKitError extends Error {
    code;
    hint;
    constructor(code, message, details = {}) {
        super(message, details.cause === undefined ? undefined : { cause: details.cause });
        this.name = new.target.name;
        this.code = code;
        this.hint = details.hint;
    }
    /** BSD sysexits: 64 usage, 78 configuration; everything else 1. */
    get exitCode() {
        if (this.code === 'E_USAGE')
            return 64;
        if (this.code === 'E_CONFIG')
            return 78;
        return 1;
    }
    static from(error) {
        if (error instanceof DesktopKitError)
            return error;
        return new DesktopKitError('E_INTERNAL', error instanceof Error ? error.message : String(error), { cause: error });
    }
}
export class UsageError extends DesktopKitError {
    constructor(message, details) {
        super('E_USAGE', message, details);
    }
}
export class ConfigError extends DesktopKitError {
    constructor(message, details) {
        super('E_CONFIG', message, details);
    }
}
export class VersionMismatchError extends DesktopKitError {
    constructor(message, details) {
        super('E_VERSION', message, details);
    }
}
export class CommandError extends DesktopKitError {
    command;
    status;
    constructor(command, status, details) {
        super('E_COMMAND', status === null ? `${command} could not start` : `${command} exited with ${status}`, details);
        this.command = command;
        this.status = status;
    }
}
export class ArtifactError extends DesktopKitError {
    constructor(message, details) {
        super('E_ARTIFACT', message, details);
    }
}
export class UnsafePathError extends DesktopKitError {
    path;
    constructor(path, reason) {
        super('E_UNSAFE_PATH', `Refusing ${reason}: ${path}`);
        this.path = path;
    }
}
export class PublishError extends DesktopKitError {
    constructor(message, details) {
        super('E_PUBLISH', message, details);
    }
}
