# pi-web

<p align="center">
  <img src="public/pi-logo-on-light.svg" alt="pi logo" width="120" />
</p>

<p align="center">
  <strong><a href="https://github.com/badlogic/pi-mono">pi 编程智能体</a> WebUI</strong> —
  在浏览器中浏览会话、与智能体对话、分叉对话、切换消息分支。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agegr/pi-web"><img src="https://img.shields.io/npm/v/@agegr/pi-web" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@agegr/pi-web" alt="license" /></a>
</p>

## 功能

- **会话浏览器** — 按工作目录分组展示所有 pi 会话
- **实时流式输出** — 基于 SSE 的智能体实时响应
- **会话分叉** — 从任意用户消息创建独立的新会话
- **会话内分支** — 回退到任意节点继续对话，同一文件内管理分支
- **分支导航器** — 可视化树形结构，在会话分支间切换
- **模型切换** — 对话中途随时更换模型
- **工具面板** — 控制智能体可使用的工具集
- **上下文压缩** — 对长会话进行摘要，节省上下文窗口
- **打断 / 追加** — 打断正在运行的智能体，或在其完成后追加消息
- **内置文件浏览器** — 侧边栏标签页中浏览工作目录文件


## 开发

```bash
npm install
npm run dev        # 端口 8899
```

## 项目结构

```
app/api/
  sessions/          # 会话文件 CRUD
  agent/             # 发送命令、SSE 事件流
  files/             # 文件内容读取
  models/            # 模型列表与默认模型
  models-config/     # models.json 读写
components/          # UI 组件
lib/
  session-reader.ts  # 解析 .jsonl 会话文件
  rpc-manager.ts     # AgentSession 生命周期管理
  normalize.ts       # toolCall 字段规范化
```

会话文件路径：`~/.pi/agent/sessions/<编码后的工作目录>/<时间戳>_<uuid>.jsonl`

## License

[MIT](LICENSE)

