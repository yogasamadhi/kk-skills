# kk-skills

本仓库维护面向工程 Agent 的自研 Skill，也收录社区开源 Skill。

## 技能目录

| 入口 | 内容 |
| --- | --- |
| [自研 Skill](skills/README.md) | 团队编写、维护和验证的技能包，每个都可独立安装。 |
| [收集的开源 Skill](community-skills/README.md) | 社区技能索引，列出用途、上游来源和许可证。 |

## 自研 Skill 开发

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

- [开源工程使用文档](docs/README.md)
