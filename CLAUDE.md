# CLAUDE.md

## 验收标准

### 每次改动后（快速循环，<10s）

```
node_modules/.bin/tsc --noEmit          # 零 error
node node_modules/next/dist/bin/next lint  # 零 error + warning
bun run dev:watchdog                     # 启动（堆 3GB，超 2.25GB 自动重启）
```

截图验证：
- 导航到改动页面，截图确认 UI 正确
- `evaluate` 检查 `console.error` 无新增错误
- Chrome 每 30 次截图后重启

### 提交前（最终闸门）

```
node node_modules/next/dist/bin/next build  # 生产构建，捕获 dev 模式遗漏的 SSR/动态 import 错误
```

### 设计约束

UI 设计语言与组件美学规范，详见 [`DESIGN.md`](./DESIGN.md)。所有 UI 改动必须遵守其中列出的设计约束（色彩、字体、圆角、阴影、动画、Token 使用等）。