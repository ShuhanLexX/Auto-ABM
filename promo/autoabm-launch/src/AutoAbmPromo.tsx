import {AbsoluteFill, Sequence} from 'remotion'
import {BrandIntro} from './components/BrandIntro'
import {ClosingCTA, SplitCompareScene} from './components/ClosingCTA'
import {ScreenshotScene} from './components/ScreenshotScene'

const SCENE = 90 // 3 seconds per scene at 30fps

export const AutoAbmPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#0f172a'}}>
      <Sequence durationInFrames={SCENE}>
        <BrandIntro />
      </Sequence>

      <Sequence from={SCENE} durationInFrames={SCENE}>
        <ScreenshotScene
          src="screenshots/01-01-home-abm-composer.png"
          title="自然语言驱动 ABM 仿真"
          subtitle="描述现象，AI 帮你生成研究方案"
        />
      </Sequence>

      <Sequence from={SCENE * 2} durationInFrames={SCENE}>
        <ScreenshotScene
          src="screenshots/02-02-proposal-batch-cards.png"
          title="多套仿真方案，一键对比"
          subtitle="谣言传播 · 市场扩散 · 舆论极化"
        />
      </Sequence>

      <Sequence from={SCENE * 3} durationInFrames={SCENE}>
        <ScreenshotScene
          src="screenshots/03-03-workbench-after-adopt-and-run.png"
          title="仿真工作区"
          subtitle="Interface · 画布 · Trace · 实时指标"
        />
      </Sequence>

      <Sequence from={SCENE * 4} durationInFrames={SCENE}>
        <ScreenshotScene
          src="screenshots/04-04-run-completed-metrics-canvas.png"
          title="运行完成，证据链可追溯"
          subtitle="每个解释都锚定在真实 Trace 上"
        />
      </Sequence>

      <Sequence from={SCENE * 5} durationInFrames={SCENE}>
        <ScreenshotScene
          src="screenshots/06-06-experiment-results-chart.png"
          title="单参扫描实验"
          subtitle="批量运行，对比参数敏感性"
        />
      </Sequence>

      <Sequence from={SCENE * 6} durationInFrames={SCENE}>
        <ScreenshotScene
          src="screenshots/08-08-export-success.png"
          title="导出复现包"
          subtitle="seed + 参数 + 版本，完整可复现"
        />
      </Sequence>

      <Sequence from={SCENE * 7} durationInFrames={SCENE}>
        <SplitCompareScene
          leftSrc="screenshots/09-09-dialogue-mode-readonly.png"
          rightSrc="screenshots/10-10-research-mode-enabled.png"
          title="研究模式 & 对话模式"
          leftLabel="对话模式 · 只读解释"
          rightLabel="研究模式 · 改模型跑实验"
        />
      </Sequence>

      <Sequence from={SCENE * 8} durationInFrames={SCENE}>
        <ClosingCTA />
      </Sequence>
    </AbsoluteFill>
  )
}
