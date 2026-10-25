# msvc-kit

让 Windows 上的 Rust / Tauri 构建始终使用指定的 MSVC 编译器。

- 本机：固定使用便携 MSVC（默认 `D:\Applications\msvc-portable\msvc`，可用 `PORTABLE_MSVC_ROOT` 改）。即使装了 Visual Studio 也不用它；找不到便携版就直接失败，不悄悄换编译器。
- GitHub Actions：使用 runner 自带的 MSVC（先运行 `ilammy/msvc-dev-cmd`），并核对 `cl.exe`/`link.exe` 确实来自它。
- 解决 Git 自带的 `link.exe` 抢在 MSVC 链接器前面、导致 cargo 报 `extra operand` 的问题。

| 文件 | 用途 |
| --- | --- |
| `setup-msvc.bat` | 首次使用时下载便携 MSVC（约 455 MB，需要 `uv` 和 `curl`） |
| `msvc-env.bat` | 把 MSVC 注入当前 cmd 进程；`call` 它之后再运行任何构建命令 |
| `cargo-msvc.bat` | `msvc-env.bat` + `cargo`，参数原样传给 cargo |
| `compiler-paths.ps1` | 核对 `cl.exe`/`link.exe` 来自预期目录，被 `msvc-env.bat` 调用 |

## 接入

```jsonc
// package.json，锁定到具体 commit
"devDependencies": {
  "@ouraihub/msvc-kit": "github:ouraihub/msvc-kit#<commit>"
}
```

```bat
rem 首次
node_modules\@ouraihub\msvc-kit\setup-msvc.bat

rem 运行 cargo
node_modules\@ouraihub\msvc-kit\cargo-msvc.bat test --manifest-path src-tauri\Cargo.toml

rem 其他命令（如 tauri build）
call node_modules\@ouraihub\msvc-kit\msvc-env.bat || exit /b 1
pnpm tauri build
```

GitHub Actions（在 `pnpm install` 之后）：

```yaml
- uses: ilammy/msvc-dev-cmd@v1
  with:
    arch: x64
- name: Enforce runner compiler ownership
  shell: cmd
  run: call node_modules\@ouraihub\msvc-kit\msvc-env.bat
```

`.bat` 文件必须保持 CRLF 和纯 ASCII，否则 cmd.exe 会解析出错。

## 测试

`node test.mjs`：本机找不到便携 MSVC 时，即使设置了 `CI=true` 也必须失败。
