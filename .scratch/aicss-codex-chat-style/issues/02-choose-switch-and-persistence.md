# 确定切换入口与默认策略

Type: grilling
Status: resolved
Blocked by: 01

## Question

ChatStyle 应按什么范围持久化，入口放在哪里，升级后的默认值是什么？

## Answer

ChatStyle 是全局用户偏好，通过 localStorage 持久化，切换后所有 Session 立即使用同一 renderer。入口位于聊天区右上工具栏，显示 Claude/Codex 二态。默认保持 Claude；只有用户主动选择后才持久化 Codex，升级不改变现有体验。

## Comments

- 2026-07-17：用户确认全局偏好、右上入口和 Claude 默认值。
