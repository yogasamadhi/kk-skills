# Skill 与 MCP 的集成边界

## 仓库定位

`kk-skills` 是面向工程 Agent 的可验证工作流集合。每个 Skill 应定义：

- 在什么任务下触发以及何时不应触发；
- 使用哪些已有工具或外部能力；
- 执行步骤、判断分支和用户确认点；
- 完成条件、验证证据和结果格式；
- 工作流需要的参考资料、模板和短小确定性脚本。

与之配套的 [`kk-mcp-kit`](https://github.com/yogasamadhi/kk-mcp-kit) 负责提供
本地数据、系统、设备和私有服务的结构化访问，以及权限、审批、脱敏、限流和
审计等不可绕过的约束。

核心边界是：

> Skill 定义 Agent 应该怎样完成任务；MCP 定义 Agent 被允许调用哪些能力。

## 不以“是否有代码”划界

Skill 的正式结构允许包含 `SKILL.md`、`scripts/`、`references/` 和 `assets/`
等内容。辅助脚本并不会自动使一个 Skill 变成 MCP。

适合保留在 Skill 内的 TypeScript helper 通常：

- 无状态、执行时间短；
- 使用与当前 Agent 相同的权限；
- 输入输出简单且与当前工作流紧密相关；
- 不持有凭据、连接池、设备会话或后台任务；
- 不需要向多个客户端提供稳定 API。

例如解析测试结果、检查 frontmatter、扫描文档字段、计算受影响 workspace、
整理验证命令，都适合作为 Skill 的确定性助手。

## 什么时候继续写 Skill

当 Agent 已经具备必要的文件、Shell、Git、浏览器或其他工具，只是需要掌握
正确做法时，应继续写 Skill：

- 固化团队检查表和发布流程；
- 规定工具调用顺序及判断分支；
- 只验证受变更影响的范围；
- 在变更、发布、部署和外部消息前请求授权；
- 统一报告、证据和失败说明格式；
- 组合多个已有工具完成一个用户任务。

Skill 的粒度应面向完整用户任务，例如“检查 TypeScript 包发布就绪状态”或
“审计小程序发布风险”，而不是只包装一个底层命令。

## 什么时候依赖 MCP

当工作流需要 Agent 原本没有或不应直接拥有的能力时，Skill 应调用 MCP：

- 查询本地数据库、私有制品库或内网服务；
- 读取进程、端口、容器和系统日志；
- 操作模拟器、开发者工具或串口设备；
- 使用不能暴露给模型的密钥执行受控操作；
- 查询持久化代码索引、缓存或历史评测结果；
- 执行需要事务、审批、审计或原子性的动作。

MCP tool 的粒度应面向可组合的能力单元，例如 `list_services`、
`query_readonly` 或 `capture_logs`。Skill 再将这些工具组合为诊断、审计或发布
流程。

```text
用户任务
   ↓
Skill：规划、判断、组合、确认、验证
   ↓
MCP：查询、执行、权限控制、结构化结果
   ↓
本地系统 / 数据库 / 容器 / 设备 / 内网
```

## 必须由 MCP 强制的规则

Skill 可以指导 Agent 谨慎操作，但不能代替代码层安全边界。以下规则如与某个
能力相关，必须由 MCP Server 实施：

- 路径、命令、数据源和操作白名单；
- 数据库默认只读及 SQL 类型检查；
- 写操作计划、审批令牌和事务；
- 密钥、个人信息和敏感字段脱敏；
- 超时、输出大小、返回行数和并发限制；
- 操作审计、速率限制和恢复机制。

Skill 仍然负责用户体验层的授权，例如在调用变更工具前解释影响并请求明确
确认。原则是：

> 建议性约束和确认流程放 Skill；不可绕过的执行约束放 MCP。

## Skill helper 升级为 MCP 的条件

出现以下一个或多个信号时，应评估将 helper 能力迁移到 `kk-mcp-kit`：

1. 需要常驻进程、连接池、持久索引、缓存或会话；
2. 需要独立凭据、设备权限或私有网络权限；
3. 多个 Skill 或 MCP Client 需要重复使用；
4. 需要屏蔽跨平台命令和输出格式差异；
5. 需要稳定的结构化协议、版本和错误模型；
6. 需要强制审批、审计、限流、恢复或事务；
7. 直接执行脚本会向 Agent 暴露过大的系统权限。

仅仅因为脚本变长，或者两个 Skill 存在少量相似逻辑，并不足以立即引入 MCP。
可以先改善单个 Skill 的实现和测试，在能力边界稳定后再抽取。

## 与 `kk-mcp-kit` 的仓库契约

依赖方向保持单向：

```text
kk-skills
    │  可选择调用
    ▼
kk-mcp-kit
    │
    ▼
本地数据库 / 进程 / 容器 / 设备 / 内网
```

### `kk-skills` 的责任

- 保持每个 `skills/<name>/` 自包含；
- 不从相邻 Skill 或 `kk-mcp-kit` 源码目录导入文件；
- 描述所需 MCP 能力、工具名称和不可用时的行为；
- 区分必需依赖和可选增强；
- 为可选 MCP 提供合理降级，为必需 MCP 给出明确缺失说明；
- 将确认点、完成条件和验证证据写进工作流；
- 不在 Skill、脚本、示例或日志中保存凭据。

### `kk-mcp-kit` 的责任

- 提供与具体工作流无关的稳定 tool schema；
- 返回紧凑、结构化、可验证的结果，而不是大段原始输出；
- 实施权限、审批、脱敏、限流和审计；
- 维护稳定错误代码、版本兼容性和协议测试；
- 脱离 `kk-skills` 也能被其他 MCP Client 使用。

Skill 不应依赖本机相邻仓库路径，例如 `../kk-mcp-kit`。本地开发可以并排放置
两个仓库，但正式分发应通过已安装的 MCP Server、Plugin 或明确的用户配置建立
连接。

## 依赖 MCP 的 Skill 编写规范

### 描述能力而不是安装假设

在 `SKILL.md` 中说明工作流需要的能力及用途，不要假设某个绝对路径、包管理器
缓存或本机进程一定存在。

推荐表述：

```text
需要可读取本地服务状态和近期日志的 MCP tools。
若 dev-observer 可用，优先使用 list_services 和 collect_recent_errors。
```

避免表述：

```text
直接运行 /Volumes/.../kk-mcp-kit/dist/server.js。
```

### 区分必需与可选能力

- **必需 MCP**：缺失时无法安全完成任务，应尽早停止并说明安装或连接要求。
- **可选 MCP**：缺失时仍能使用原生工具完成受限版本，应明确能力差异，不要
  悄悄降低安全性。

如果降级方案无法实施同等的权限控制，就不能把它描述为等价方案。

### 以工具结果驱动判断

Skill 应根据 MCP 返回的结构化字段做决定，不应依赖展示文本中的措辞。对错误、
空结果、超时、部分成功和需要审批等状态都应定义处理方式。

### 保留用户授权边界

即使 MCP 能执行写操作，Skill 也不得把“工具存在”解释为“用户已授权”。发布、
部署、上传、外部消息、生命周期脚本和其他有副作用操作，仍需遵守仓库的明确
授权规则。

## 当前 Skills 的归属

现有 Skills 目前都应留在本仓库：

| Skill | 当前判断 | 可能需要 MCP 的未来场景 |
| --- | --- | --- |
| `skill-doctor` | Skill | 常驻 Skill 注册表、安装源或集中审计服务 |
| `skill-evaluator` | Skill/仓库工具 | 隔离沙箱、历史结果存储或大规模评测调度 |
| `ts-change-verification` | Skill | 持久化的跨仓库依赖图和符号索引 |
| `dependency-incident-audit` | Skill | 私有制品库、内部 SBOM 或漏洞数据库 |
| `ts-release-readiness` | Skill | 私有 registry、签名服务或发布权限系统 |
| `docs-code-sync` | Skill | 常驻索引、多仓库检索或文件监听服务 |
| `runtime-compatibility-probe` | Skill | 真实的多运行时执行环境池 |
| `miniapp-release-audit` | Skill | 微信开发者工具、模拟器、预览或上传控制 |

未来可能形成的配对关系：

| `kk-skills` 工作流 | `kk-mcp-kit` 候选能力 |
| --- | --- |
| `diagnose-local-app` | `dev-observer` |
| `analyze-local-data` | `data-lens` |
| `release-readiness` | `test-evidence` / `artifact-inspector` |
| `change-impact-analysis` | `code-index` |
| `debug-mobile-app` | `device-lab` |
| `run-verified-operation` | `secret-broker` |

这些名称是候选架构，不代表对应 Server 或 Skill 已经实现。

## 测试要求

新增或修改带 MCP 依赖的 Skill 时，至少验证：

- MCP 可用时选择正确工具并正确解释结果；
- 可选 MCP 缺失时按文档降级；
- 必需 MCP 缺失时快速、明确地停止；
- 超时、空结果、部分成功和工具错误不会被误判为完成；
- 只读检查不会意外触发写操作；
- 写操作仍要求明确授权并验证执行结果。

修改 Skill 或 helper 后，继续运行仓库规定的检查：

```bash
pnpm run check
pnpm run test:smoke
```

## 分发说明

本仓库的 `skills/<name>/` 是 Skill 源码与分发单元。安装时应将 Skill 放入客户端
支持的 Skill 位置，或者通过 Plugin 分发。不要依赖仓库名称或普通 `skills/`
目录被客户端自动发现。

如果未来需要一键安装配套工作流和 MCP，可以增加独立 Plugin 打包层；不要为
了分发方便而混合 `kk-skills` 与 `kk-mcp-kit` 的源码职责。

## 官方参考

- [OpenAI：Build skills](https://learn.chatgpt.com/docs/build-skills)
- [OpenAI：Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
