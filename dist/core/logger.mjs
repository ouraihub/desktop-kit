const rank = { debug: 10, info: 20, warn: 30, error: 40 };
/**
 * `HH:MM:SS LEVEL scope message key=value` on stderr. stdout carries only command results
 * (a version, a manifest) so scripts can pipe them. Level from DESKTOP_KIT_LOG, default info.
 */
export class ConsoleLogger {
    scope;
    minimum;
    sink;
    constructor(scope, minimum = ConsoleLogger.levelFromEnv(), sink = (line) => process.stderr.write(`${line}\n`)) {
        this.scope = scope;
        this.minimum = minimum;
        this.sink = sink;
    }
    static levelFromEnv(value = process.env['DESKTOP_KIT_LOG']) {
        return value !== undefined && value in rank ? value : 'info';
    }
    debug(message, fields) {
        this.write('debug', message, fields);
    }
    info(message, fields) {
        this.write('info', message, fields);
    }
    warn(message, fields) {
        this.write('warn', message, fields);
    }
    error(message, fields) {
        this.write('error', message, fields);
    }
    child(scope) {
        return new ConsoleLogger(`${this.scope}:${scope}`, this.minimum, this.sink);
    }
    write(level, message, fields) {
        if (rank[level] < rank[this.minimum])
            return;
        const extra = fields ? Object.entries(fields).map(([key, value]) => ` ${key}=${String(value)}`).join('') : '';
        this.sink(`${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${this.scope} ${message}${extra}`);
    }
}
