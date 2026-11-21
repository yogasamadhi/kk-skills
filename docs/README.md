# kk-skills 文档

- [自研 Skill](../skills/README.md) 提供独立安装入口和每项技能的用途。
- [社区技能索引](../community-skills/README.md) 记录外部开源技能的来源和许可。
- [Usage Window Scheduler](usage-window-scheduler.md) 记录安装、配置和验证步骤。

需要 MCP 的技能会注明所需能力及不可用时的处理方式。[kk-mcp-kit](https://github.com/yogasamadhi/kk-mcp-kit) 可独立接入客户端。

## 交付流程的行为评测

[交付案例](../tooling/fixtures/supertools-lifecycle-cases.json)覆盖桌面迁移、微信发行、部分回归、流水线接管，以及离线 Python 包、Windows 人工恢复、其他静态托管平台和纯本地建项。在独立临时工作区只向试用者提供 Skill 与每个案例的 `prompt`，保存实际回答后用现有 [skill-evaluator](../skills/skill-evaluator/SKILL.md) 评分。

```sh
node --experimental-strip-types skills/skill-evaluator/scripts/evaluate.ts --cases tooling/fixtures/supertools-lifecycle-cases.json --results "$RESULTS_FILE" --fail-on-unrun
```

复核每项结论所引证据和下一步。更新 Skill 后使用新的试用记录。
