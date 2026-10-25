# AGENTS.md：给 AI 编码助手的硬性规则

PR 由 `ai-review.yml` 按本文件审查，审查通过、必需检查全绿后自动合并，没有人工复核。

## 1. 推送前本地验证

- 运行 `pnpm run check` 并全部通过；实际运行改动的路径，不把只跑单个测试当作验收。
- GitHub CI 失败就立刻修复：`gh run list -R ouraihub/desktop-kit -L 3`。

## 2. 不许为了变绿而削弱检查

- 不删除、跳过或放宽测试，不加 `.skip`、`#[ignore]`、`allow(...)`，不删 lint 规则。测试过时就按新行为改写。
- 不从 `.github/workflows/` 或验证脚本里删步骤、降低严格程度。确实需要调整时先说明理由并取得用户同意。

## 3. 改动走 PR

- main 受分支保护，不能直推。分支名 `<type>/<简述>`，一个分支一个 PR，用 `gh pr create` 开。
- 审查要求修改时，按意见修改后推到同一分支；不要关掉审查、跳过检查或用管理员权限合并。
- 合并后远端分支自动删除；本地 `git switch main && git pull --prune` 并删除本地分支。

## 4. 提交信息

- 格式 `<type>(<scope>): <中文摘要>`，一条提交只做一件事，标题不超过 72 个字符。
- 正文默认不写；只在 diff 看不出原因时写 1–3 行"为什么"。不写文件列表、验证记录、AI 署名。
- 不提交密钥、Cookie、token、用户数据或本地数据库。

## 5. 项目规范

- 源码在 `src/*.mts`（TypeScript 严格模式），`dist/`、`dist-test/` 是编译结果并提交；改源码后运行 `pnpm run build`，`check` 会确认二者一致。
- 这里是多个桌面应用共用的工具：改命令、配置字段或产物文件名就是改契约，README 同步更新，并在各使用方（AutoNote、AutoOwl、AutoFox、AutoBee）确认影响。
- `.bat` 文件保持 CRLF 和纯 ASCII。
