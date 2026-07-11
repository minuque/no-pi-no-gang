# AGENTS.md

## 验收标准

### 每次改动后（快速循环，<10s）

```
npm run verify:fast  # 类型、Lint（零 warning）、单元测试
```
### 提交前（最终闸门）

```
npm run verify  # 格式、设计规范、快速检查、Turbopack 生产构建及 postbuild
```

## UI / 设计系统规则

所有视觉与组件改动必须遵循 [DESIGN.md](DESIGN.md)。
做改动前请先检查 DESIGN.md 是否已覆盖对应组件/状态，并优先复用现有 CSS token，避免新增一次性颜色。
