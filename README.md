# kk-skills

一组面向工程 Agent 的可验证 Skills。仓库中的确定性工具统一使用 TypeScript，Skill 本身遵循 `SKILL.md` 的渐进式披露结构。

## Skills

| Skill | 用途 |
| --- | --- |
| `skill-doctor` | 审计 Skill 的结构、引用、安全信号与可移植性 |
| `skill-evaluator` | 校验触发与行为评测用例，并对运行结果执行断言 |
| `ts-change-verification` | 为 TypeScript 变更计算受影响 workspace 和验证命令 |
| `dependency-incident-audit` | 将依赖安全公告映射到仓库中的直接依赖与锁文件证据 |
| `ts-release-readiness` | 检查 TypeScript/npm 包的发布就绪状态 |
| `docs-code-sync` | 发现环境变量、CLI 参数、导出符号与文档之间的漂移 |
| `runtime-compatibility-probe` | 评估包在 Node、Bun、Deno、浏览器和 Edge 中的兼容风险 |
| `miniapp-release-audit` | 审查微信小程序、Taro 与 uni-app 的发布前风险 |
| `architecture-implementation-audit` | 将架构、ADR 与协议声明映射到实现、配置和测试证据 |
| `vendor-submodule-guardian` | 检查 submodule 路径、gitlink、固定提交和 vendor 工作树状态 |
| `delivery-completeness-ledger` | 用稳定任务 ID、验收标准和证据跟踪长期计划完成度 |
| `migration-parity-keeper` | 审计旧系统到新系统的功能对等与切换准备度 |
| `agent-runtime-diagnostics` | 沿进程、认证、模型、推理、状态和 UI 链路诊断 Agent 可用性 |
| `desktop-release-matrix` | 按平台和架构验证桌面安装包、校验和与冒烟证据 |
| `evidence-based-technical-decision` | 使用项目约束、权重、官方证据与可逆性比较技术方案 |
| `product-engineering-loop` | 闭环执行产品诊断、实现、行为与视觉验证 |
| [`usage-window-scheduler`](docs/usage-window-scheduler.md) | 使用经济型模型在固定时间发送最小 Codex 请求，尝试启动订阅额度窗口 |

## 开发

需要 Node.js 22.6+ 和 pnpm；TypeScript helper 通过 Node 的类型剥离能力直接运行：

```bash
pnpm install
pnpm run check
pnpm run test:smoke
```

只校验 Skill 结构：

```bash
pnpm run skill:validate
```

运行某个 Skill 的 TypeScript 助手：

```bash
node --experimental-strip-types skills/skill-doctor/scripts/doctor.ts ./skills
```

每个 `skills/<name>/` 目录都是独立的 Skill 包。复制或安装单个 Skill 时，不应要求同仓库内的其他 Skill 存在。

## 文档

- [Skill 与 MCP 的集成边界](docs/mcp-integration.md)
