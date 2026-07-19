# CSS 债务治理 — Spec

来源：2026-07-18 grilling 会话，12 个决策全部闭环后拆票。

## 总目标

1. 存量 623 处内联样式（45 文件）全量迁移 Tailwind，像素中性；
2. 选择性引入 Radix UI 替换两个键盘密集交互组件，视觉逐像素复刻；
3. 参考 KIMI 的动效/交互性格做设计加法（配色、字体不动）：动效词汇表、轻玻璃层次、欢迎区品牌时刻。

## 关键决策（grilling 结论）

- **阶段**：先迁移（像素中性）→ 再动效/玻璃 → Radix 随目录批次；闸门收官。
- **刻度**：`@theme` 硬编码覆盖 radius/字号为 DESIGN.md 值（8/12/18px；11.5/13/14/15/18/22/26px），禁 var() 自引用；微调时同步 DESIGN.md。
- **迁移写法**：像素精确；任意值三级避让（刻度类 → @theme/命名类 → 任意值兜底）；off-scale 归一化留作后续独立 pass，不在本 roadmap。
- **globals.css**：接触即迁；keyframes/滚动条/`::selection`/子元素选择器留 CSS 层；`!important` 顺手清。
- **玻璃**：仅顶部导航 + 输入区；blur + 0.7~0.85 alpha + 1px 淡 border；弹层/侧栏保持实色。
- **动效栈**：CSS 为主；`motion` 懒加载只用于欢迎区输入框 morph + logo 弹性（全计划唯一非 Radix 新依赖）；先盘点存量 vt-* View Transitions。
- **状态映射**：两原则（动效=信号、同一时刻单焦点）+ 六态基线（思考=呼吸脉冲；工具=块内指示；流式=字不动只留光标；切换=连续过渡；完成=一次 settle；错误=零动效走色彩）。
- **品牌时刻**：pi logo 内联 SVG 化 + 微动效 + Agent 状态联动；打字机保留；与输入框 morph 同属欢迎区一票。
- **Radix**：主动替换 SessionSearchDialog（`@radix-ui/react-dialog`）与 ContextMenu（`@radix-ui/react-context-menu`），其余组件纯触发式。
- **验收**：每批 verify:fast + 像素中人工对照；终验 style={{}} 623→<50（仅动态值）；eslint 闸门禁新增静态 style；DESIGN.md 去 YouTube 化改名 + 动效/玻璃/依赖约束三章。

## 票图（issues/，NN 即依赖序）

01 刻度映射 → 02 试点范式 → 03~10 目录迁移批（链式）→ 11 动效词汇表、12 玻璃、13 欢迎区 KIMI 时刻；14/15 Radix 替换分别挂在 06/09 之后；16 闸门收官挂在 12/13/14/15 之后。
