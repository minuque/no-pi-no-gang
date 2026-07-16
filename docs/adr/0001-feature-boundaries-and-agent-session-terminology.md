# ADR 0001：Monorepo 边界与统一术语

## 状态

已接受。

## 决策

项目只有一条生产实现路径：

```text
CLI → Web BFF → AgentHost → AgentPool → RuntimeAdapter → Pi SDK
```

- `apps/cli` 是生产入口，监督 AgentHost 与 Web 两个进程。
- `apps/web` 负责浏览器交互、展示状态和 BFF 代理，不持有智能体运行时。
- `apps/agent-host` 是运行时创建、命令、Session 修改、工具状态、并发和 RuntimeEvent 发布的唯一所有者。
- `packages/agent-protocol` 定义跨进程、运行时无关的契约。
- `packages/runtime-pi` 实现 Pi RuntimeAdapter 和 SessionRecord 映射。

所有代码和文档统一使用以下术语：

| 术语 | 定义 |
| ---- | ---- |
| AgentHost | 独立服务，拥有运行时执行并暴露版本化 Host API |
| AgentPool | AgentHost 内管理活动运行时句柄、并发、Turn 和空闲回收的组件 |
| Session | 由 Session ID 标识的持久化对话聚合 |
| Turn | Session 内从一次 prompt 到完成的一轮执行 |
| SessionRecord | 不可变持久化记录，用于重建消息、上下文和分支树 |
| RuntimeEvent | 运行时无关事件，由 RuntimeAdapter 产生并经 AgentHost 交付 |

`RPC` 只描述实际的远程过程调用机制，不作为 Session、运行时句柄或生命周期组件的名称。

## 原因

独立 AgentHost 让运行时生命周期脱离 Next.js 请求与热更新，AgentPool 可以集中处理 Session 串行化、活动 Turn、事件订阅和关闭。统一协议术语避免 Web 模型、Pi SDK 名称与跨进程契约表达同一概念时出现多套名称。

## 结果

- 新运行时通过 RuntimeAdapter 接入 AgentHost。
- Web 只能通过 AgentHost 协议执行运行时操作。
- SessionRecord 是持久化与分支语义的标准名称；RuntimeEvent 是实时事件的标准名称。
- 不增加并行的 Web 进程内运行时实现。
