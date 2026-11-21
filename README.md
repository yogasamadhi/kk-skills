# kk-skills

本仓库维护面向工程 Agent 的自研 Skill，也收录社区开源 Skill。

## 技能目录

| 入口 | 内容 |
| --- | --- |
| [自研 Skill](skills/README.md) | 团队编写、维护和验证的技能包，每个都可独立安装。 |
| [收集的开源 Skill](community-skills/README.md) | 社区技能索引，列出用途、上游来源和许可证。 |

例如，要验收自己的项目，可以单独安装 [Supertools 项目交付](skills/supertools-project-lifecycle/SKILL.md)，然后在项目里说「用 `$supertools-project-lifecycle` 按我们的验收清单检查这一版能否交付」。各 Skill 的专用助手及运行条件见相应使用说明。

## 安装一个 Skill

从 [GitHub Releases](https://github.com/yogasamadhi/kk-skills/releases) 下载所选 Skill 的 ZIP 和同版 `SHA256SUMS.txt`。核对该 ZIP 的 SHA-256 后解压，将包含 `SKILL.md` 的整个子目录复制到 Agent 客户端配置的 Skills 目录。在客户端选择该 Skill，并按 `SKILL.md` 运行一条示例任务。对带 `INSTALL.md` 的 Skill，按其中的步骤完成所需配置。

使用源码时，可以直接复制对应的 `skills/<name>/` 目录。

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

编写通用 Skill 时，把可复用的判断方法写进主流程。目标项目决定实际命令、发布渠道和记录位置。产品专用流程请注明适用条件，某个团队的主机、目录和审批流程留在该项目的手册里。验证通用流程时，可选一个使用不同工具链或交付方式的工程一起试用。

## 技能发行

从已审阅的发布候选运行以下命令。打包机需要 Git、`zip` 和 `unzip`。将示例版本替换为本次候选版本，并指定一个尚未创建的输出目录。

```bash
pnpm run check
pnpm run test:smoke
pnpm run release:pack v0.2.0-rc.1 /path/to/new-candidate
```

命令按 Git 已跟踪的文件清单从当前工作树打包。准备发布时使用已审阅的干净工作树，并将新增 Skill 文件纳入 Git。每个 Skill 生成一个以技能目录为根的 ZIP，带许可证和安装所需文件。打包命令解压后验证 Skill 结构，成功后写入 `SHA256SUMS.txt`。

GitHub 发布后，把同一版本的 ZIP 和校验清单下载到新目录，在下载目录运行 `shasum -a 256 -c SHA256SUMS.txt`。选择本次变更的 Skill，在独立工作区从下载包安装并跑该 Skill 的业务用例，记录发行版本、提交、摘要和结果。

## 文档

- [开源工程使用文档](docs/README.md)
