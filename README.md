# key-trainer · 五线谱调号反应训练

手机 App 的网页端工程（后续用 Capacitor 打包安卓）。第一阶段交付：脚手架 + 核心层（乐理判定）+ 刻谱层（SVG 谱表）+ 测试。UI / 音效 / 关卡内容在第二阶段接入。

## 命令

```bash
npm install     # 安装依赖（仅 vite / typescript / vitest，无 UI 框架、无音频库）
npm test        # 跑 vitest 测试
npm run build   # 类型检查 + 构建到 dist/
npm run dev     # 本地开发服务
npm run preview # 预览构建产物
```

## 结构

- `src/core/music-theory.ts`：调号数据表 + 判定口诀纯函数 + `noteInfo()` / `anchorText()`
- `src/engraving/`：SMuFL 字形（Bravura）、调号槽位表、`buildStaff()` 谱表刻绘、DOM 渲染工具
- `tests/`：28 个调号主音、口诀、认音边界、调号槽位 y 坐标回归测试

字形版权：Bravura，SIL Open Font License。
