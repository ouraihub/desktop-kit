import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ArtifactError } from '../core/errors.mjs'
import { isRecord, regularFile, rejectLinks, SEMVER, sha256 } from '../core/fs.mjs'
import { PLATFORM_SPECS, type Platform } from '../platform.mjs'

export type PackageKind = 'nsis' | 'portable' | 'dmg' | 'appimage' | 'deb'

export interface Artifact {
  readonly kind: PackageKind
  /** File name inside the candidate directory; the public asset name. */
  readonly path: string
  readonly size: number
  readonly sha256: string
}

/** dist/candidate-<platform>/candidate.json: everything one native build hands to publishing. */
export interface CandidateManifest {
  readonly product: string
  readonly version: string
  readonly platform: Platform
  readonly arch: string
  readonly sourceSha: string
  /** GitHub Actions run id, or "local". */
  readonly buildRunId: string
  readonly artifacts: readonly Artifact[]
}

export type CandidateExpectation = Partial<Pick<CandidateManifest, 'product' | 'version' | 'platform' | 'sourceSha' | 'buildRunId'>>

export interface PublicFile extends Artifact {
  readonly file: string
}

const MANIFEST = 'candidate.json'

/** Version-free public names, so "latest" download links stay stable across releases. */
export function packageNames(product: string, platform: Platform, portable: 'zip' | 'exe'): Readonly<Partial<Record<PackageKind, string>>> {
  if (platform === 'windows') return { nsis: `${product}-windows-setup.exe`, portable: `${product}-windows-portable.${portable}` }
  if (platform === 'macos') return { dmg: `${product}-macos-arm64.dmg` }
  return { appimage: `${product}-linux-x64.AppImage`, deb: `${product}-linux-x64.deb` }
}

/** Writes, verifies and aggregates candidate directories. Verification never trusts the manifest alone. */
export class CandidateStore {
  constructor(
    private readonly product: string,
    private readonly portableFormat: 'zip' | 'exe',
  ) {}

  /** Replaces dist/candidate-<platform> with exactly these packages and a manifest, then re-verifies it. */
  write(dir: string, identity: Omit<CandidateManifest, 'artifacts' | 'arch' | 'product'>, sources: ReadonlyMap<PackageKind, string>): CandidateManifest {
    const names = packageNames(this.product, identity.platform, this.portableFormat)
    rejectLinks(dir)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const artifacts = Object.entries(names).map(([kind, name]): Artifact => {
      const source = sources.get(kind as PackageKind)
      if (source === undefined) throw new ArtifactError(`No ${kind} package was produced`)
      regularFile(source)
      const destination = path.join(dir, name)
      copyFileSync(source, destination)
      return { kind: kind as PackageKind, path: name, size: regularFile(destination).size, sha256: sha256(destination) }
    })
    const manifest: CandidateManifest = { product: this.product, arch: PLATFORM_SPECS[identity.platform].arch, ...identity, artifacts }
    writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
    return this.verify(dir)
  }

  /** Checks identity, the exact file set, sizes and hashes of dir/candidate.json. */
  verify(dir: string, expected: CandidateExpectation = {}): CandidateManifest {
    const manifestPath = path.join(dir, MANIFEST)
    regularFile(manifestPath)
    const manifest = this.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
    for (const [key, value] of Object.entries(expected))
      if (manifest[key as keyof CandidateExpectation] !== value) throw new ArtifactError(`Candidate ${key} mismatch in ${dir}`)
    const names = packageNames(this.product, manifest.platform, this.portableFormat)
    if (manifest.artifacts.length !== Object.keys(names).length) throw new ArtifactError(`Wrong package set in ${dir}`)
    const seen = new Set<PackageKind>()
    for (const artifact of manifest.artifacts) {
      if (names[artifact.kind] !== artifact.path || seen.has(artifact.kind)) throw new ArtifactError(`Unexpected package ${artifact.path}`)
      seen.add(artifact.kind)
      const file = path.join(dir, artifact.path)
      if (regularFile(file).size !== artifact.size || sha256(file) !== artifact.sha256) throw new ArtifactError(`Hash or size mismatch: ${file}`)
    }
    const entries = readdirSync(dir).sort()
    const allowed = [MANIFEST, ...Object.values(names)].sort()
    if (JSON.stringify(entries) !== JSON.stringify(allowed)) throw new ArtifactError(`Unexpected files in ${dir}: ${entries.join(', ')}`)
    return manifest
  }

  /** Exactly one verified candidate per platform, nothing more; files come back in platform order. */
  aggregate(root: string, platforms: readonly Platform[], expected: CandidateExpectation): { readonly manifests: readonly CandidateManifest[]; readonly files: readonly PublicFile[] } {
    const dirs = platforms.map((platform) => `candidate-${platform}`)
    const present = readdirSync(root).sort()
    if (JSON.stringify(present) !== JSON.stringify([...dirs].sort()))
      throw new ArtifactError(`Expected exactly ${dirs.join(', ')} in ${root}; found ${present.join(', ')}`)
    const manifests = platforms.map((platform) => this.verify(path.join(root, `candidate-${platform}`), { ...expected, platform }))
    const files = manifests.flatMap((manifest) =>
      manifest.artifacts.map((artifact) => ({ ...artifact, file: path.join(root, `candidate-${manifest.platform}`, artifact.path) })),
    )
    return { manifests, files }
  }

  private parse(raw: unknown): CandidateManifest {
    const fail = (): never => {
      throw new ArtifactError('Invalid candidate manifest')
    }
    if (!isRecord(raw)) return fail()
    const { product, version, platform, arch, sourceSha, buildRunId, artifacts } = raw
    if (
      product !== this.product ||
      typeof version !== 'string' ||
      !SEMVER.test(version) ||
      typeof platform !== 'string' ||
      !(platform in PLATFORM_SPECS) ||
      arch !== PLATFORM_SPECS[platform as Platform].arch ||
      typeof sourceSha !== 'string' ||
      !/^[a-f0-9]{40}$/.test(sourceSha) ||
      typeof buildRunId !== 'string' ||
      !/^(?:\d+|local)$/.test(buildRunId) ||
      !Array.isArray(artifacts)
    )
      return fail()
    for (const item of artifacts as unknown[])
      if (
        !isRecord(item) ||
        typeof item['kind'] !== 'string' ||
        typeof item['path'] !== 'string' ||
        path.basename(item['path']) !== item['path'] ||
        !Number.isSafeInteger(item['size']) ||
        typeof item['sha256'] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(item['sha256'])
      )
        fail()
    return raw as unknown as CandidateManifest
  }
}
