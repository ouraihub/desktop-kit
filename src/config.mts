import { existsSync } from 'node:fs'
import path from 'node:path'
import { ConfigError } from './core/errors.mjs'
import { isRecord, readJson } from './core/fs.mjs'
import { PLATFORMS, type Platform } from './platform.mjs'

export type PortableFormat = 'zip' | 'exe'

/** Validated `desktopKit` section of the app's package.json, with every path made absolute. */
export interface KitConfig {
  readonly appDir: string
  readonly repoRoot: string
  readonly tauriDir: string
  readonly productName: string
  /** `mainBinaryName` from tauri.conf.json when set; the built executable carries this name. */
  readonly mainBinaryName: string | undefined
  readonly platforms: readonly Platform[]
  readonly tagPrefix: string
  /** package.json script run before building; null when the app has none or disables it. */
  readonly verifyScript: string | null
  readonly beforeBuild: readonly string[]
  readonly forbidTauriVersion: boolean
  readonly portable: {
    readonly format: PortableFormat
    /** Extra files in the portable zip: inside the app they keep their relative path, outside it their basename. */
    readonly files: readonly string[]
    /** Extra cargo packages built in release and shipped next to the main exe (binary = package name). */
    readonly binaries: readonly string[]
  }
  readonly release: {
    /** owner/name; defaults to GITHUB_REPOSITORY at publish time. */
    readonly repo: string | undefined
    readonly title: string
    readonly notesFile: string | undefined
    /** When set, publish only accepts candidates from a successful push run of this workflow on main. */
    readonly workflow: string | undefined
    readonly buildJob: string
  }
  readonly clean: {
    readonly paths: readonly string[]
    readonly deepPaths: readonly string[]
  }
}

const KEYS = ['tauriDir', 'platforms', 'tagPrefix', 'verifyScript', 'beforeBuild', 'forbidTauriVersion', 'portable', 'release', 'clean']

class Section {
  constructor(
    private readonly name: string,
    private readonly value: Record<string, unknown>,
    allowed: readonly string[],
  ) {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
    if (unknown.length > 0) throw new ConfigError(`Unknown ${name} keys: ${unknown.join(', ')}`, { hint: `Allowed: ${allowed.join(', ')}` })
  }

  string(key: string): string | undefined {
    const value = this.value[key]
    if (value === undefined) return undefined
    if (typeof value !== 'string' || value === '') throw new ConfigError(`${this.name}.${key} must be a nonempty string`)
    return value
  }

  boolean(key: string): boolean | undefined {
    const value = this.value[key]
    if (value === undefined || typeof value === 'boolean') return value
    throw new ConfigError(`${this.name}.${key} must be a boolean`)
  }

  strings(key: string): readonly string[] {
    const value = this.value[key] ?? []
    if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string' && item !== ''))
      throw new ConfigError(`${this.name}.${key} must be an array of nonempty strings`)
    return value
  }

  section(key: string, allowed: readonly string[]): Section {
    const value = this.value[key] ?? {}
    if (!isRecord(value)) throw new ConfigError(`${this.name}.${key} must be an object`)
    return new Section(`${this.name}.${key}`, value, allowed)
  }
}

function findRepoRoot(start: string): string {
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, '.git'))) return dir
    if (path.dirname(dir) === dir) return start
  }
}

export function loadConfig(appDir: string): KitConfig {
  const pkg = readJson(path.join(appDir, 'package.json'))
  if (!isRecord(pkg)) throw new ConfigError(`${appDir}/package.json is not an object`)
  const raw = pkg['desktopKit'] ?? {}
  if (!isRecord(raw)) throw new ConfigError('package.json desktopKit must be an object')
  const root = new Section('desktopKit', raw, KEYS)
  const scripts = isRecord(pkg['scripts']) ? pkg['scripts'] : {}
  const resolve = (file: string): string => path.resolve(appDir, file)

  const tauriDir = resolve(root.string('tauriDir') ?? 'src-tauri')
  const tauri = readJson(path.join(tauriDir, 'tauri.conf.json'))
  const productName = isRecord(tauri) ? tauri['productName'] : undefined
  if (typeof productName !== 'string' || productName === '') throw new ConfigError('tauri.conf.json must set productName')
  const mainBinaryName = isRecord(tauri) && typeof tauri['mainBinaryName'] === 'string' ? tauri['mainBinaryName'] : undefined

  const platforms = root.strings('platforms')
  const invalid = platforms.filter((item) => !(PLATFORMS as readonly string[]).includes(item))
  if (invalid.length > 0) throw new ConfigError(`Unknown platforms: ${invalid.join(', ')}`, { hint: `Use ${PLATFORMS.join(', ')}` })

  const verifyRaw = raw['verifyScript']
  if (verifyRaw !== undefined && verifyRaw !== null && typeof verifyRaw !== 'string') throw new ConfigError('desktopKit.verifyScript must be a string or null')
  const verifyScript = verifyRaw === undefined ? ('verify' in scripts ? 'verify' : null) : verifyRaw
  const beforeBuild = root.strings('beforeBuild')
  for (const script of [verifyScript, ...beforeBuild])
    if (script !== null && !(script in scripts)) throw new ConfigError(`package.json has no "${script}" script`)

  const portable = root.section('portable', ['format', 'files', 'binaries'])
  const format = portable.string('format') ?? 'zip'
  if (format !== 'zip' && format !== 'exe') throw new ConfigError('desktopKit.portable.format must be "zip" or "exe"')
  const files = portable.strings('files').map(resolve)
  const binaries = portable.strings('binaries')
  if (format === 'exe' && (files.length > 0 || binaries.length > 0))
    throw new ConfigError('A portable "exe" is the bare executable; use format "zip" to ship extra files or binaries')

  const release = root.section('release', ['repo', 'title', 'notes', 'workflow', 'buildJob'])
  const repo = release.string('repo')
  if (repo !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new ConfigError('desktopKit.release.repo must be owner/name')
  const notes = release.string('notes')
  const clean = root.section('clean', ['paths', 'deepPaths'])

  return {
    appDir,
    repoRoot: findRepoRoot(appDir),
    tauriDir,
    productName,
    mainBinaryName,
    platforms: platforms.length > 0 ? (platforms as Platform[]) : ['windows'],
    tagPrefix: root.string('tagPrefix') ?? 'v',
    verifyScript,
    beforeBuild,
    forbidTauriVersion: root.boolean('forbidTauriVersion') ?? false,
    portable: { format, files, binaries },
    release: {
      repo,
      title: release.string('title') ?? `${productName} {version}`,
      notesFile: notes === undefined ? undefined : resolve(notes),
      workflow: release.string('workflow'),
      buildJob: release.string('buildJob') ?? 'Build ({platform})',
    },
    clean: { paths: clean.strings('paths').map(resolve), deepPaths: clean.strings('deepPaths').map(resolve) },
  }
}
