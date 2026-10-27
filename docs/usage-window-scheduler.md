# Usage Window Scheduler：定时启动额度计时

在计划中的工作时间之前，向 Codex 发送一次最小请求，尝试启动订阅的使用窗口。首版通过 Codex 原生定时任务实现；只包含 Codex 适配器，后续平台按独立适配器扩展。

这是 [kk-skills](https://github.com/yogasamadhi/kk-skills) 的一个可独立安装的 Skill，采用仓库的 [MIT 许可证](../LICENSE)。它不会增加额度、重置正在运行的窗口，或重置周额度。

## 默认行为

| 项目 | 配置 |
| --- | --- |
| 执行时间 | 每天 05:00、10:00、10:01、15:00、15:01、15:02，使用安装者自己的时区 |
| 次数 | 一条任务，每天六次；05 点一次、10 点两次、15 点三次，晚间不运行，实际窗口以服务端计时为准 |
| 经济型模型候选 | `gpt-6-luna`，`low` 推理；安装时核对账号实际可用性 |
| 请求内容 | 要求只回复 `OK`，不调用工具、不读取文件 |
| 成功通知 | 静默；支持时仅通知失败 |
| 运行方式 | 支持聊天内计划；显式选择独立运行后可固定模型、避免携带长聊天历史 |
| 默认安全性 | 生成器只输出预览；不安装任务、不读取登录凭据、不发送请求 |

“经济型”针对目标订阅的额度消耗；不承诺永远最便宜，也不承诺零费用。输入上下文、系统设置、计划/模型变化都会影响实际消耗。用户可替换模型，但不能把 API 请求当成 ChatGPT 订阅的计时触发器。

## 安装

需要支持 Skills 和原生定时任务的 Codex 桌面环境。计划生成器另外需要 Node.js 22.6+，不需要安装 npm 依赖。

在 Codex 里发一句即可安装并开启任务：

```text
从 yogasamadhi/kk-skills 安装并启用 usage-window-scheduler，采用独立定时运行，其余使用默认配置。
```

在当前仓库中可直接说：**安装并启用 $usage-window-scheduler，使用默认时间和便宜模型，采用独立定时运行。**

Codex 会连续完成文件安装、读取时区、选择模型、创建或复用任务、回读验证。无需再发第二条“开启任务”，无需手写 JSON 或运行命令。已安装或已暂停的同名任务会被复用、按请求恢复，不会重复创建。

安装成功的标准是：**Skill 已安装，而且定时任务已经 ACTIVE**。结果会显示六个时间、时区、实际模型和任务 ID。只复制了文件、调度工具不可用或创建失败，都不能算完成；会明确报告“已安装，启用受阻”及原因。完整安装入口见 [INSTALL.md](../skills/usage-window-scheduler/INSTALL.md)。

当前修改尚未发布到远端时，使用当前仓库安装入口；远端安装语句须在对应文件发布后使用。

手动管理文件可参考 [Codex Skills 官方说明](https://developers.openai.com/codex/skills)。分发时保留整个 Skill 目录和仓库 MIT 许可证。

当前 Codex 的用户级搜索路径为 `~/.agents/skills/`，项目级路径为 `.agents/skills/`；也支持目录符号链接。请先检查同名 Skill 是否已存在，避免覆盖已有安装。仅提供 Codex CLI、没有桌面调度工具的环境可以运行预览，不能凭本 Skill 自行创建原生任务。

仅想预览而不启用时明确说明，例如：

```text
使用 $usage-window-scheduler，预览每天 05:00、10:00、10:01、15:00、15:01、15:02 的 Codex 计时任务。时区 Asia/Singapore，使用便宜模型，只回复 OK。先不要创建任务。
```

文件复制本身不是自动执行钩子；“一句话安装”是由 Codex 在同次请求中完成安装与启用。默认安装入口已明确要求独立运行，便于固定便宜模型。若用户选择聊天内定时唤醒，模型通常跟随该聊天；在提示词里写模型名不能切换模型。

后续管理：

```text
使用 $usage-window-scheduler，查看当前 default 配置的状态和下一次运行时间。
使用 $usage-window-scheduler，把 default 配置改为每天 05:00、10:00、10:01、15:00、15:01、15:02，晚上不运行。
使用 $usage-window-scheduler，暂停 default 配置的定时任务。
```

## 本地预览

在仓库根目录运行：

```bash
node --experimental-strip-types skills/usage-window-scheduler/scripts/plan-schedule.ts --timezone Asia/Singapore --json
```

输出时间、模型候选、原生任务字段草稿和待验证条件。没有提供已检查的任务清单时，建议动作是 `inspect`。不会把“尚未检查”当成“不存在”，也不会直接启用任务。

```bash
node --experimental-strip-types skills/usage-window-scheduler/scripts/plan-schedule.ts --timezone Asia/Singapore --times 05:00,10:00,10:01,15:00,15:01,15:02 --json
node --experimental-strip-types skills/usage-window-scheduler/scripts/plan-schedule.ts --help
```

已有任务的快照格式、去重、更新和暂停规则见 [Codex 适配器参考](../skills/usage-window-scheduler/references/codex.md)。生成器可以离开仓库独立运行，只有 TypeScript 和 Node.js 标准库依赖。

六个时间会分别发送一次请求，即使同小时的前一次已成功也照常运行；不会增加 05:01、05:02、10:02 或晚间请求。额外的分钟级请求用于再次尝试启动窗口，不代表六份独立额度。

## 验证边界

官方额度规则是：旧的五小时窗口结束后，首次消息启动新窗口，具体规则随套餐变化。见 [OpenAI 额度说明](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)。

固定时间调度不能保证精确对齐服务端窗口。机器休眠/离线、任务排队延迟、用户提前发消息、模型不可用或周额度耗尽都可能影响结果。间隔恰好五小时也会受请求到达延迟影响；收到 `OK` 只说明请求成功，不能单独证明新窗口已启动。

验收分为三个层级：任务配置正确；真正执行了请求；观察到服务端窗口重置时间。前两项不能代替第三项。本项目的自动化测试覆盖计划生成和任务协调，不会使用真实账号发送付费测试请求。

## 扩展与贡献

下一步可为 Claude、Gemini 等平台增加适配器，但需要先验证其订阅窗口和官方自动化入口。当前传入 `--platform claude` 等未实现值会直接报错。见 [平台适配器约定](../skills/usage-window-scheduler/references/platform-adapters.md)。

保持每个 Skill 自包含，确定性助手使用 TypeScript。变更后执行：

```bash
pnpm run check
pnpm run test:smoke
```

调度测试会复制整个 Skill 到临时目录，验证六个时间、模型配置、时区冲突、重复安装、更新、暂停和非法输入，全程不创建真实任务。
