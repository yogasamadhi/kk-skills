# CloudBase 静态托管

仅在用户或项目已选用 CloudBase 静态托管时使用。若项目已有构建、校验和上传作业，沿用项目入口。以下是以 POSIX shell 直接上传已验收静态目录的示例。

使用已登录的 CLI 和已开通的静态托管环境。用 `tcb hosting detail -e "$ENV_ID"` 检查环境与域名，用 `tcb hosting deploy --help` 核对本机 CLI 支持下面的选项。核实自定义域名、托管路径和构建的 base path 对应同一个应用。若需安装 CLI 或开通服务，记录缺项并按授权处理。

## 保存并验收候选

1. 按项目命令构建，只将拟公开的文件放入该版本独立的 `site/`，保持记录文件、源码配置和凭据在站点目录之外。新版使用单独的目录，保留已验证旧版本。
2. `SKILL_DIR` 是当前安装的 Skill 目录，`SITE_DIR` 是保存的站点目录，二者均取绝对路径。指纹脚本需要 Node.js 22.6 或以上。下面的命令块使用 POSIX shell，在测试这个候选之前计算指纹。

```sh
node --experimental-strip-types "${SKILL_DIR:?请设置技能目录}/scripts/artifact-fingerprint.ts" "${SITE_DIR:?请设置已保存的产物目录}"
```

3. 将输出的 SHA-256 与候选版本一起写入本次记录，从保存的站点目录启动预览并完成必需验收。结束时用脚本的第二个参数传入刚才记录的摘要再校验一次；产物变化时，对新的候选重新验收。

## 上传已验收的产物

从**已通过验收的记录**读取 `EXPECTED_SHA256`。恢复时读取指定旧版本的记录。这样即使工作目录或构建内容后来变化，也能发现它。设置 `ENV_ID` 和 `CLOUD_PATH` 为已核实并授权的目标。若目标确实是独占站点的托管根目录，明确填写 `/` 并核对覆盖范围。项目采用子路径时填写该子路径。

在部署或恢复已获授权后执行整个命令块。校验成功才会调用上传。在 PowerShell 等其他终端使用相同参数，并显式检查校验进程退出码为零后再上传。

```sh
node --experimental-strip-types "${SKILL_DIR:?请设置技能目录}/scripts/artifact-fingerprint.ts" \
  "${SITE_DIR:?请设置已保存的产物目录}" "${EXPECTED_SHA256:?请从已验收的记录读取摘要}" &&
  tcb hosting deploy "$SITE_DIR" "${CLOUD_PATH:?请指定托管路径}" -e "${ENV_ID:?请指定目标环境}" --safe --verify
```

`--safe` 为远端现有内容备份并处理上传或校验失败，`--verify` 校验上传文件。上传可能保留旧路径。发布或恢复涉及删除页面时，检查旧路由是否仍可访问；确需清理时，列明具体路径和影响并核对授权。

## 核实用户访问的版本

在实际访问地址检查可区分本次构建的版本标记、资源内容或部署修订，并运行原业务验收。若入口文件在两个版本间完全相同，再选一个能区分版本的资源。保留部分成功、超时或复验失败的证据。遇到上传超时或客户端中断，先核对远端状态，确认仍需上传后再重试同一目标与产物。

[CloudBase 静态托管发布](https://docs.cloudbase.net/cli-v1/hosting/deploy) · [静态托管环境与访问域名](https://docs.cloudbase.net/cli-v1/hosting/detail)
