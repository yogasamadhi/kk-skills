# kk-skills 文档

本目录记录 Skill 的设计约束以及与外部能力层的协作方式。

- [Skill 与 MCP 的集成边界](mcp-integration.md)：说明什么应留在 Skill、
  什么情况下应依赖或升级为 MCP，以及与 `kk-mcp-kit` 的仓库契约。
- [Usage Window Scheduler](usage-window-scheduler.md)：Codex 定时启动额度计时的安装、配置、验证边界和平台扩展方式。

## 核心结论

> `kk-skills` 负责可复用工作流，`kk-mcp-kit` 负责可调用能力与不可绕过的
> 安全边界。

Skill 可以包含确定性脚本，因此“是否包含代码”不是边界。判断重点是：该实现
是在帮助一个工作流可靠执行，还是在向多个 Agent、Skill 或客户端提供带独立
权限、状态和稳定协议的通用能力。
