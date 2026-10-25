export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Readonly<Record<string, string | number | boolean>>

/** Every component gets a Logger scoped to itself; nothing else writes diagnostics. */
export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  child(scope: string): Logger
}

const rank: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 }

/**
 * `HH:MM:SS LEVEL scope message key=value` on stderr. stdout carries only command results
 * (a version, a manifest) so scripts can pipe them. Level from DESKTOP_KIT_LOG, default info.
 */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly scope: string,
    private readonly minimum: LogLevel = ConsoleLogger.levelFromEnv(),
    private readonly sink: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
  ) {}

  static levelFromEnv(value = process.env['DESKTOP_KIT_LOG']): LogLevel {
    return value !== undefined && value in rank ? (value as LogLevel) : 'info'
  }

  debug(message: string, fields?: LogFields): void {
    this.write('debug', message, fields)
  }

  info(message: string, fields?: LogFields): void {
    this.write('info', message, fields)
  }

  warn(message: string, fields?: LogFields): void {
    this.write('warn', message, fields)
  }

  error(message: string, fields?: LogFields): void {
    this.write('error', message, fields)
  }

  child(scope: string): Logger {
    return new ConsoleLogger(`${this.scope}:${scope}`, this.minimum, this.sink)
  }

  private write(level: LogLevel, message: string, fields: LogFields | undefined): void {
    if (rank[level] < rank[this.minimum]) return
    const extra = fields ? Object.entries(fields).map(([key, value]) => ` ${key}=${String(value)}`).join('') : ''
    this.sink(`${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${this.scope} ${message}${extra}`)
  }
}
