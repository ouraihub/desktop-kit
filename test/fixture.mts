import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface AppFixture {
  readonly repo: string
  readonly app: string
}

export interface AppOptions {
  readonly desktopKit?: unknown
  readonly tauri?: Record<string, unknown> | undefined
  readonly scripts?: Record<string, string>
}

/** A throwaway repo with one Tauri app at <repo>/app, version 1.2.3, product "Fixture". */
export function makeApp(options: AppOptions = {}): AppFixture {
  const repo = realpathSync(mkdtempSync(path.join(tmpdir(), 'desktop-kit-test-')))
  mkdirSync(path.join(repo, '.git'))
  const app = path.join(repo, 'app')
  mkdirSync(path.join(app, 'src-tauri'), { recursive: true })
  const pkg = { name: 'fixture', version: '1.2.3', scripts: options.scripts ?? { verify: 'echo ok' }, desktopKit: options.desktopKit ?? {} }
  writeFileSync(path.join(app, 'package.json'), JSON.stringify(pkg))
  writeFileSync(path.join(app, 'src-tauri', 'tauri.conf.json'), JSON.stringify({ productName: 'Fixture', ...options.tauri }))
  return { repo, app }
}

export function write(file: string, content = 'bytes'): string {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
  return file
}
