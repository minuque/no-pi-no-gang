# CLAUDE.md

See [AGENTS.md](./AGENTS.md) for architecture, design decisions, file map, and session file format.

## 样式规范
- Dark 主题 token 文件：`tokens-dark.css`，所有颜色/间距/字体必须引用这里定义的 CSS 变量
- 冷色调（基底 `#1a1a24` 蓝偏移，accent `#5b9cf5` 冷蓝），禁止暖色泄漏到中性色
- 禁止纯黑 `#000`、纯白 `#fff`；禁止未定义在 token 文件里的裸 hex 色值
