# AGENTS.md

## 验收标准

### 每次改动后（快速循环，<10s）

```
node_modules/.bin/tsc --noEmit          # 零 error
node node_modules/next/dist/bin/next lint  # 零 error + warning
```
### 提交前（最终闸门）

```
node node_modules/next/dist/bin/next build  # 生产构建，捕获 dev 模式遗漏的 SSR/动态 import 错误
```
