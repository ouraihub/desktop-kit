export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Readonly<Record<string, string | number | boolean>>;
/** Every component gets a Logger scoped to itself; nothing else writes diagnostics. */
export interface Logger {
    debug(message: string, fields?: LogFields): void;
    info(message: string, fields?: LogFields): void;
    warn(message: string, fields?: LogFields): void;
    error(message: string, fields?: LogFields): void;
    child(scope: string): Logger;
}
/**
 * `HH:MM:SS LEVEL scope message key=value` on stderr. stdout carries only command results
 * (a version, a manifest) so scripts can pipe them. Level from DESKTOP_KIT_LOG, default info.
 */
export declare class ConsoleLogger implements Logger {
    private readonly scope;
    private readonly minimum;
    private readonly sink;
    constructor(scope: string, minimum?: LogLevel, sink?: (line: string) => void);
    static levelFromEnv(value?: string | undefined): LogLevel;
    debug(message: string, fields?: LogFields): void;
    info(message: string, fields?: LogFields): void;
    warn(message: string, fields?: LogFields): void;
    error(message: string, fields?: LogFields): void;
    child(scope: string): Logger;
    private write;
}
