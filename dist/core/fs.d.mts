import { type Stats } from 'node:fs';
export declare const SEMVER: RegExp;
/** Throws if the path or any ancestor is a symlink. Node reports Windows junctions as symlinks too. */
export declare function rejectLinks(file: string): void;
/** A nonempty regular file reached without links; every release input and output must be one. */
export declare function regularFile(file: string): Stats;
export declare function sha256(file: string): string;
export declare function readJson(file: string): unknown;
/** The package's one object guard; field shapes are checked where they are read. */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
