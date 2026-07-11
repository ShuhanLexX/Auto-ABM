# AutoABM 宣传片 (Remotion)

25 秒产品宣传片，使用 Playwright E2E 截图素材。

## 输出

- `out/autoabm-promo.mp4` — 1920×1080, 30fps, H.264
- 副本：`../../output/playwright/autoabm-promo.mp4`

## 分镜 (9 × 3s)

| 时间 | 场景 | 素材 |
|------|------|------|
| 0–3s | 品牌开场 | AutoABM +「今天想研究什么系统？」 |
| 3–6s | 自然语言建模 | home composer |
| 6–9s | 方案对比 | proposal batch cards |
| 9–12s | 仿真工作区 | workbench after adopt |
| 12–15s | 运行与 Trace | run completed metrics |
| 15–18s | 参数扫描 | experiment results chart |
| 18–21s | 复现包导出 | export success |
| 21–24s | 双模式对比 | dialogue vs research |
| 24–25s | CTA 收尾 | 功能亮点 + 品牌 |

## 命令

```bash
cd promo/autoabm-launch
bun install
bun run dev      # Remotion Studio 预览/调参
bun run render   # 导出 MP4
```

## 相关 Skills / 模板

- [Remotion 官方 Agent Skills](https://www.remotion.dev/docs/ai/skills) — `npx skills add remotion-dev/skills`
- [EveryInc/product-launch-video](https://github.com/EveryInc/product-launch-video) — 15–30s 发布视频工作流
- [noamdorr/saas-product-demo-video](https://github.com/noamdorr/saas-product-demo-video) — SaaS 演示视频 skill
- [meetmati-ai/MATI-teaser](https://github.com/meetmati-ai/MATI-teaser) — 完整 startup teaser 参考

## 后续可迭代

- 加背景音乐 / 旁白（Remotion `<Audio>`）
- 场景间 fade/slide 转场（`@remotion/transitions`）
- 竖屏 9:16 版本（抖音/视频号）
- 替换 emoji 为 lucide 图标
