# desktop-kit

Tauri 桌面应用共用的构建、发布和清理工具。Windows 上固定使用便携 MSVC。

- 一条命令完成发布构建：版本一致性检查 → verify 质量门 → `tauri build` → 校验并收集安装包。
- 产物统一放在 `dist/candidate-<平台>/`，带清单和 SHA256；发布只认这些候选包，从不重新编译。
- 清理时保留所有 `data/` 目录（exe 旁的用户库）和 junction 指向的内容；`--deep` 连同全部 `node_modules` 一起删。
- Windows 本机只用便携 MSVC，找不到就报错，不会悄悄改用系统里的 Visual Studio；GitHub Actions 用 runner 自带的 MSVC，并核对编译器路径。

## 接入

```jsonc
// 应用的 package.json（锁定到具体 commit）
"devDependencies": { "@ouraihub/desktop-kit": "github:ouraihub/desktop-kit#<commit>" },
"scripts": {
  "dev:app": "desktop-kit dev",
  "build:app": "desktop-kit build",
  "clean": "desktop-kit clean",
  "test:rust": "desktop-kit cargo test --workspace",
  "clippy": "desktop-kit cargo clippy --workspace --all-targets -- -D warnings",
  "fmt:rust": "desktop-kit cargo fmt --all -- --check"
},
"desktopKit": { "platforms": ["windows"] }
```

Windows 首次使用：在安装了依赖的目录运行 `node_modules\@ouraihub\desktop-kit\msvc\setup-msvc.bat` 下载便携 MSVC（约 455 MB，需要 `uv` 和 `curl`）。默认位置 `D:\Applications\msvc-portable\msvc`，可用 `PORTABLE_MSVC_ROOT` 修改。

## 命令

在应用目录（`package.json` 所在目录）运行，或用 `DESKTOP_KIT_APP` 指定。

| 命令 | 作用 |
| --- | --- |
| `desktop-kit version [tag]` | 输出统一的版本号；带 tag 时还检查 tag 是否等于 `tagPrefix + 版本` |
| `desktop-kit build [--skip-verify]` | 本机平台的发布构建，产物写到 `dist/candidate-<平台>/`；Windows 还会更新 `dist/<产品名>/` 里的 exe（不动旁边的 `data/`） |
| `desktop-kit candidate verify <dir>` | 校验候选包目录：身份、文件集合、大小、哈希 |
| `desktop-kit publish <tag> [--from <dir>] [--changes <file>] [--run <id>]` | 把各平台候选包发布为 GitHub Release（默认读 `dist/candidates/`）；`--changes` 是本版更新内容，放在说明最前；`--run` 是下载候选包所用的 workflow run，候选包必须正是它构建的 |
| `desktop-kit dev [参数]` | `tauri dev` |
| `desktop-kit cargo <参数>` | 对 Tauri workspace 运行 cargo（Windows 先注入 MSVC） |
| `desktop-kit clean [--deep]` | 删除编译产物；`--deep` 再删全部 `node_modules`，之后 `pnpm install` 恢复 |

`DESKTOP_KIT_LOG=debug` 打印每条执行的命令。日志写 stderr；stdout 只输出命令结果（版本号、清单），可以直接用管道读取。出错时日志为 `E_<类别>: 说明`，下一行是处理建议；退出码 64 为用法错误，78 为配置错误，其余为 1。

## 配置 `desktopKit`

全部可选。未知字段直接报错，避免拼错了却悄悄不生效。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `tauriDir` | `src-tauri` | Tauri crate 目录 |
| `platforms` | `["windows"]` | `windows`、`macos`（Apple Silicon）、`linux`（x64） |
| `tagPrefix` | `v` | 发布 tag 前缀，如 `desktop-v` |
| `verifyScript` | 有 `verify` 脚本就用 | 构建前运行的质量门；`null` 关闭 |
| `beforeBuild` | `[]` | 构建前依次运行的脚本（如生成第三方声明） |
| `forbidTauriVersion` | `false` | 为 `true` 时禁止在 `tauri.conf.json` 写版本号（只由 Cargo 决定） |
| `portable.format` | `zip` | Windows 便携版：`zip` 或单个 `exe` |
| `portable.files` | `[]` | 一起放进便携版的文件，如 `../LICENSE`、`lib/ffmpeg.exe` |
| `portable.binaries` | `[]` | 一起放进便携版的其他 cargo 包（如命令行工具） |
| `release.repo` | 当前仓库 | 发布到的仓库 `owner/name` |
| `release.title` | `<产品名> {version}` | 发布标题 |
| `release.notes` | — | 固定的发布说明文件（下载说明、系统要求），`{version}` 会被替换 |
| `release.workflow` | — | 设置后，只接受该 workflow 在 main 上成功运行、且正好是 tag 所在提交的候选包 |
| `release.buildJob` | `Build ({platform})` | 每个平台构建 job 的名称 |
| `release.generateNotes` | `false` | 在说明末尾追加 GitHub 自动生成的提交/PR 列表（`--generate-notes`） |
| `clean.paths` / `clean.deepPaths` | `[]` | 额外要清理的路径（普通 / `--deep`） |

版本号必须在 `package.json`、Tauri crate 的 `Cargo.toml`（支持 `version.workspace = true`）和 `tauri.conf.json`（如果写了）里完全一致。

公开文件名不带版本号，"最新版"下载链接因此长期有效：`<产品>-windows-setup.exe`、`<产品>-windows-portable.zip|exe`、`<产品>-macos-arm64.dmg`、`<产品>-linux-x64.AppImage`、`<产品>-linux-x64.deb`。

## GitHub Actions

```yaml
- uses: ilammy/msvc-dev-cmd@v1        # Windows runner
  with: { arch: x64 }
- run: pnpm install --frozen-lockfile
- run: pnpm run build:app              # → dist/candidate-<platform>/
- uses: actions/upload-artifact@v6
  with: { name: candidate-${{ matrix.platform }}, path: dist/candidate-${{ matrix.platform }}/ }
```

发布 job 把各平台的 artifact 下载到 `dist/candidates/candidate-<platform>/`，然后运行 `pnpm exec desktop-kit publish "$TAG"`。需要 `GH_TOKEN`；跨仓库发布另需 `RELEASE_TOKEN`。

版本号、CHANGELOG、发布 PR 和打 tag 由 [release-kit](https://github.com/ouraihub/release-kit) 负责，desktop-kit 不重复实现。用了 release-kit 的项目把本版更新内容交给 publish：

```bash
npx --yes github:ouraihub/release-kit#v0 notes "$VERSION" > changes.md
pnpm exec desktop-kit publish "$TAG" --changes changes.md
```

## 开发

源码是 `src/*.mts`（TypeScript，严格模式），编译到 `dist/*.mjs` 并提交，这样通过 git 安装时不需要构建。改源码后运行 `pnpm run build`；`pnpm run check` 会做类型检查、重新编译、确认 `dist/`、`dist-test/` 与源码一致，再跑测试。测试也随包发布：应用可以在自己的 CI 里运行 `desktop-kit self-test`，确认锁定的这个版本本身是好的。`.bat` 文件必须保持 CRLF 和纯 ASCII。
