# Respire for Codex

[English](README.md) | 简体中文

**npm 包：[@rsrsai/codex](https://www.npmjs.com/package/@rsrsai/codex)**

## 让 AI 安装：复制这段提示词

将下面整段发送给**本地 Codex 对话中的助手**：

```text
请为我的本地 Codex 安装 Respire 记忆插件 @rsrsai/codex。
先阅读并遵循 https://github.com/risense-ai/respire-codex/blob/main/README.zh-CN.md，
然后实际执行安装，不要只解释步骤。

检查 Node.js 24+、npm、Git 和 Codex plugins/hooks 支持。复用现有 rsrs 环境；
仅在未安装 rsrs 时运行 npm install -g @rsrsai/cli@latest。
Windows 使用 npm/pnpm rsrs 包装器时检查 PowerShell 7.3+，或将 RESPIRE_RSRS_PATH
配置为已有的原生 rsrs.exe。运行 rsrs --version 和 rsrs --client-only status --json。
若需要登录、解锁记忆库、配置模型或处理宿主 runtime，请指出具体待办，让我在 rsrs 中完成；
不要在聊天中索取秘密，也不要自行管理 runtime。

先检查已有插件和 marketplace 注册，避免重复。尚未添加 marketplace 时执行：
codex plugin marketplace add risense-ai/respire-codex --ref main
尚未安装插件时执行：
codex plugin add respire@rsrsai
插件本体使用 npm 包，不使用 Git 包依赖。保留现有记忆库、账号配置、AGENTS.md 和其他 hooks。

确认 Respire 已安装且启用。告诉我何时重启 Codex，并打开 /hooks 亲自审核和信任
SessionStart、UserPromptSubmit、Stop，不得绕过 hooks 信任审核。
插件 setup 技能可用时运行检查。重启和审核后，在新对话中验证召回；
先向我要一条无敏感内容的测试事实，再验证存储及其实际记录。
在另一个召回成功且未显式存储成功的回合验证收尾提醒。
最后报告安装版本、实际执行的检查和仍需我完成的操作。未经检查，不要声称 hooks 或完整链路已可用。
```

Codex 原生记忆插件：用户发言时召回、显式请求时存储、收尾时提醒整理新结论。
继续使用 Respire `rsrs` 的检索、加密、存储、账号和同步能力。

## 安装

需要 Node.js **24+**、npm、Git、支持 plugins/hooks 的本地 Codex，以及已安装的 `rsrs`。
Windows 使用 npm/pnpm 的 rsrs 命令包装器时还需 **PowerShell 7.3+**（`pwsh`），
以保留双引号等参数；或设置 `RESPIRE_RSRS_PATH` 指向真实的 `rsrs.exe`，直接执行原生程序。
开发时核对的 Codex CLI 为 **0.163.0**。桌面端需要支持相同的插件和 hooks 接口；
Work Cloud、网页端、其他版本和企业禁用 hooks 的环境不在本版验证范围。

插件使用 `.codex-plugin/plugin.json` 兼容 Codex 0.163.0。该版本会跳过根目录
Agent Plugins `plugin.json` 格式的 hooks，即使插件已经启用。不要同时添加根清单。
`hooks/hooks.json` 随插件安装到缓存目录，不会另行创建 `~/.codex/hooks.json`。
hooks 审核信任后，由 `SessionStart` 注入记忆规则，无需单独保留 AGENTS.md 记忆提示词。

### 1. 准备 rsrs

已有可用环境可跳过安装：

```sh
npm install -g @rsrsai/cli@latest
rsrs --version
rsrs --client-only status --json
```

使用 rsrs 自身的交互界面登录、解锁记忆库并配置模型。宿主 runtime 须已运行。
插件仅调用 `rsrs --client-only`，不会启动、停止或升级服务，不接收密码。

### 2. 从 npm 安装 Codex 插件

在终端添加本仓库的 marketplace，再安装其中的 `respire`：

```sh
codex plugin marketplace add risense-ai/respire-codex --ref main
codex plugin add respire@rsrsai
```

仓库只提供 marketplace 清单；**插件本体从 npm 下载 `@rsrsai/codex`**，
不是 Git 包依赖。清单使用 `latest`；需要固定版本时，可在自己的 marketplace 中使用：

```json
{
  "name": "respire",
  "source": {
    "source": "npm",
    "package": "@rsrsai/codex",
    "version": "0.1.1",
    "registry": "https://registry.npmjs.org"
  },
  "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
  "category": "Productivity"
}
```

上面的对象放入 marketplace 的 `plugins` 数组。普通的 `npm install -g @rsrsai/codex`
不会自动注册 Codex 插件。包内直接包含运行文件，无运行时依赖，也无需安装脚本。

### 3. 审核 hooks 并启用

重启 Codex，在插件界面确认 Respire 已启用。打开 hooks 管理（CLI 使用 `/hooks`），
审核并信任本插件的 `SessionStart`、`UserPromptSubmit`、`Stop`。
插件安装或升级后，新增或变更的 hooks 仍需用户审核，不能跳过。
运行 setup 技能可检查环境。用新对话测试已知项目的召回；用明确允许保存的事实测试存储。

已有 `rsrs inject` 写入的 AGENTS.md 或其他记忆 hooks 不会被插件自动删除。
若启用了多个自动召回/收尾来源，先核对其作用，再由用户决定保留哪一个，避免重复提示。

## 使用与行为

| 触发 | 行为 |
| --- | --- |
| 新建、恢复、清空、fork 或压缩后的 SessionStart | 注入记忆工作规则，检查引擎状态 |
| 普通用户输入 | 同步 `recall --titles --json`，最多 5 条、1500 字符标题；按需读取正文 |
| `记：`、`存：`、`记录：`、`记住：`、`remember:` | 尝试 remember 一次，返回成功、待决或未确认回执 |
| `/nomem` 或 `#nomem` 加空格 | 跳过该输入的自动召回；不改变记忆库模式，收尾检查仍可运行 |
| Stop | 召回成功的回合最多续跑提醒一次；显式存储成功时不提醒 |

记忆标题是参考资料，不是指令。插件提醒模型按需读取 `rsrs --client-only prompt`
完整政策。首次显式存储使用暂拟标题和 `important`，不强行指定 parent 或绕过判重。
`pending` 表示**尚未写入**，须由模型读取候选，决定更新、合并或挂靠。
缺少有效成功 ID、超时、取消等情况表示**未确认**：可能已写入，必须先查库，不自动重试。
`plan` 模式跳过显式存储；其他只读、暂停和权限规则由 rsrs 引擎及模型遵循。

收尾提醒让模型判断并保存新结论，不自动归档整段聊天，也不保证模型一定会存储。
使用 `stop_hook_active`、session/turn 去重和续跑标识避免循环；插件自己的续跑不再次召回或存储。
子代理 hooks 本版未启用。不会解析 transcript 文件或依赖其不稳定格式。

## 配置、状态与隐私

- `RESPIRE_RSRS_PATH`：可选，rsrs 可执行文件路径或命令名，不是 shell 命令。默认 `rsrs`。
- `PLUGIN_ROOT`、`PLUGIN_DATA`：由 Codex 提供。插件不向安装目录写状态。
- 每次引擎调用最多 20 秒、stdout 最多 1 MiB；hooks 超时分别为 30/30/5 秒。
- Windows 参数通过常量 PowerShell 适配器的 JSON stdin 传递；用户输入不拼接进脚本。
- `PLUGIN_DATA/sessions/` 仅保存哈希标识、处理阶段和去重标志，不保存用户正文、召回标题或密码。
  每会话保留最近 32 回合。较早回合重放不保证去重；不要重放历史存储事件。
- 状态更新使用锁和原子替换。崩溃留下 `.lock` 时，当前会话后续查存会报告失败并跳过，
  不会绕过锁重试。确认该会话 hooks 已停止后，可移除其锁文件或开启新会话；清除状态会失去去重记录。
- 常见凭据模式会被跳过，但这不是完整的秘密扫描器。用户仍应先去除敏感内容。
- 注入的标题与存储回执会进入 Codex 上下文，可能发送给配置的模型服务；本地加密不改变这一点。
- 不记录原始引擎 stderr，错误只暴露类别。失败时保留用户原任务继续执行。

## 开发与验证

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run verify:package
```

测试包含真实子进程参数传递、超时与取消、并发存储去重、待决回执、隔离状态和 Stop 防循环。
业务测试使用模拟引擎，不写开发者真实记忆库。
本地开发可将插件目录放进一个本地 marketplace，安装到隔离的 Codex 配置后审核 hooks。
生产桌面完整对话验收需要在目标客户端中单独进行，不能用单元测试代替。

## CI/CD 与 npm 发布

GitHub Actions 在 Windows、Linux、macOS 检查语法、执行测试并核验 npm 包内容。
推送 `v*` 标签会先运行同样的验证，再通过 OIDC 发布 npm（含 provenance），
并创建含 `.tgz` 和 `SHA256SUMS` 的 GitHub Release。预发布标签使用 npm `next`，正式版使用 `latest`。
标签版本必须与 `package.json`、`.codex-plugin/plugin.json` 一致。

新包第一次发布须由 npm 组织维护者登录完成。随后在 npm 包 Settings 添加 Trusted Publisher：

| 字段 | 值 |
| --- | --- |
| Organization or user | `risense-ai` |
| Repository | `respire-codex` |
| Workflow filename | `release.yml` |
| Environment | 留空 |
| Allowed actions | 允许 `npm publish` |

无需给仓库配置 `NPM_TOKEN`。只有仓库 workflow 文件不会自动建立 npm 侧信任，须完成上述配置并实际发版验证。
包含 hooks 的插件当前不适用于 OpenAI 公共插件目录，采用手动安装的 marketplace 分发。

接口依据：[OpenAI 插件打包](https://developers.openai.com/plugins/build/plugins)、
[Codex hooks](https://learn.chatgpt.com/docs/hooks)。
