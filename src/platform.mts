import { UsageError } from './core/errors.mjs'

export const PLATFORMS = ['windows', 'macos', 'linux'] as const
export type Platform = (typeof PLATFORMS)[number]

export interface PlatformSpec {
  readonly triple: string
  readonly arch: string
  /** Tauri bundle targets built for this platform. */
  readonly bundles: readonly string[]
}

/** One supported build host per platform: x64 Windows/Linux, Apple Silicon macOS. */
export const PLATFORM_SPECS: Readonly<Record<Platform, PlatformSpec>> = {
  windows: { triple: 'x86_64-pc-windows-msvc', arch: 'x64', bundles: ['nsis'] },
  macos: { triple: 'aarch64-apple-darwin', arch: 'arm64', bundles: ['dmg'] },
  linux: { triple: 'x86_64-unknown-linux-gnu', arch: 'x64', bundles: ['appimage', 'deb'] },
}

export function hostPlatform(platform: NodeJS.Platform = process.platform, arch: string = process.arch): Platform {
  const host = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : undefined
  if (host === undefined || PLATFORM_SPECS[host].arch !== arch)
    throw new UsageError(`Unsupported build host ${platform}/${arch}`, { hint: 'Build on Windows x64, macOS arm64 or Linux x64' })
  return host
}
