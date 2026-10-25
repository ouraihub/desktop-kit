import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CargoProject } from '../cargo.mjs'
import type { KitConfig } from '../config.mjs'
import { ArtifactError } from '../core/errors.mjs'
import { regularFile, rejectLinks } from '../core/fs.mjs'
import type { Logger } from '../core/logger.mjs'
import type { CommandRunner } from '../core/runner.mjs'
import { hostPlatform, PLATFORM_SPECS, type Platform } from '../platform.mjs'
import type { VersionCheck } from '../version.mjs'
import type { CandidateManifest, CandidateStore, PackageKind } from './candidate.mjs'
import type { WindowsPackager } from './windows.mjs'

export interface BuildOptions {
  readonly skipVerify: boolean
}

/** Bundle subdirectory and extension Tauri writes for each package kind. */
const BUNDLES: Readonly<Record<Exclude<PackageKind, 'portable'>, readonly [string, string]>> = {
  nsis: ['nsis', '-setup.exe'],
  dmg: ['dmg', '.dmg'],
  appimage: ['appimage', '.AppImage'],
  deb: ['deb', '.deb'],
}

/**
 * Native release for the host platform: version check, verify gate, `tauri build`, then
 * dist/candidate-<platform>. On Windows it also refreshes dist/<product>/, the local portable
 * install, replacing executables only and never touching anything else there (its data/).
 */
export class ReleaseBuilder {
  constructor(
    private readonly config: KitConfig,
    private readonly cargo: CargoProject,
    private readonly versions: VersionCheck,
    private readonly toolchain: CommandRunner,
    private readonly process: CommandRunner,
    private readonly candidates: CandidateStore,
    private readonly windows: WindowsPackager,
    private readonly logger: Logger,
  ) {}

  build(options: BuildOptions): CandidateManifest {
    const platform = hostPlatform()
    if (!this.config.platforms.includes(platform)) throw new ArtifactError(`${platform} is not in desktopKit.platforms`)
    const version = this.versions.verify()
    const sourceSha = this.process.capture({ command: 'git', args: ['rev-parse', 'HEAD'], cwd: this.config.repoRoot }).trim()
    const ci = process.env['GITHUB_SHA']
    if (ci !== undefined && ci !== sourceSha) throw new ArtifactError('Checkout differs from the workflow commit')
    this.logger.info('release build', { platform, version, commit: sourceSha.slice(0, 7) })

    const pnpm = (args: readonly string[]): void => this.toolchain.run({ command: 'pnpm', args, cwd: this.config.appDir })
    for (const script of this.config.beforeBuild) pnpm(['run', script])
    if (this.config.verifyScript !== null && !options.skipVerify) pnpm(['run', this.config.verifyScript])
    if (platform === 'macos') this.prepareMacIcon()

    const spec = PLATFORM_SPECS[platform]
    const started = Date.now()
    pnpm(['exec', 'tauri', 'build', '--target', spec.triple, '--bundles', spec.bundles.join(',')])
    for (const binary of this.config.portable.binaries)
      this.toolchain.run({
        command: 'cargo',
        args: ['build', '--release', '--locked', '--target', spec.triple, '-p', binary, '--manifest-path', this.cargo.manifest],
        cwd: this.config.tauriDir,
      })

    const release = path.join(this.cargo.targetDir, spec.triple, 'release')
    const sources = new Map<PackageKind, string>()
    for (const kind of spec.bundles as readonly Exclude<PackageKind, 'portable'>[]) sources.set(kind, this.freshBundle(release, kind, version, started))
    const stage = mkdtempSync(path.join(tmpdir(), `desktop-kit-${this.config.productName}-`))
    try {
      if (platform === 'windows') sources.set('portable', this.windowsPortable(release, version, sources, stage))
      const manifest = this.candidates.write(
        path.join(this.config.appDir, 'dist', `candidate-${platform}`),
        { version, platform, sourceSha, buildRunId: process.env['GITHUB_RUN_ID'] ?? 'local' },
        sources,
      )
      for (const artifact of manifest.artifacts) this.logger.info('package', { file: artifact.path, size: artifact.size })
      return manifest
    } finally {
      rmSync(stage, { recursive: true, force: true })
    }
  }

  private freshBundle(release: string, kind: Exclude<PackageKind, 'portable'>, version: string, started: number): string {
    const [sub, extension] = BUNDLES[kind]
    const dir = path.join(release, 'bundle', sub)
    rejectLinks(dir)
    // Tauri leaves older versions in the bundle dir; only this build's output counts (2 s clock slack).
    const matches = existsSync(dir)
      ? readdirSync(dir).filter((name) => name.endsWith(extension) && name.includes(`_${version}_`) && statSync(path.join(dir, name)).mtimeMs >= started - 2000)
      : []
    if (matches.length !== 1) throw new ArtifactError(`Expected exactly one fresh ${kind} for ${version} in ${dir}, found ${matches.length}`)
    const file = path.join(dir, matches[0] as string)
    regularFile(file)
    return file
  }

  /** Executable names as built: Tauri renames the main binary to productName unless mainBinaryName is set. */
  private executables(release: string): readonly string[] {
    const main = `${this.config.mainBinaryName ?? this.config.productName}.exe`
    return [main, ...this.config.portable.binaries.map((name) => `${name}.exe`)].map((name) => path.join(release, name))
  }

  /** Returns the portable package path; a zip is built inside `stage`. */
  private windowsPortable(release: string, version: string, sources: ReadonlyMap<PackageKind, string>, stage: string): string {
    const executables = this.executables(release)
    const main = executables[0] as string
    // Files inside the app keep their relative path (lib/ffmpeg.exe); others (../LICENSE) go to the root.
    const entries: readonly (readonly [string, string])[] = [
      ...executables.map((file) => [file, path.basename(file)] as const),
      ...this.config.portable.files.map((file) => {
        const relative = path.relative(this.config.appDir, file)
        return [file, relative.startsWith('..') ? path.basename(file) : relative] as const
      }),
    ]
    for (const [file] of entries) regularFile(file)
    this.windows.assertVersion(main, version)
    this.windows.assertVersion(sources.get('nsis') as string, version)
    this.refreshLocalInstall(entries)
    if (this.config.portable.format === 'exe') return main

    const product = this.config.productName
    const payload = path.join(stage, product)
    for (const [file, entry] of entries) {
      mkdirSync(path.dirname(path.join(payload, entry)), { recursive: true })
      copyFileSync(file, path.join(payload, entry))
    }
    const zip = path.join(stage, `${product}.zip`)
    this.windows.zip(payload, zip)
    this.windows.assertZipEntries(zip, product, entries.map(([, entry]) => entry.replaceAll('\\', '/')))
    return zip
  }

  /**
   * dist/<product>/ is where developers run the app with its data/ beside it: replace the shipped
   * files in place (each via a temporary + rename) and never touch anything else there.
   */
  private refreshLocalInstall(entries: readonly (readonly [string, string])[]): void {
    const local = path.join(this.config.appDir, 'dist', this.config.productName)
    rejectLinks(local)
    for (const [file, entry] of entries) {
      const destination = path.join(local, entry)
      mkdirSync(path.dirname(destination), { recursive: true })
      const temporary = `${destination}.new`
      copyFileSync(file, temporary)
      try {
        renameSync(temporary, destination)
      } catch (error) {
        rmSync(temporary, { force: true })
        throw new ArtifactError(`Cannot replace ${destination}`, { cause: error, hint: `Close the running ${this.config.productName} and rebuild` })
      }
    }
    this.logger.info('local install refreshed', { dir: local })
  }

  /** Tauri bundles need icon.icns on macOS; generate it from icons/icon.png when the repo has none. */
  private prepareMacIcon(): void {
    const icons = path.join(this.config.tauriDir, 'icons')
    if (existsSync(path.join(icons, 'icon.icns'))) return
    const set = path.join(icons, 'generated.iconset')
    mkdirSync(set, { recursive: true })
    try {
      for (const size of [16, 32, 128, 256, 512])
        for (const scale of [1, 2]) {
          const pixels = String(size * scale)
          const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`
          this.process.run({ command: 'sips', args: ['-z', pixels, pixels, path.join(icons, 'icon.png'), '--out', path.join(set, name)] })
        }
      this.process.run({ command: 'iconutil', args: ['-c', 'icns', set, '-o', path.join(icons, 'icon.icns')] })
    } finally {
      rmSync(set, { recursive: true, force: true })
    }
  }
}

export type { Platform }
