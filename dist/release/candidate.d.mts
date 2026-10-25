import { type Platform } from '../platform.mjs';
export type PackageKind = 'nsis' | 'portable' | 'dmg' | 'appimage' | 'deb';
export interface Artifact {
    readonly kind: PackageKind;
    /** File name inside the candidate directory; the public asset name. */
    readonly path: string;
    readonly size: number;
    readonly sha256: string;
}
/** dist/candidate-<platform>/candidate.json: everything one native build hands to publishing. */
export interface CandidateManifest {
    readonly product: string;
    readonly version: string;
    readonly platform: Platform;
    readonly arch: string;
    readonly sourceSha: string;
    /** GitHub Actions run id, or "local". */
    readonly buildRunId: string;
    readonly artifacts: readonly Artifact[];
}
export type CandidateExpectation = Partial<Pick<CandidateManifest, 'product' | 'version' | 'platform' | 'sourceSha' | 'buildRunId'>>;
export interface PublicFile extends Artifact {
    readonly file: string;
}
/** Version-free public names, so "latest" download links stay stable across releases. */
export declare function packageNames(product: string, platform: Platform, portable: 'zip' | 'exe'): Readonly<Partial<Record<PackageKind, string>>>;
/** Writes, verifies and aggregates candidate directories. Verification never trusts the manifest alone. */
export declare class CandidateStore {
    private readonly product;
    private readonly portableFormat;
    constructor(product: string, portableFormat: 'zip' | 'exe');
    /** Replaces dist/candidate-<platform> with exactly these packages and a manifest, then re-verifies it. */
    write(dir: string, identity: Omit<CandidateManifest, 'artifacts' | 'arch' | 'product'>, sources: ReadonlyMap<PackageKind, string>): CandidateManifest;
    /** Checks identity, the exact file set, sizes and hashes of dir/candidate.json. */
    verify(dir: string, expected?: CandidateExpectation): CandidateManifest;
    /** Exactly one verified candidate per platform, nothing more; files come back in platform order. */
    aggregate(root: string, platforms: readonly Platform[], expected: CandidateExpectation): {
        readonly manifests: readonly CandidateManifest[];
        readonly files: readonly PublicFile[];
    };
    private parse;
}
