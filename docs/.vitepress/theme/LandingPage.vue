<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'

const props = defineProps<{
  locale: 'zh' | 'en'
}>()

const downloadUrl = 'https://github.com/ShuhanLexX/Auto-ABM/releases/download/v1.0.0/AutoABM-1.0.0-win-x64.exe'
const releaseUrl = 'https://github.com/ShuhanLexX/Auto-ABM/releases/tag/v1.0.0'
const repositoryUrl = 'https://github.com/ShuhanLexX/Auto-ABM'

const content = {
  zh: {
    language: 'English',
    languageHref: '/en/',
    nav: ['产品', '工作流', '可信研究', '下载'],
    navIds: ['product', 'workflow', 'research', 'download'],
    navDownload: '下载 v1.0.0',
    eyebrow: 'AI 原生的 Agent-Based Modeling 科研工作台',
    titleTop: '让每一个假设，',
    titleAccent: '都走得到证据。',
    intro: '从一句研究问题，到可运行的 Simulation、可复现的实验，以及有 Trace 证据链的机制解释。无需先写 Mesa，直接研究系统如何涌现。',
    primaryCta: '下载 Windows 版',
    secondaryCta: '观看 25 秒演示',
    releaseMeta: 'Windows x64 · v1.0.0 · MIT License',
    heroLabel: 'AutoABM Research Workbench',
    heroStatus: 'Local-first · Deterministic',
    proof: ['Simulation 是一等对象', '真实 Run / Trace', 'ODD 自动同步', '复现包可导出'],
    videoEyebrow: '25 秒，看见完整闭环',
    videoTitle: '不是替你写模型。\n是让研究过程成为产品。',
    videoText: '自然语言只是入口。每个结论最终都落在版本化模型、确定性运行、结构化 Trace 与 ODD 文档上。',
    videoFallback: '你的浏览器不支持视频播放。',
    workflowEyebrow: 'From question to evidence',
    workflowTitle: '从研究问题，到可追溯结论。',
    workflowText: '把建模、运行、解释和复现放进同一个工作台，减少工具切换，也不牺牲研究严谨性。',
    workflow: [
      ['01', '描述研究问题', '用自然语言描述现象、机制假设或已有模型。'],
      ['02', '比较仿真方案', '生成机制不同的 Simulation 草案，先比较，再采纳。'],
      ['03', '运行与实验', '调参、设定 seed、观察画布与指标，执行参数扫描。'],
      ['04', '沿证据解释', '刷选 Trace 区间，把宏观变化追溯到事件与机制触发。'],
    ],
    productEyebrow: 'One workbench, the whole study',
    productTitle: '仿真，是工作台的中心。',
    productText: '界面围绕 Project、Simulation、Run、Trace、Experiment 与 ODD 组织，而不是围绕代码仓库。',
    features: [
      ['SIMULATION', '自然语言建模', '一次得到多种机制假设。比较预期行为、关键参数与建模边界后再开始运行。'],
      ['TRACE', '证据链解释', '解释必须引用真实 tick、指标值、事件与 mechanism id；没有证据时明确标注推测。'],
      ['EXPERIMENT', '可复现实验', 'seed、参数快照、Model 版本与内核版本一起记录，让结果可以重跑、比较与导出。'],
      ['ODD', '标准化文档', 'ODD 与 Model 版本同步，把模型语义直接连接到实验说明与论文方法部分。'],
    ],
    researchEyebrow: 'Built for research integrity',
    researchTitle: 'AI 可以加速研究，\n但不能替代证据。',
    researchText: 'AutoABM 的边界很明确：指标来自真实运行，解释引用真实 Trace，模型与 ODD 随版本演进。你得到的不只是一段回答，而是一条可以检查、复现和继续追问的研究链路。',
    researchPills: ['Mesa 本地内核', '确定性 seed', '版本化 Simulation', '不可变 Trace', 'ODD 七部分', '自包含复现包'],
    frameworkAlt: 'AutoABM research method framework',
    downloadEyebrow: 'Available now',
    downloadTitle: '开始研究一个系统。',
    downloadText: '下载 AutoABM 1.0.0 Windows 桌面版。安装包由 GitHub Releases 直接提供。',
    downloadButton: '直接下载 Windows x64',
    releaseButton: '查看 Release 说明',
    githubButton: '在 GitHub 查看源码',
    footerTagline: 'AI-native ABM research workbench',
    footerLinks: ['产品文档', 'GitHub', 'Releases'],
  },
  en: {
    language: '中文',
    languageHref: '/',
    nav: ['Product', 'Workflow', 'Research', 'Download'],
    navIds: ['product', 'workflow', 'research', 'download'],
    navDownload: 'Download v1.0.0',
    eyebrow: 'AI-native agent-based modeling research workbench',
    titleTop: 'Turn every hypothesis',
    titleAccent: 'into traceable evidence.',
    intro: 'Go from a research question to runnable Simulations, reproducible experiments, and mechanism explanations grounded in real Trace data — without starting from Mesa code.',
    primaryCta: 'Download for Windows',
    secondaryCta: 'Watch the 25s demo',
    releaseMeta: 'Windows x64 · v1.0.0 · MIT License',
    heroLabel: 'AutoABM Research Workbench',
    heroStatus: 'Local-first · Deterministic',
    proof: ['Simulation-first', 'Real Run / Trace data', 'Version-aligned ODD', 'Reproduction packages'],
    videoEyebrow: 'The full loop in 25 seconds',
    videoTitle: 'Not an AI that writes models.\nA product for doing research.',
    videoText: 'Natural language is only the entry point. Every conclusion lands on a versioned model, deterministic run, structured Trace, and ODD documentation.',
    videoFallback: 'Your browser does not support video playback.',
    workflowEyebrow: 'From question to evidence',
    workflowTitle: 'A research trail you can follow.',
    workflowText: 'Model, run, explain, and reproduce in one workbench — with less tool switching and no compromise on research rigor.',
    workflow: [
      ['01', 'Frame the question', 'Describe a phenomenon, mechanism hypothesis, or an existing model in natural language.'],
      ['02', 'Compare simulations', 'Generate mechanism-diverse Simulation drafts, compare their boundaries, then adopt one.'],
      ['03', 'Run experiments', 'Set parameters and seeds, watch the canvas and metrics, and execute parameter sweeps.'],
      ['04', 'Explain with evidence', 'Brush a Trace interval and connect macro changes to events and mechanism firings.'],
    ],
    productEyebrow: 'One workbench, the whole study',
    productTitle: 'Simulation stays at the center.',
    productText: 'The workspace is organized around Projects, Simulations, Runs, Traces, Experiments, and ODD — not around a code repository.',
    features: [
      ['SIMULATION', 'Model from language', 'Generate multiple mechanism hypotheses, compare expected behavior and boundaries, then choose what to run.'],
      ['TRACE', 'Evidence-grounded explanation', 'Explanations cite real ticks, metric values, events, and mechanism ids. Unsupported claims are marked as inference.'],
      ['EXPERIMENT', 'Reproducible experiments', 'Seeds, parameter snapshots, model versions, and kernel versions stay together for reruns and comparison.'],
      ['ODD', 'Standard documentation', 'ODD evolves with each model version, connecting model semantics to experiments and paper-ready methods.'],
    ],
    researchEyebrow: 'Built for research integrity',
    researchTitle: 'AI can accelerate research.\nIt cannot replace evidence.',
    researchText: 'AutoABM keeps a hard boundary: metrics come from real runs, explanations cite real Trace records, and models evolve with version-aligned ODD. The output is not just an answer — it is a research trail you can inspect, reproduce, and question again.',
    researchPills: ['Local Mesa kernel', 'Deterministic seeds', 'Versioned Simulation', 'Immutable Trace', 'Seven-part ODD', 'Self-contained repro'],
    frameworkAlt: 'AutoABM research method framework',
    downloadEyebrow: 'Available now',
    downloadTitle: 'Start with a system worth understanding.',
    downloadText: 'Download AutoABM 1.0.0 for Windows. The installer is served directly from GitHub Releases.',
    downloadButton: 'Download Windows x64',
    releaseButton: 'Read the release notes',
    githubButton: 'View source on GitHub',
    footerTagline: 'AI-native ABM research workbench',
    footerLinks: ['Documentation', 'GitHub', 'Releases'],
  },
} as const

const t = computed(() => content[props.locale])
const docsHref = computed(() => withBase(props.locale === 'en' ? '/en/guide/quick-start' : '/guide/quick-start'))
const homeHref = computed(() => withBase(props.locale === 'en' ? '/en/' : '/'))
const languageHref = computed(() => withBase(t.value.languageHref))
const asset = (path: string) => withBase(`/launch/${path}`)
</script>

<template>
  <div class="launch-page">
    <header class="launch-nav">
      <a class="brand" :href="homeHref" aria-label="AutoABM home">
        <img :src="asset('app-icon.png')" alt="" width="32" height="32">
        <span>Auto<span>ABM</span></span>
      </a>
      <nav class="nav-links" :aria-label="locale === 'zh' ? '主导航' : 'Primary navigation'">
        <a v-for="(item, index) in t.nav" :key="item" :href="`#${t.navIds[index]}`">{{ item }}</a>
      </nav>
      <div class="nav-actions">
        <a class="language-link" :href="languageHref">{{ t.language }}</a>
        <a class="nav-download" :href="downloadUrl">{{ t.navDownload }} <span>↓</span></a>
      </div>
    </header>

    <main>
      <section class="hero" id="product">
        <div class="hero-orbit hero-orbit-one" aria-hidden="true"></div>
        <div class="hero-orbit hero-orbit-two" aria-hidden="true"></div>
        <div class="hero-copy">
          <p class="eyebrow"><span></span>{{ t.eyebrow }}</p>
          <h1>{{ t.titleTop }}<br><em>{{ t.titleAccent }}</em></h1>
          <p class="hero-intro">{{ t.intro }}</p>
          <div class="hero-actions">
            <a class="button button-primary" :href="downloadUrl">{{ t.primaryCta }} <span>↓</span></a>
            <a class="button button-ghost" href="#demo">{{ t.secondaryCta }} <span>↘</span></a>
          </div>
          <p class="release-meta">{{ t.releaseMeta }}</p>
        </div>

        <div class="product-window" aria-hidden="true">
          <div class="window-bar">
            <div class="window-dots"><i></i><i></i><i></i></div>
            <span>{{ t.heroLabel }}</span>
            <b>{{ t.heroStatus }}</b>
          </div>
          <img :src="asset('autoabm-home.png')" alt="" width="1440" height="900">
          <div class="trace-ribbon">
            <span>TRACE</span>
            <i v-for="n in 24" :key="n" :style="{ height: `${10 + ((n * 13) % 28)}px` }"></i>
            <b>tick 42 → evidence</b>
          </div>
        </div>

        <div class="proof-strip">
          <span v-for="item in t.proof" :key="item"><i>✓</i>{{ item }}</span>
        </div>
      </section>

      <section class="demo-section" id="demo">
        <div class="section-heading light-heading">
          <p class="eyebrow"><span></span>{{ t.videoEyebrow }}</p>
          <h2>{{ t.videoTitle }}</h2>
          <p>{{ t.videoText }}</p>
        </div>
        <div class="video-shell">
          <div class="video-topline">
            <span>AUTOABM / PRODUCT FILM</span>
            <span>00:25</span>
          </div>
          <video
            controls
            muted
            loop
            playsinline
            preload="metadata"
            :poster="asset('autoabm-home.png')"
          >
            <source :src="asset('autoabm-promo.mp4')" type="video/mp4">
            {{ t.videoFallback }}
          </video>
        </div>
      </section>

      <section class="workflow-section" id="workflow">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow"><span></span>{{ t.workflowEyebrow }}</p>
            <h2>{{ t.workflowTitle }}</h2>
          </div>
          <p>{{ t.workflowText }}</p>
        </div>
        <div class="workflow-grid">
          <article v-for="step in t.workflow" :key="step[0]">
            <span>{{ step[0] }}</span>
            <div class="workflow-line"><i></i></div>
            <h3>{{ step[1] }}</h3>
            <p>{{ step[2] }}</p>
          </article>
        </div>
      </section>

      <section class="product-section">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow"><span></span>{{ t.productEyebrow }}</p>
            <h2>{{ t.productTitle }}</h2>
          </div>
          <p>{{ t.productText }}</p>
        </div>

        <div class="bento-grid">
          <article class="bento bento-visual">
            <div class="bento-label"><span>01</span> SIMULATION DRAFTS</div>
            <img :src="asset('autoabm-proposals.png')" :alt="t.features[0][1]" width="1440" height="900" loading="lazy">
          </article>
          <article v-for="(feature, index) in t.features" :key="feature[0]" class="bento feature-card">
            <div class="feature-index">0{{ index + 1 }}</div>
            <p>{{ feature[0] }}</p>
            <h3>{{ feature[1] }}</h3>
            <span>{{ feature[2] }}</span>
          </article>
        </div>
      </section>

      <section class="research-section" id="research">
        <div class="research-copy">
          <p class="eyebrow"><span></span>{{ t.researchEyebrow }}</p>
          <h2>{{ t.researchTitle }}</h2>
          <p>{{ t.researchText }}</p>
          <div class="research-pills">
            <span v-for="pill in t.researchPills" :key="pill">{{ pill }}</span>
          </div>
        </div>
        <figure class="framework-card">
          <div class="framework-bar"><span>METHOD / EVIDENCE BOUNDARY</span><span>AutoABM</span></div>
          <img :src="asset('method-framework.png')" :alt="t.frameworkAlt" width="1536" height="1024" loading="lazy">
        </figure>
      </section>

      <section class="download-section" id="download">
        <div class="download-glow" aria-hidden="true"></div>
        <p class="eyebrow"><span></span>{{ t.downloadEyebrow }}</p>
        <h2>{{ t.downloadTitle }}</h2>
        <p>{{ t.downloadText }}</p>
        <div class="download-actions">
          <a class="button button-light" :href="downloadUrl">{{ t.downloadButton }} <span>↓</span></a>
          <a class="button button-outline-light" :href="releaseUrl">{{ t.releaseButton }} <span>↗</span></a>
        </div>
        <a class="github-source" :href="repositoryUrl">{{ t.githubButton }} <span>↗</span></a>
      </section>
    </main>

    <footer class="launch-footer">
      <div class="brand footer-brand">
        <img :src="asset('app-icon.png')" alt="" width="32" height="32">
        <span>Auto<span>ABM</span></span>
      </div>
      <p>{{ t.footerTagline }}</p>
      <div>
        <a :href="docsHref">{{ t.footerLinks[0] }}</a>
        <a :href="repositoryUrl">{{ t.footerLinks[1] }}</a>
        <a :href="releaseUrl">{{ t.footerLinks[2] }}</a>
      </div>
      <small>© 2026 AutoABM Contributors · MIT License</small>
    </footer>
  </div>
</template>

<style scoped>
.launch-page {
  --ink: #0b1b2c;
  --muted: #5d6a76;
  --line: rgba(11, 27, 44, 0.12);
  --teal: #10b8a6;
  --teal-dark: #087f75;
  --paper: #f5f7f4;
  min-height: 100vh;
  color: var(--ink);
  background: var(--paper);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 16px;
  line-height: 1.5;
  overflow: hidden;
}

.launch-page * { box-sizing: border-box; }
.launch-page a { color: inherit; text-decoration: none; }

.launch-nav {
  position: absolute;
  z-index: 20;
  top: 0;
  left: 50%;
  width: min(1440px, 100%);
  height: 80px;
  padding: 0 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transform: translateX(-50%);
  border-bottom: 1px solid rgba(11, 27, 44, 0.08);
}

.brand { display: flex; align-items: center; gap: 11px; font-weight: 700; letter-spacing: -0.03em; }
.brand img { width: 32px; height: 32px; border-radius: 9px; }
.brand > span { font-size: 18px; }
.brand > span > span { color: var(--teal); }
.nav-links { display: flex; align-items: center; gap: clamp(22px, 3vw, 46px); }
.nav-links a, .language-link { color: #344354; font-size: 14px; transition: color .2s ease; }
.nav-links a:hover, .language-link:hover { color: var(--teal-dark); }
.nav-actions { display: flex; align-items: center; gap: 20px; }
.nav-download { padding: 10px 16px; color: white !important; background: var(--ink); border-radius: 999px; font-size: 13px; font-weight: 650; }
.nav-download span { margin-left: 7px; color: #65e5d8; }

.hero {
  position: relative;
  padding: 172px 42px 70px;
  min-height: 1000px;
  background:
    radial-gradient(circle at 50% 18%, rgba(16, 184, 166, .11), transparent 31%),
    linear-gradient(180deg, #f8faf8 0%, #f3f6f4 73%, #e9eeeb 100%);
}

.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: .32;
  pointer-events: none;
  background-image: linear-gradient(rgba(12, 35, 50, .045) 1px, transparent 1px), linear-gradient(90deg, rgba(12, 35, 50, .045) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: linear-gradient(to bottom, black, transparent 72%);
}

.hero-orbit { position: absolute; left: 50%; top: 250px; border: 1px solid rgba(12, 129, 119, .13); border-radius: 50%; transform: translateX(-50%); }
.hero-orbit-one { width: 720px; height: 720px; }
.hero-orbit-two { top: 350px; width: 520px; height: 520px; }
.hero-copy { position: relative; z-index: 2; max-width: 920px; margin: 0 auto; text-align: center; }
.eyebrow { display: flex; align-items: center; gap: 10px; margin: 0 0 24px; color: var(--teal-dark); font-size: 12px !important; font-weight: 750; letter-spacing: .13em; text-transform: uppercase; }
.eyebrow span { width: 24px; height: 1px; background: currentColor; }
.hero .eyebrow { justify-content: center; }
.hero h1 { margin: 0; font-size: clamp(54px, 7.4vw, 108px); line-height: .98; letter-spacing: -.07em; font-weight: 600; }
.hero h1 em { color: var(--teal-dark); font-style: normal; }
.hero-intro { max-width: 720px; margin: 34px auto 0; color: #465563; font-size: clamp(17px, 1.6vw, 22px); line-height: 1.7; }
.hero-actions, .download-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
.button { min-height: 50px; padding: 0 22px; display: inline-flex; align-items: center; justify-content: center; gap: 22px; border: 1px solid transparent; border-radius: 999px; font-size: 14px; font-weight: 700; transition: transform .2s ease, box-shadow .2s ease, background .2s ease; }
.button:hover { transform: translateY(-2px); }
.button-primary { color: white !important; background: var(--ink); box-shadow: 0 12px 30px rgba(11, 27, 44, .16); }
.button-primary span { color: #66e7da; }
.button-ghost { border-color: rgba(11, 27, 44, .18); background: rgba(255, 255, 255, .65); }
.release-meta { margin: 16px 0 0; color: #74808a; font-size: 12px; }

.product-window { position: relative; z-index: 3; width: min(1180px, 92vw); margin: 80px auto 0; overflow: hidden; border: 1px solid rgba(11, 27, 44, .15); border-radius: 20px; background: #fff; box-shadow: 0 42px 90px rgba(27, 57, 66, .18), 0 2px 6px rgba(11, 27, 44, .08); }
.window-bar { height: 52px; padding: 0 18px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; border-bottom: 1px solid #dce4e7; color: #667580; font-size: 11px; letter-spacing: .05em; }
.window-bar b { justify-self: end; color: #30877e; font-size: 10px; font-weight: 650; }
.window-dots { display: flex; gap: 6px; }
.window-dots i { width: 8px; height: 8px; border-radius: 50%; background: #d5dddf; }
.window-dots i:first-child { background: #58cdbf; }
.product-window > img { display: block; width: 100%; height: auto; }
.trace-ribbon { height: 62px; padding: 0 18px; display: flex; align-items: center; gap: 5px; border-top: 1px solid #e0e7e8; background: #fbfcfc; }
.trace-ribbon span { margin-right: 16px; color: #3b706c; font-size: 9px; font-weight: 800; letter-spacing: .18em; }
.trace-ribbon i { width: 3px; min-height: 6px; border-radius: 3px; background: linear-gradient(to top, #14b8a6, #88e0d7); animation: pulse 2.8s ease-in-out infinite alternate; }
.trace-ribbon i:nth-child(3n) { animation-delay: .4s; }
.trace-ribbon b { margin-left: auto; color: #819096; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; font-weight: 500; }
.proof-strip { position: relative; z-index: 4; max-width: 980px; margin: 34px auto 0; display: grid; grid-template-columns: repeat(4, 1fr); }
.proof-strip span { display: flex; align-items: center; justify-content: center; gap: 8px; color: #53616c; font-size: 12px; }
.proof-strip i { width: 18px; height: 18px; display: grid; place-items: center; border: 1px solid #8dd8d0; border-radius: 50%; color: var(--teal-dark); font-size: 10px; font-style: normal; }

.demo-section { padding: 130px 42px; color: #f4f8f6; background: #081826; }
.section-heading { width: min(1180px, 100%); margin: 0 auto 64px; }
.section-heading h2, .research-section h2, .download-section h2 { margin: 0; white-space: pre-line; font-size: clamp(42px, 5vw, 72px); line-height: 1.05; letter-spacing: -.055em; font-weight: 580; }
.section-heading > p, .split-heading > p { color: #60707a; font-size: 17px; line-height: 1.7; }
.light-heading { display: grid; grid-template-columns: 1.3fr .7fr; column-gap: 70px; align-items: end; }
.light-heading .eyebrow { grid-column: 1 / -1; color: #6de0d4; }
.light-heading h2 { max-width: 720px; }
.light-heading > p { max-width: 480px; margin: 0 0 4px; color: #aab8c1; }
.video-shell { width: min(1260px, 100%); margin: 0 auto; padding: 10px; border: 1px solid rgba(125, 225, 214, .25); border-radius: 22px; background: rgba(255, 255, 255, .035); box-shadow: 0 40px 90px rgba(0, 0, 0, .34); }
.video-topline { height: 34px; padding: 0 8px 8px; display: flex; align-items: center; justify-content: space-between; color: #7f98a5; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; letter-spacing: .16em; }
.video-shell video { display: block; width: 100%; aspect-ratio: 16 / 9; border-radius: 13px; background: #02070b; object-fit: cover; }

.workflow-section, .product-section { padding: 130px 42px; background: #f6f8f5; }
.split-heading { display: grid; grid-template-columns: 1.45fr .75fr; gap: 90px; align-items: end; }
.split-heading .eyebrow { margin-bottom: 18px; }
.split-heading > p { margin: 0 0 7px; }
.workflow-grid { width: min(1180px, 100%); margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--line); }
.workflow-grid article { min-height: 260px; padding: 24px 28px 28px 0; position: relative; border-right: 1px solid var(--line); }
.workflow-grid article:not(:first-child) { padding-left: 28px; }
.workflow-grid article:last-child { border-right: 0; }
.workflow-grid article > span { color: var(--teal-dark); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; }
.workflow-line { position: relative; height: 64px; }
.workflow-line::before { content: ""; position: absolute; left: 0; top: 31px; width: calc(100% + 28px); height: 1px; background: #cdd7d5; }
.workflow-line i { position: absolute; z-index: 1; left: 0; top: 27px; width: 9px; height: 9px; border: 2px solid #f6f8f5; border-radius: 50%; background: var(--teal); box-shadow: 0 0 0 1px var(--teal); }
.workflow-grid h3 { margin: 9px 0 12px; font-size: 20px; letter-spacing: -.03em; }
.workflow-grid p { margin: 0; color: #67747d; font-size: 14px; line-height: 1.7; }

.product-section { padding-top: 40px; }
.bento-grid { width: min(1180px, 100%); margin: 0 auto; display: grid; grid-template-columns: 1.4fr .6fr; gap: 14px; }
.bento { position: relative; overflow: hidden; min-height: 300px; border: 1px solid var(--line); border-radius: 17px; background: #fff; }
.bento-visual { grid-row: span 2; min-height: 614px; padding: 58px 18px 18px; background: #e8efed; }
.bento-label { position: absolute; top: 19px; left: 22px; color: #60716f; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; letter-spacing: .14em; }
.bento-label span { margin-right: 16px; color: var(--teal-dark); }
.bento-visual img { width: 140%; max-width: none; height: calc(100% - 18px); object-fit: cover; object-position: left top; border: 1px solid #d2dddc; border-radius: 11px; box-shadow: 0 24px 60px rgba(25, 60, 66, .17); }
.feature-card { min-height: 300px; padding: 28px; display: flex; flex-direction: column; }
.feature-index { align-self: flex-end; width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid #9dd7d1; border-radius: 50%; color: var(--teal-dark); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; }
.feature-card > p { margin: auto 0 8px; color: #1a9589; font-size: 10px; font-weight: 750; letter-spacing: .15em; }
.feature-card h3 { margin: 0 0 13px; font-size: 25px; letter-spacing: -.04em; }
.feature-card > span { color: #64717b; font-size: 13px; line-height: 1.7; }
.feature-card:nth-child(4), .feature-card:nth-child(5) { grid-column: span 1; }
.bento-grid::after { content: ""; }

.research-section { padding: 140px max(42px, calc((100vw - 1180px) / 2)); display: grid; grid-template-columns: .82fr 1.18fr; gap: 80px; align-items: center; background: #ecf0ed; }
.research-copy .eyebrow { margin-bottom: 22px; }
.research-copy > p:not(.eyebrow) { margin: 30px 0 0; color: #5e6c74; font-size: 16px; line-height: 1.8; }
.research-pills { margin-top: 28px; display: flex; flex-wrap: wrap; gap: 8px; }
.research-pills span { padding: 8px 12px; border: 1px solid #c3d0ce; border-radius: 999px; color: #4d5f63; background: rgba(255, 255, 255, .46); font-size: 11px; }
.framework-card { margin: 0; overflow: hidden; border: 1px solid #cad4d2; border-radius: 17px; background: white; box-shadow: 0 28px 70px rgba(28, 54, 60, .13); transform: rotate(1deg); }
.framework-bar { height: 44px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #d9e1df; color: #71817f; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 8px; letter-spacing: .13em; }
.framework-card img { display: block; width: 100%; height: auto; }

.download-section { position: relative; padding: 150px 42px; overflow: hidden; color: white; text-align: center; background: #0b1b2c; }
.download-section::before { content: ""; position: absolute; inset: 0; opacity: .16; background-image: linear-gradient(rgba(255,255,255,.13) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.13) 1px, transparent 1px); background-size: 72px 72px; }
.download-glow { position: absolute; left: 50%; bottom: -320px; width: 760px; height: 600px; border-radius: 50%; background: #14b8a6; filter: blur(120px); opacity: .34; transform: translateX(-50%); }
.download-section > *:not(.download-glow) { position: relative; z-index: 1; }
.download-section .eyebrow { justify-content: center; color: #73e4d9; }
.download-section > p:not(.eyebrow) { max-width: 600px; margin: 26px auto 0; color: #aab8c1; font-size: 17px; }
.button-light { color: #071522 !important; background: #f3fbf8; }
.button-outline-light { color: white !important; border-color: rgba(255,255,255,.28); background: rgba(255,255,255,.04); }
.github-source { display: inline-block; margin-top: 26px; color: #8fa3ad !important; font-size: 12px; }
.github-source span { margin-left: 6px; color: #63d9cd; }

.launch-footer { padding: 46px max(42px, calc((100vw - 1180px) / 2)); display: grid; grid-template-columns: 1fr 1fr auto; align-items: center; gap: 18px; color: #52616b; background: #f6f8f5; }
.launch-footer p { margin: 0; font-size: 12px; }
.launch-footer > div:not(.brand) { display: flex; gap: 22px; }
.launch-footer > div:not(.brand) a { font-size: 12px; }
.launch-footer small { grid-column: 1 / -1; padding-top: 22px; border-top: 1px solid var(--line); font-size: 10px; }

@keyframes pulse { from { opacity: .38; transform: scaleY(.72); } to { opacity: 1; transform: scaleY(1); } }

@media (min-width: 850px) {
  .bento-grid .feature-card:nth-child(4), .bento-grid .feature-card:nth-child(5) { grid-column: auto; }
  .bento-grid { grid-template-columns: 1.2fr .4fr .4fr; }
  .bento-visual { grid-row: span 2; }
  .feature-card:nth-child(2), .feature-card:nth-child(3), .feature-card:nth-child(4), .feature-card:nth-child(5) { min-height: 300px; }
}

@media (max-width: 900px) {
  .launch-nav { height: 68px; padding: 0 20px; }
  .nav-links { display: none; }
  .language-link { font-size: 12px; }
  .nav-download { padding: 9px 12px; }
  .hero { min-height: auto; padding: 136px 20px 54px; }
  .hero h1 { font-size: clamp(48px, 14vw, 76px); }
  .hero-orbit { display: none; }
  .product-window { margin-top: 58px; width: 100%; border-radius: 13px; }
  .window-bar { grid-template-columns: 1fr auto; }
  .window-bar > span { display: none; }
  .trace-ribbon { height: 48px; }
  .trace-ribbon i:nth-of-type(n+15) { display: none; }
  .proof-strip { grid-template-columns: 1fr 1fr; gap: 18px 8px; }
  .demo-section, .workflow-section, .product-section { padding: 90px 20px; }
  .light-heading, .split-heading, .research-section { grid-template-columns: 1fr; gap: 30px; }
  .light-heading h2 { margin-bottom: 24px; }
  .workflow-grid { grid-template-columns: 1fr 1fr; }
  .workflow-grid article { min-height: 220px; }
  .workflow-grid article:nth-child(2) { border-right: 0; }
  .bento-grid { grid-template-columns: 1fr; }
  .bento-visual { grid-row: auto; min-height: 470px; }
  .research-section { padding: 95px 20px; }
  .framework-card { transform: none; }
  .download-section { padding: 110px 20px; }
  .launch-footer { padding: 38px 20px; grid-template-columns: 1fr auto; }
  .launch-footer p { display: none; }
}

@media (max-width: 560px) {
  .nav-download { font-size: 0; }
  .nav-download span { margin: 0; font-size: 14px; }
  .hero { padding-top: 120px; }
  .hero-intro { font-size: 16px; }
  .hero-actions .button { width: 100%; }
  .window-bar b { font-size: 8px; }
  .product-window > img { width: 155%; max-width: none; transform: translateX(-24%); }
  .proof-strip { grid-template-columns: 1fr; }
  .proof-strip span { justify-content: flex-start; }
  .section-heading { margin-bottom: 44px; }
  .section-heading h2, .research-section h2, .download-section h2 { font-size: 41px; }
  .workflow-grid { grid-template-columns: 1fr; }
  .workflow-grid article, .workflow-grid article:not(:first-child) { min-height: 0; padding: 24px 0 34px; border-right: 0; border-bottom: 1px solid var(--line); }
  .workflow-line { height: 34px; }
  .workflow-line::before { top: 16px; width: 100%; }
  .workflow-line i { top: 12px; }
  .bento-visual { min-height: 390px; }
  .bento-visual img { width: 190%; }
  .download-actions .button { width: 100%; }
  .launch-footer { grid-template-columns: 1fr; }
  .launch-footer > div:not(.brand) { flex-wrap: wrap; }
}

@media (prefers-reduced-motion: reduce) {
  .launch-page *, .launch-page *::before, .launch-page *::after { scroll-behavior: auto !important; animation: none !important; transition: none !important; }
}
</style>
