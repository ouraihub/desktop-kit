import path from 'node:path'
import type { CargoProject } from './cargo.mjs'
import type { KitConfig } from './config.mjs'
import { VersionMismatchError } from './core/errors.mjs'
import { isRecord, readJson, SEMVER } from './core/fs.mjs'

/**
 * The app version must be identical in package.json, the Tauri crate and (unless forbidden)
 * tauri.conf.json; a release tag must be exactly `<tagPrefix><version>`.
 */
export class VersionCheck {
  constructor(
    private readonly config: KitConfig,
    private readonly cargo: Pick<CargoProject, 'version'>,
  ) {}

  /** Returns the single agreed version. */
  verify(tag?: string): string {
    const pkg = readJson(path.join(this.config.appDir, 'package.json'))
    const tauri = readJson(path.join(this.config.tauriDir, 'tauri.conf.json'))
    const sources: Record<string, unknown> = {
      'package.json': isRecord(pkg) ? pkg['version'] : undefined,
      'Cargo.toml': this.cargo.version,
    }
    if (isRecord(tauri) && 'version' in tauri) {
      if (this.config.forbidTauriVersion)
        throw new VersionMismatchError('tauri.conf.json must not set version', { hint: 'Tauri falls back to the Cargo version; a third copy drifts' })
      sources['tauri.conf.json'] = tauri['version']
    }
    const versions = new Set(Object.values(sources))
    const [version] = versions
    if (versions.size !== 1 || typeof version !== 'string' || !SEMVER.test(version))
      throw new VersionMismatchError(`Versions disagree: ${JSON.stringify(sources)}`)
    if (tag !== undefined && tag !== `${this.config.tagPrefix}${version}`)
      throw new VersionMismatchError(`Tag ${tag} does not match version ${version}`, { hint: `Expected ${this.config.tagPrefix}${version}` })
    return version
  }
}
