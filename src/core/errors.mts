/** Stable machine-readable codes; the CLI logs `code: message` and maps them to exit codes. */
export type ErrorCode =
  | 'E_USAGE'
  | 'E_CONFIG'
  | 'E_VERSION'
  | 'E_COMMAND'
  | 'E_ARTIFACT'
  | 'E_UNSAFE_PATH'
  | 'E_PUBLISH'
  | 'E_INTERNAL'

export interface ErrorDetails {
  /** One actionable line for the user; never a stack trace. */
  readonly hint?: string
  readonly cause?: unknown
}

/** Base of every error desktop-kit throws on purpose. Anything else reaching the CLI is a bug (E_INTERNAL). */
export class DesktopKitError extends Error {
  readonly code: ErrorCode
  readonly hint: string | undefined

  constructor(code: ErrorCode, message: string, details: ErrorDetails = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = new.target.name
    this.code = code
    this.hint = details.hint
  }

  /** BSD sysexits: 64 usage, 78 configuration; everything else 1. */
  get exitCode(): number {
    if (this.code === 'E_USAGE') return 64
    if (this.code === 'E_CONFIG') return 78
    return 1
  }

  static from(error: unknown): DesktopKitError {
    if (error instanceof DesktopKitError) return error
    return new DesktopKitError('E_INTERNAL', error instanceof Error ? error.message : String(error), { cause: error })
  }
}

export class UsageError extends DesktopKitError {
  constructor(message: string, details?: ErrorDetails) {
    super('E_USAGE', message, details)
  }
}

export class ConfigError extends DesktopKitError {
  constructor(message: string, details?: ErrorDetails) {
    super('E_CONFIG', message, details)
  }
}

export class VersionMismatchError extends DesktopKitError {
  constructor(message: string, details?: ErrorDetails) {
    super('E_VERSION', message, details)
  }
}

export class CommandError extends DesktopKitError {
  readonly command: string
  readonly status: number | null

  constructor(command: string, status: number | null, details?: ErrorDetails) {
    super('E_COMMAND', status === null ? `${command} could not start` : `${command} exited with ${status}`, details)
    this.command = command
    this.status = status
  }
}

export class ArtifactError extends DesktopKitError {
  constructor(message: string, details?: ErrorDetails) {
    super('E_ARTIFACT', message, details)
  }
}

export class UnsafePathError extends DesktopKitError {
  readonly path: string

  constructor(path: string, reason: string) {
    super('E_UNSAFE_PATH', `Refusing ${reason}: ${path}`)
    this.path = path
  }
}

export class PublishError extends DesktopKitError {
  constructor(message: string, details?: ErrorDetails) {
    super('E_PUBLISH', message, details)
  }
}
