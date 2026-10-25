import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, type Stats } from 'node:fs'
import path from 'node:path'
import { ArtifactError, ConfigError, UnsafePathError } from './errors.mjs'

export const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Throws if the path or any ancestor is a symlink. Node reports Windows junctions as symlinks too. */
export function rejectLinks(file: string): void {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new UnsafePathError(current, 'linked path')
    if (path.dirname(current) === current) return
  }
}

/** A nonempty regular file reached without links; every release input and output must be one. */
export function regularFile(file: string): Stats {
  rejectLinks(file)
  const stat = existsSync(file) ? lstatSync(file) : undefined
  if (!stat?.isFile() || stat.size === 0) throw new ArtifactError(`Expected a nonempty regular file: ${file}`)
  return stat
}

export function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch (error) {
    throw new ConfigError(`Cannot read JSON: ${file}`, { cause: error })
  }
}

/** The package's one object guard; field shapes are checked where they are read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
