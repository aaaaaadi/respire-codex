# 当前回合可靠归档实施计划

> 执行本计划时使用 superpowers:executing-plans 技能；步骤以复选框跟踪。

**目标：** 修复空召回与超长当前回合导致的归档遗漏。
**架构：** 整理工具证据，拆分超长对话，通过无工具工作进程提炼，再统一查重、写入和验证。
**技术栈：** Node.js >=24、node:test、Codex app-server、rsrs client-only。
**方案：** docs/superpowers/specs/2026-10-26-reliable-turn-archive.md。

## 全局约束

- 使用用户指定的独立源码目录与功能分支。
- 保留唯一插件身份及现有 Runtime、账号和记忆库。
- 用户测试确认前不创建 PR，不修改钩子信任，不自动重启 Codex。
- 直接归档最多 64000 字符；每段最多 48000 字符；最多 12 段；每段提炼输出最多 6000 字符；总计 280 秒。
- 所有提炼结束后方可写入；结果不确定的写入禁止重试。

## 审查重点

- 只有成功的零命中响应可以继续归档，暂停与错误响应仍跳过。
- 超长用户限制和后续纠正须完整保留在来源片段中，不得为满足长度预算丢弃授权条件。
- 工具证据截取必须可见，不得把未经验证的陈述转为已验证成功。
- 多工作进程的通知和取消不得推进错误阶段，超时后不得继续发起写入。
- 安装保留官方回退版本，避免重复钩子；真实存储验证仅使用已授权事实。

### 任务一：空召回归档资格

**文件：** lib/hook.js、test/hook.test.js。
**接口：** handleHook(event, options) 将 skip/count=0 的成功召回标记为 ready。

- [x] 编写零命中仅触发一次 Stop、暂停和错误响应不归档的测试。
- [x] 运行 node --test test/hook.test.js，先确认零命中测试失败。
- [x] 收窄修改 ready 判断条件，确认全部钩子测试通过。
- [x] 仅提交明确修改的文件。

### 任务二：上下文限制与分段提炼

**文件：** 新增 lib/archive-context.js、test/archive-context.test.js，修改 lib/archive.js、lib/hook.js、test/archive.test.js。
**接口：** prepareArchiveContext(items) 返回分段、覆盖范围和元数据；parseExtraction(text, fragments) 校验有上限且可追溯来源的事实。

- [x] 添加上下文整理、分段、纠正保留、超限、未知来源和流程失败测试，先确认失败。
- [x] 运行 node --test test/archive-context.test.js test/archive.test.js，确认基线不能通过新增测试。
- [x] 实现纯上下文准备与顺序无工具提炼，仅在全部成功后启动最终归档工作进程。
- [x] 仅保存进度元数据、已验证和已回读 ID；失败与取消时保持写入限制。
- [x] 运行 npm test，确认全部通过。
- [x] 仅提交明确修改的文件。

### 任务三：打包、安装与真实验证

**文件：** README.md、README.zh-CN.md、package.json、.codex-plugin/plugin.json、scripts/check-package.js，以及仓库外的本机部署文件。

- [x] 说明上限、部分证据覆盖和零命中行为，明确本地预发布版本。
- [x] 运行 npm run check、npm test、npm run verify:package，确认通过。
- [x] 完成独立最终代码审查，用回归测试修复实质问题。
- [x] 备份官方包和注册信息，通过市场工具安装，不修改信任。
- [x] 验证真实召回、已授权归档及同 ID 回读，说明桌面触发和重启验收边界。
- [x] 推送功能分支至 origin，确认工作区干净且与远程一致，不创建 PR。
