# 德迅安全卫士 · 进程调查原型

威胁狩猎调查队列 + 主机详情「进程调查」Tab 的交互原型（React + Vite）。

## 本地运行

```bash
npm install
npm run dev   # http://127.0.0.1:5194
```

## 打包

```bash
npm run build   # 输出到 dist/
```

主要页面：
- `/` 调查队列与事件调查工作台
- `/hosts/<主机ID>/process-investigation` 主机详情 · 进程调查（如 `/hosts/h1/process-investigation`）
