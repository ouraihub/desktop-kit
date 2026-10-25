import { existsSync } from 'node:fs'
import path from 'node:path'
import { ArtifactError } from '../core/errors.mjs'
import type { CommandRunner } from '../core/runner.mjs'

/** Prefer PowerShell 7 on PATH; 5.1 always exists, but its directory may be missing from PATH. */
const POWERSHELL =
  (process.env['PATH'] ?? '').split(path.delimiter).map((dir) => path.join(dir, 'pwsh.exe')).find((file) => existsSync(file)) ??
  path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

/** Windows-only package operations: embedded versions and portable zips. Inputs travel as env vars, never interpolated. */
export class WindowsPackager {
  constructor(private readonly runner: CommandRunner) {}

  /** ProductVersion of an exe or NSIS installer must equal the release version. */
  assertVersion(file: string, version: string): void {
    this.powershell('$v=[Diagnostics.FileVersionInfo]::GetVersionInfo($env:DK_FILE).ProductVersion; if($v -ne $env:DK_VERSION){throw "embedded version $v"}', {
      DK_FILE: file,
      DK_VERSION: version,
    }, `Embedded version of ${path.basename(file)} is not ${version}`)
  }

  /** Zips `folder` so the archive holds the folder itself at its root. */
  zip(folder: string, destination: string): void {
    this.powershell('Compress-Archive -LiteralPath $env:DK_FOLDER -DestinationPath $env:DK_ZIP -CompressionLevel Optimal', {
      DK_FOLDER: folder,
      DK_ZIP: destination,
    }, `Could not create ${path.basename(destination)}`)
  }

  /** The zip holds exactly `<root>/<entries>` (forward slashes), nothing else. */
  assertZipEntries(zip: string, root: string, entries: readonly string[]): void {
    const expected = entries.map((entry) => `${root}/${entry}`).sort().join('\n')
    this.powershell(
      'Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead($env:DK_ZIP); try { $a=[string[]]@($z.Entries | Where-Object { !$_.FullName.EndsWith("/") } | ForEach-Object { $_.FullName.Replace([char]92,[char]47) }); [Array]::Sort($a,[StringComparer]::Ordinal); if(($a -join "`n") -ne $env:DK_EXPECTED){throw "unexpected entries"} } finally { $z.Dispose() }',
      { DK_ZIP: zip, DK_EXPECTED: expected },
      `Portable zip must contain exactly: ${entries.join(', ')}`,
    )
  }

  private powershell(script: string, env: Record<string, string>, failure: string): void {
    try {
      this.runner.run({ command: POWERSHELL, args: ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference="Stop"; ${script}`], env })
    } catch (error) {
      throw new ArtifactError(failure, { cause: error })
    }
  }
}
