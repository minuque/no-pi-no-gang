# ADR 0001：功能域边界与 AgentSession 术语

## 决策

前端实现按工作台、聊天、会话、工作区、设置和共享组件 6 个功能域组织，置于 `components/` 目录下：

```
components/{workbench,chat,session,workspace,settings,shared}/
```

`hooks/` 目录保持扁平（hook 天然跨域），不再有 re-export 兼容门面。

进程内运行对象统一称为 AgentSession。`RPC` 仅指 Pi SDK 的真实 JSON-RPC 运行模式，不能用于本项目的会话包装器、状态或启动函数。

## 原因

AgentSession 会跨请求和热更新持续存在，其注册表、启动锁、事件订阅和状态投影需要明确的生命周期边界。功能域目录使实现位置与产品职责一致，同时避免一次性破坏仓内导入。

## 注释原则

删除英文注释。中文注释只说明缓存、并发锁、会话恢复、事件订阅、安全校验和异常恢复等“为什么”；直观代码不添加注释。
