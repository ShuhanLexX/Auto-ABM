<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'

const props = defineProps<{ locale: 'zh' | 'en' }>()

const downloadUrl = 'https://github.com/ShuhanLexX/Auto-ABM/releases/download/v1.0.0/AutoABM-1.0.0-win-x64.exe'
const releaseUrl = 'https://github.com/ShuhanLexX/Auto-ABM/releases/tag/v1.0.0'
const repositoryUrl = 'https://github.com/ShuhanLexX/Auto-ABM'
const andersonUrl = 'https://doi.org/10.1126/science.177.4047.393'

const copy = {
  zh: {
    language: 'EN',
    languageHref: '/en/',
    nav: [['产品', 'product'], ['演示', 'demo'], ['研究闭环', 'workflow'], ['方法', 'method']],
    navDownload: '下载',
    heroKicker: 'AI-NATIVE AGENT-BASED MODELING',
    heroLineOne: '让智能体演化。',
    heroLineTwo: '让涌现可见。',
    heroText: 'AutoABM 从一个研究问题出发，自动构建可运行的智能体模型，设计并执行实验，再用真实 Trace 解释宏观现象如何从微观互动中涌现。',
    heroPrimary: '下载 Windows 版',
    heroSecondary: '观看完整演示',
    heroMeta: 'v1.0.0 · Windows x64 · Local-first · Open source',
    heroScreenLabel: 'LIVE RESEARCH SYSTEM',
    heroScreenStatus: '1,000 agents · tick 38 · deterministic seed 42',
    objects: [
      ['01', '提出问题', 'Research question'],
      ['02', '构建模型', 'Versioned simulation'],
      ['03', '运行实验', 'Deterministic runs'],
      ['04', '解释涌现', 'Trace-grounded evidence'],
    ],
    statementEyebrow: 'A NEW WAY TO DO ABM',
    statementTitle: '不再把时间耗在拼工具上。\n把精力留给真正的发现。',
    statementText: '传统 ABM 研究往往散落在模型代码、实验脚本、可视化工具和说明文档之间。AutoABM 把这些环节收进同一个工作台：以 Simulation 组织研究，由 AI 推动流程，用真实运行结果约束结论。',
    demoEyebrow: 'FULL PRODUCT FILM · 02:30',
    demoTitle: '两分半，看一项研究\n如何从问题走向结论。',
    demoText: '演示从选题开始：生成并比较建模方案，运行实时仿真，设计干预实验，查看机制图与 ODD，最后得到有据可查的解释和完整复现包。',
    demoChapters: [['00:00', '研究入口'], ['00:24', '实时仿真'], ['01:06', '深度实验'], ['01:42', '机制与 ODD'], ['02:12', '自主研究']],
    videoFallback: '你的浏览器不支持视频播放。',
    productEyebrow: 'THE SIMULATION IS THE PRODUCT',
    productTitle: '让复杂系统成为\n可操控、可验证的研究对象。',
    productText: '这不是在代码编辑器旁边加一个聊天框。每个 Simulation 都有明确身份、版本、运行记录和证据链，可以被引用、比较、复现和继续追问。',
    productFeatures: [
      ['Simulation', '模型有版本，研究有来路', '模型结构、智能体、环境、参数与 ODD 共同组成一个持续演化、随时可追溯的 Simulation。'],
      ['Run + Trace', '每次运行都留下证据', '每个 tick 的状态、指标、事件与机制触发都会写入 Trace，成为后续解释的事实基础。'],
      ['Experiment', '把研究设计交给自动化', '参数扫描、干预对照和多随机种子重复，都能在同一面板中运行、比较和导出。'],
      ['Mechanism', '从看到相关，到理解机制', '把宏观曲线的变化一路追溯到微观智能体、关键事件和具体机制。'],
    ],
    canvasLabel: 'REAL-TIME SIMULATION CANVAS',
    canvasTitle: '看见 1,000 个智能体如何共同塑造一个系统。',
    canvasText: '空间、网络与连续环境实时演化。你可以随时调参、运行、暂停和回放，并在同一时间窗口中对照指标变化与智能体状态。',
    experimentLabel: 'DEEP EXPERIMENT',
    experimentTitle: '提出一个追问，立即得到一组实验。',
    experimentText: '用自然语言描述想比较的机制或干预，AutoABM 会生成对应的实验视图；基线、随机种子和指标口径始终清晰可查。',
    workflowEyebrow: 'ONE QUESTION → A RESEARCH PROGRAM',
    workflowTitle: '让一次提问，展开为一套完整的研究流程。',
    workflowSteps: [
      ['ASK', '说清想研究的现象', '从一个开放问题、已有模型或论文数据出发。'],
      ['DESIGN', '比较不同的机制假设', 'AI 生成多套建模方案；先看清假设与边界，再决定采用哪一套。'],
      ['RUN', '让模型真正运行起来', '本地 Mesa 内核执行确定性 Run，并持续写入 Trace。'],
      ['EXPERIMENT', '自动完成扫描与干预', '扫描参数、比较政策、重复运行，并汇总真实产生的指标。'],
      ['EXPLAIN', '顺着 Trace 解释涌现', '每一条结论都能回到具体 tick、智能体、事件和机制。'],
      ['REPRODUCE', '交付可复现的研究', '一并导出 Model、ODD、实验、随机种子、结果与 Trace。'],
    ],
    quoteTranslation: '多者异也。',
    quoteOriginal: 'MORE IS DIFFERENT.',
    quoteBy: 'P. W. Anderson · Science · 1972',
    quoteText: '当个体足够多、互动足够复杂，系统便会呈现出个体层面看不到的新规律。涌现不是一句比喻，而是 ABM 要观察、实验和解释的核心对象。AutoABM 让微观规则到宏观现象之间的路径可以运行、回放和核验。',
    evidenceEyebrow: 'EVIDENCE, NOT ELOQUENCE',
    evidenceTitle: 'AI 可以提出解释。\nTrace 必须给出证据。',
    evidenceText: '每次解释都从选定的 Trace 区间出发，把智能体状态、机制触发、关键事件和指标变化连在一起。哪些是事实、哪些是推断，界面会清楚标明；最终判断始终属于研究者。',
    evidencePoints: ['真实 Run 才能产生指标', '解释引用具体 tick 与机制', '无证据的内容明确标为推测', '模型版本与 ODD 一一对应'],
    methodEyebrow: 'AN EVIDENCE-BOUND RESEARCH SYSTEM',
    methodTitle: '从提出假设到写下方法，\n始终沿用同一条证据链。',
    methodText: '版本化的 Simulation 位于系统中心。建模、运行、实验、解释和文档始终指向同一模型版本；不可变的 Trace 则为每项结论划定证据边界。',
    modes: [
      ['Research mode', '研究者掌握关键决策', '模型结构变更、批量实验和结果导出，都由研究者确认。'],
      ['Dialogue mode', '只问不改，专注理解', '自由追问模型、结果和 ODD，同时保持研究对象完全不变。'],
      ['Autonomous mode', '让系统自主推进研究', '从问题出发自动生成方案、运行、比较和报告；所有数值都来自真实 Run。'],
    ],
    downloadEyebrow: 'AUTOABM 1.0',
    downloadTitle: '构建一个世界。\n看它如何涌现。',
    downloadText: 'AutoABM 是面向社会科学与复杂系统研究的 AI 原生 ABM 工作台。Windows 桌面版现已开放下载。',
    downloadButton: '下载 Windows x64',
    releaseButton: '查看 Release',
    sourceButton: 'GitHub 源码',
    footerText: 'AI-native agent-based modeling for social science and complex systems.',
  },
  en: {
    language: '中文',
    languageHref: '/',
    nav: [['Product', 'product'], ['Demo', 'demo'], ['Research loop', 'workflow'], ['Method', 'method']],
    navDownload: 'Download',
    heroKicker: 'AI-NATIVE AGENT-BASED MODELING',
    heroLineOne: 'Run agents.',
    heroLineTwo: 'Reveal emergence.',
    heroText: 'AutoABM turns a research question into runnable agent worlds, automated experiments, and verifiable mechanism explanations. Start with micro rules. Discover how macro worlds emerge.',
    heroPrimary: 'Download for Windows',
    heroSecondary: 'Watch the full demo',
    heroMeta: 'v1.0.0 · Windows x64 · Local-first · Open source',
    heroScreenLabel: 'LIVE RESEARCH SYSTEM',
    heroScreenStatus: '1,000 agents · tick 38 · deterministic seed 42',
    objects: [
      ['01', 'Ask', 'Research question'],
      ['02', 'Build worlds', 'Versioned simulation'],
      ['03', 'Run experiments', 'Deterministic runs'],
      ['04', 'Explain emergence', 'Trace-grounded evidence'],
    ],
    statementEyebrow: 'A NEW WAY TO DO ABM',
    statementTitle: 'Not faster coding.\nA faster path to discovery.',
    statementText: 'Traditional ABM work is split across model implementation, experiment scripts, visualization, and documentation. AutoABM reunites them in a Simulation-first research system — driven by AI and bounded by evidence.',
    demoEyebrow: 'FULL PRODUCT FILM · 02:30',
    demoTitle: 'From one question\nto a complete study.',
    demoText: 'The full product walkthrough moves from cases and research questions through simulation design, live runs, deep experiments, mechanism graphs, ODD, and reproducible outputs.',
    demoChapters: [['00:00', 'Research entry'], ['00:24', 'Live simulation'], ['01:06', 'Deep experiment'], ['01:42', 'Mechanism + ODD'], ['02:12', 'Autonomous research']],
    videoFallback: 'Your browser does not support video playback.',
    productEyebrow: 'THE SIMULATION IS THE PRODUCT',
    productTitle: 'Turn complex systems\ninto research objects.',
    productText: 'This is not a code editor with a chat panel. Every research object has identity, version, run history, and an evidence trail.',
    productFeatures: [
      ['Simulation', 'A versioned world', 'Model structure, agents, environment, parameters, and ODD evolve together as one Simulation.'],
      ['Run + Trace', 'Every run leaves evidence', 'State, metrics, events, and mechanism firings at every tick enter the Trace — the data root of explanation.'],
      ['Experiment', 'Automated research design', 'Run sweeps, interventions, and multi-seed repetitions in the same surface where results are compared and exported.'],
      ['Mechanism', 'From correlation to mechanism', 'Connect changes in macro curves back to micro agents, events, and causal mechanism paths.'],
    ],
    canvasLabel: 'REAL-TIME SIMULATION CANVAS',
    canvasTitle: 'Watch 1,000 agents change a system together.',
    canvasText: 'Spatial, network, and continuous environments evolve in real time. Tune, run, pause, replay, and inspect metrics and agent states in the same time window.',
    experimentLabel: 'DEEP EXPERIMENT',
    experimentTitle: 'Turn a follow-up into an experiment.',
    experimentText: 'Ask for an intervention or comparison in natural language. AutoABM builds the experiment view while keeping baselines, seeds, and metrics inspectable.',
    workflowEyebrow: 'ONE QUESTION → A RESEARCH PROGRAM',
    workflowTitle: 'Compress the research loop into one workbench.',
    workflowSteps: [
      ['ASK', 'Describe a phenomenon', 'Begin with an open question, an existing model, or research data.'],
      ['DESIGN', 'Compare mechanism worlds', 'AI proposes diverse drafts. Compare assumptions and boundaries before adoption.'],
      ['RUN', 'Make the world run', 'The local Mesa kernel executes deterministic Runs and continuously writes Trace.'],
      ['EXPERIMENT', 'Automate interventions', 'Sweep parameters, compare policies, repeat seeds, and aggregate real metrics.'],
      ['EXPLAIN', 'Trace the emergence', 'Every claim can return to a tick, an agent, an event, and a mechanism.'],
      ['REPRODUCE', 'Ship the full study', 'Export the Model, ODD, experiments, seeds, results, and Trace.'],
    ],
    quoteTranslation: 'More is different.',
    quoteOriginal: 'MORE IS DIFFERENT.',
    quoteBy: 'P. W. Anderson · Science · 1972',
    quoteText: 'Emergence is not a metaphor. It is the object ABM must observe, experiment on, and explain. AutoABM builds an executable, replayable, verifiable path between micro rules and macro phenomena.',
    evidenceEyebrow: 'EVIDENCE, NOT ELOQUENCE',
    evidenceTitle: 'AI asks why.\nTrace shows the work.',
    evidenceText: 'Explanation begins with a selected Trace window, connecting agent states, mechanism firings, events, and metric changes. Facts and inferences stay visibly separate; the researcher keeps the final judgment.',
    evidencePoints: ['Only real Runs produce metrics', 'Claims cite ticks and mechanisms', 'Unsupported content is marked inference', 'Every ODD aligns to a model version'],
    methodEyebrow: 'AN EVIDENCE-BOUND RESEARCH SYSTEM',
    methodTitle: 'From hypothesis to methods,\none evidence trail.',
    methodText: 'The versioned Simulation sits at the center. Modeling, execution, evidence, experiments, and documentation share one model identity; the immutable Trace defines the boundary of explanation.',
    modes: [
      ['Research mode', 'Human in the loop', 'Researchers approve structural changes, batch experiments, and exports.'],
      ['Dialogue mode', 'Read-only explanation', 'Question the model, results, and ODD without changing the study.'],
      ['Autonomous mode', 'Automated research', 'Generate, run, compare, and report from a question — with every number tied to a real Run.'],
    ],
    downloadEyebrow: 'AUTOABM 1.0',
    downloadTitle: 'Build a world.\nThen ask it why.',
    downloadText: 'The AI-native ABM research workbench for social science and complex systems. Available now for Windows.',
    downloadButton: 'Download Windows x64',
    releaseButton: 'View release',
    sourceButton: 'Source on GitHub',
    footerText: 'AI-native agent-based modeling for social science and complex systems.',
  },
} as const

const t = computed(() => copy[props.locale])
const homeHref = computed(() => withBase(props.locale === 'en' ? '/en/' : '/'))
const languageHref = computed(() => withBase(t.value.languageHref))
const docsHref = computed(() => withBase(props.locale === 'en' ? '/en/guide/quick-start' : '/guide/quick-start'))
const asset = (path: string) => withBase(`/launch/${path}`)
const v2 = (path: string) => withBase(`/launch/v2/${path}`)
</script>

<template>
  <div :class="['site-shell', `locale-${locale}`]">
    <header class="topbar">
      <a class="wordmark" :href="homeHref" aria-label="AutoABM home">
        <img :src="asset('app-icon.png')" alt="" width="30" height="30">
        <span>AutoABM</span>
      </a>
      <nav :aria-label="locale === 'zh' ? '主导航' : 'Primary navigation'">
        <a v-for="item in t.nav" :key="item[1]" :href="`#${item[1]}`">{{ item[0] }}</a>
      </nav>
      <div class="top-actions">
        <a class="language" :href="languageHref">{{ t.language }}</a>
        <a class="small-download" :href="downloadUrl">{{ t.navDownload }} <span>↘</span></a>
      </div>
    </header>

    <main>
      <section class="hero" id="product">
        <div class="aurora" aria-hidden="true"></div>
        <div class="agent-field" aria-hidden="true">
          <i v-for="n in 36" :key="n" :style="{ '--i': n }"></i>
        </div>
        <div class="hero-copy">
          <p class="kicker"><span></span>{{ t.heroKicker }}</p>
          <h1><span>{{ t.heroLineOne }}</span><em>{{ t.heroLineTwo }}</em></h1>
          <p class="hero-text">{{ t.heroText }}</p>
          <div class="hero-actions">
            <a class="button solid" :href="downloadUrl">{{ t.heroPrimary }} <span>↓</span></a>
            <a class="button glass" href="#demo">{{ t.heroSecondary }} <span>▶</span></a>
          </div>
          <p class="hero-meta">{{ t.heroMeta }}</p>
        </div>

        <div class="hero-stage">
          <div class="stage-head">
            <span><i></i>{{ t.heroScreenLabel }}</span>
            <b>{{ t.heroScreenStatus }}</b>
          </div>
          <img :src="v2('simulation-network.png')" alt="AutoABM simulation workbench showing a live network model" width="2101" height="1159">
          <div class="stage-scan" aria-hidden="true"></div>
        </div>

        <div class="object-rail">
          <article v-for="object in t.objects" :key="object[0]">
            <span>{{ object[0] }}</span>
            <strong>{{ object[1] }}</strong>
            <small>{{ object[2] }}</small>
          </article>
        </div>
      </section>

      <section class="manifesto section-pad">
        <p class="kicker"><span></span>{{ t.statementEyebrow }}</p>
        <div class="manifesto-grid">
          <h2>{{ t.statementTitle }}</h2>
          <p>{{ t.statementText }}</p>
        </div>
      </section>

      <section class="film section-pad" id="demo">
        <div class="section-intro inverse">
          <div>
            <p class="kicker"><span></span>{{ t.demoEyebrow }}</p>
            <h2>{{ t.demoTitle }}</h2>
          </div>
          <p>{{ t.demoText }}</p>
        </div>
        <div class="film-frame">
          <video controls playsinline preload="metadata" :poster="v2('research-home.png')">
            <source :src="v2('autoabm-full-demo.mp4')" type="video/mp4">
            {{ t.videoFallback }}
          </video>
          <div class="film-chapters">
            <span v-for="chapter in t.demoChapters" :key="chapter[0]"><b>{{ chapter[0] }}</b>{{ chapter[1] }}</span>
          </div>
        </div>
      </section>

      <section class="product-story section-pad">
        <div class="section-intro">
          <div>
            <p class="kicker"><span></span>{{ t.productEyebrow }}</p>
            <h2>{{ t.productTitle }}</h2>
          </div>
          <p>{{ t.productText }}</p>
        </div>
        <div class="feature-ledger">
          <article v-for="(feature, index) in t.productFeatures" :key="feature[0]">
            <span>0{{ index + 1 }}</span>
            <p>{{ feature[0] }}</p>
            <h3>{{ feature[1] }}</h3>
            <small>{{ feature[2] }}</small>
          </article>
        </div>
      </section>

      <section class="showcase section-pad">
        <article class="showcase-row">
          <div class="showcase-copy">
            <p class="kicker"><span></span>{{ t.canvasLabel }}</p>
            <h2>{{ t.canvasTitle }}</h2>
            <p>{{ t.canvasText }}</p>
            <div class="live-data"><i></i> LIVE · 1,000 AGENTS · 2 FPS</div>
          </div>
          <figure class="screen dark-screen">
            <div class="screen-top"><span>RUN CANVAS</span><span>SEED 42</span></div>
            <img :src="v2('simulation-network.png')" alt="Live agent network and metric charts in AutoABM" width="2101" height="1159" loading="lazy">
          </figure>
        </article>
        <article class="showcase-row reverse">
          <div class="showcase-copy">
            <p class="kicker"><span></span>{{ t.experimentLabel }}</p>
            <h2>{{ t.experimentTitle }}</h2>
            <p>{{ t.experimentText }}</p>
            <div class="live-data"><i></i> BASELINE ↔ INTERVENTION</div>
          </div>
          <figure class="screen">
            <div class="screen-top"><span>EXPERIMENT UI</span><span>TRACE-LINKED</span></div>
            <img :src="v2('deep-experiment.png')" alt="Deep experiment comparison and charts in AutoABM" width="2121" height="1176" loading="lazy">
          </figure>
        </article>
      </section>

      <section class="research-loop section-pad" id="workflow">
        <div class="loop-head">
          <p class="kicker"><span></span>{{ t.workflowEyebrow }}</p>
          <h2>{{ t.workflowTitle }}</h2>
        </div>
        <div class="loop-grid">
          <article v-for="(step, index) in t.workflowSteps" :key="step[0]">
            <span>0{{ index + 1 }}</span>
            <div class="loop-mark"><i></i></div>
            <p>{{ step[0] }}</p>
            <h3>{{ step[1] }}</h3>
            <small>{{ step[2] }}</small>
          </article>
        </div>
      </section>

      <section class="emergence-quote">
        <div class="quote-orbit" aria-hidden="true"><i v-for="n in 18" :key="n"></i></div>
        <a :href="andersonUrl" class="quote-source">
          <span>1972 / SCIENCE</span>
          <strong>{{ t.quoteOriginal }}</strong>
          <small>{{ t.quoteBy }} ↗</small>
        </a>
        <div class="quote-copy">
          <h2>{{ t.quoteTranslation }}</h2>
          <p>{{ t.quoteText }}</p>
        </div>
      </section>

      <section class="evidence section-pad">
        <div class="section-intro inverse">
          <div>
            <p class="kicker"><span></span>{{ t.evidenceEyebrow }}</p>
            <h2>{{ t.evidenceTitle }}</h2>
          </div>
          <div>
            <p>{{ t.evidenceText }}</p>
            <ul><li v-for="point in t.evidencePoints" :key="point"><span>✓</span>{{ point }}</li></ul>
          </div>
        </div>
        <div class="evidence-visuals">
          <figure class="mechanism-window">
            <div class="window-label"><span>MECHANISM GRAPH</span><b>FIRING HEAT / TRACE</b></div>
            <img :src="v2('mechanism-graph.png')" alt="AutoABM mechanism graph with Trace firing heat" width="715" height="1164" loading="lazy">
          </figure>
          <figure class="trace-window">
            <div class="window-label"><span>CHECKED EXPLANATION</span><b>SUPPORTED / UNSUPPORTED</b></div>
            <img :src="v2('trace-grounding.png')" alt="Trace window, mechanism atlas, and checked explanation workflow" width="1557" height="676" loading="lazy">
          </figure>
        </div>
      </section>

      <section class="method section-pad" id="method">
        <div class="section-intro">
          <div>
            <p class="kicker"><span></span>{{ t.methodEyebrow }}</p>
            <h2>{{ t.methodTitle }}</h2>
          </div>
          <p>{{ t.methodText }}</p>
        </div>
        <figure class="method-figure">
          <div class="method-top"><span>AUTOABM / SYSTEM METHOD</span><span>VERSIONED · DETERMINISTIC · TRACE-BOUND</span></div>
          <img :src="v2('system-framework.png')" alt="AutoABM evidence-bound system framework" width="1717" height="696" loading="lazy">
        </figure>
        <div class="mode-grid">
          <article v-for="(mode, index) in t.modes" :key="mode[0]">
            <span>0{{ index + 1 }}</span>
            <p>{{ mode[0] }}</p>
            <h3>{{ mode[1] }}</h3>
            <small>{{ mode[2] }}</small>
          </article>
        </div>
      </section>

      <section class="final-cta" id="download">
        <div class="cta-network" aria-hidden="true"><i v-for="n in 28" :key="n" :style="{ '--i': n }"></i></div>
        <p class="kicker"><span></span>{{ t.downloadEyebrow }}</p>
        <h2>{{ t.downloadTitle }}</h2>
        <p>{{ t.downloadText }}</p>
        <div class="cta-actions">
          <a class="button light" :href="downloadUrl">{{ t.downloadButton }} <span>↓</span></a>
          <a class="button outline" :href="releaseUrl">{{ t.releaseButton }} <span>↗</span></a>
          <a class="button outline" :href="repositoryUrl">{{ t.sourceButton }} <span>↗</span></a>
        </div>
      </section>
    </main>

    <footer>
      <a class="wordmark" :href="homeHref"><img :src="asset('app-icon.png')" alt="" width="30" height="30"><span>AutoABM</span></a>
      <p>{{ t.footerText }}</p>
      <div><a :href="docsHref">Docs</a><a :href="repositoryUrl">GitHub</a><a :href="releaseUrl">Release</a></div>
      <small>© 2026 AutoABM · MIT License</small>
    </footer>
  </div>
</template>

<style scoped>
.site-shell {
  --black: #050706;
  --ink: #0d1210;
  --paper: #f4f5f0;
  --line: rgba(9, 20, 15, .14);
  --acid: #b6ff3b;
  --mint: #52e6c2;
  --muted: #657068;
  min-height: 100vh;
  color: var(--ink);
  background: var(--paper);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 16px;
  line-height: 1.5;
  overflow: hidden;
}
.site-shell * { box-sizing: border-box; }
.site-shell a { color: inherit; text-decoration: none; }
.topbar { position: absolute; z-index: 20; inset: 0 0 auto; height: 76px; padding: 0 max(28px, calc((100vw - 1440px) / 2)); display: flex; align-items: center; justify-content: space-between; color: white; border-bottom: 1px solid rgba(255,255,255,.13); }
.wordmark { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 720; letter-spacing: -.04em; }
.wordmark img { width: 30px; height: 30px; border-radius: 9px; }
.topbar nav { display: flex; gap: clamp(24px, 3vw, 48px); }
.topbar nav a, .language { color: rgba(255,255,255,.68); font-size: 12px; transition: color .2s ease; }
.topbar nav a:hover, .language:hover { color: white; }
.top-actions { display: flex; align-items: center; gap: 18px; }
.small-download { padding: 9px 14px; border: 1px solid rgba(255,255,255,.32); border-radius: 999px; color: white !important; font-size: 11px; font-weight: 700; }
.small-download span { margin-left: 8px; color: var(--acid); }
.hero { position: relative; min-height: 1230px; padding: 170px max(28px, calc((100vw - 1440px) / 2)) 0; overflow: hidden; color: white; background: var(--black); }
.hero::after { content: ""; position: absolute; inset: 0; opacity: .18; pointer-events: none; background-image: linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px); background-size: 76px 76px; mask-image: linear-gradient(to bottom, black, transparent 78%); }
.aurora { position: absolute; z-index: 0; left: 50%; top: -310px; width: 1100px; height: 820px; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(ellipse, rgba(59, 255, 185, .23), rgba(119, 255, 61, .08) 36%, transparent 68%); filter: blur(40px); }
.agent-field { position: absolute; z-index: 1; inset: 100px 0 auto; height: 620px; opacity: .64; }
.agent-field::before, .agent-field::after { content: ""; position: absolute; left: 50%; top: 42%; width: 700px; height: 380px; transform: translate(-50%, -50%) rotate(-7deg); border: 1px solid rgba(112,255,206,.13); border-radius: 50%; }
.agent-field::after { width: 940px; height: 520px; transform: translate(-50%, -50%) rotate(8deg); }
.agent-field i, .cta-network i { --angle: calc(var(--i) * 47deg); position: absolute; left: calc(50% + (var(--i) - 18) * 2.4%); top: calc(42% + sin(var(--angle)) * 40%); width: calc(2px + (var(--i) % 4) * 1px); height: calc(2px + (var(--i) % 4) * 1px); border-radius: 50%; background: var(--mint); box-shadow: 0 0 18px rgba(82,230,194,.7); }
.hero-copy { position: relative; z-index: 3; max-width: 1180px; margin: 0 auto; text-align: center; }
.kicker { display: flex; align-items: center; gap: 10px; margin: 0 0 22px; color: #168f73; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px !important; font-weight: 740; letter-spacing: .15em; text-transform: uppercase; }
.kicker span { width: 25px; height: 1px; flex: 0 0 25px; background: currentColor; }
.hero .kicker { justify-content: center; color: var(--mint); }
.hero h1 { margin: 0; font-size: clamp(70px, 9vw, 138px); line-height: .86; letter-spacing: -.075em; font-weight: 590; }
.hero h1 span, .hero h1 em { display: block; font-style: normal; }
.hero h1 em { color: transparent; background: linear-gradient(100deg, #fff 4%, #d0ff97 36%, #52e6c2 72%); -webkit-background-clip: text; background-clip: text; }
.locale-zh .hero h1 { line-height: 1.04; letter-spacing: -.06em; }
.locale-zh .hero h1 span, .locale-zh .hero h1 em { white-space: nowrap; }
.locale-zh .hero h1 em { margin-top: .04em; }
.hero-text { max-width: 760px; margin: 38px auto 0; color: rgba(255,255,255,.67); font-size: clamp(16px, 1.5vw, 21px); line-height: 1.75; }
.hero-actions, .cta-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 32px; }
.button { min-height: 49px; padding: 0 21px; display: inline-flex; align-items: center; justify-content: center; gap: 22px; border: 1px solid transparent; border-radius: 999px; font-size: 12px; font-weight: 740; transition: transform .2s ease, box-shadow .2s ease, background .2s ease; }
.button:hover { transform: translateY(-2px); }
.button.solid { color: #07100c !important; background: var(--acid); box-shadow: 0 12px 40px rgba(182,255,59,.17); }
.button.glass { color: white !important; border-color: rgba(255,255,255,.22); background: rgba(255,255,255,.06); backdrop-filter: blur(12px); }
.button.glass span { color: var(--mint); font-size: 9px; }
.hero-meta { margin: 15px 0 0; color: rgba(255,255,255,.37); font-size: 10px; letter-spacing: .04em; }
.hero-stage { position: relative; z-index: 4; width: min(1280px, 94vw); margin: 78px auto 0; padding: 10px; border: 1px solid rgba(255,255,255,.19); border-radius: 20px 20px 0 0; background: rgba(255,255,255,.06); box-shadow: 0 -10px 100px rgba(82,230,194,.08), 0 45px 100px rgba(0,0,0,.56); }
.stage-head, .screen-top, .method-top, .window-label { height: 38px; padding: 0 11px; display: flex; align-items: center; justify-content: space-between; color: rgba(255,255,255,.52); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 8px; letter-spacing: .13em; }
.stage-head span { display: flex; align-items: center; gap: 8px; }
.stage-head i, .live-data i { width: 7px; height: 7px; display: inline-block; border-radius: 50%; background: var(--acid); box-shadow: 0 0 13px rgba(182,255,59,.8); }
.stage-head b { color: var(--mint); font-weight: 500; }
.hero-stage img { display: block; width: 100%; height: auto; border-radius: 11px; }
.stage-scan { position: absolute; left: 11px; right: 11px; top: 48px; height: 1px; background: linear-gradient(90deg, transparent, rgba(182,255,59,.8), transparent); animation: scan 7s ease-in-out infinite alternate; }
.object-rail { position: relative; z-index: 4; width: min(1280px, 94vw); margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid rgba(255,255,255,.16); border-top: 0; }
.object-rail article { min-height: 104px; padding: 20px; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 15px; border-right: 1px solid rgba(255,255,255,.13); }
.object-rail article:last-child { border-right: 0; }
.object-rail span { grid-row: 1 / 3; color: var(--acid); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; }
.object-rail strong { color: white; font-size: 14px; font-weight: 580; }
.object-rail small { color: rgba(255,255,255,.39); font-size: 10px; }
.section-pad { padding: 140px max(28px, calc((100vw - 1280px) / 2)); }
.manifesto { background: #e9ece5; }
.manifesto-grid, .section-intro { display: grid; grid-template-columns: 1.25fr .75fr; gap: 90px; align-items: end; }
.manifesto h2, .section-intro h2, .loop-head h2, .showcase-copy h2, .quote-copy h2, .final-cta h2 { margin: 0; white-space: pre-line; font-size: clamp(48px, 5.7vw, 82px); line-height: 1.02; letter-spacing: -.06em; font-weight: 570; }
.manifesto-grid > p, .section-intro > p, .section-intro > div > p:not(.kicker) { margin: 0 0 7px; color: var(--muted); font-size: 16px; line-height: 1.8; }
.film { color: white; background: #090c0a; }
.section-intro { margin-bottom: 70px; }
.section-intro.inverse .kicker { color: var(--mint); }
.section-intro.inverse h2 { color: white; }
.section-intro.inverse > p, .section-intro.inverse > div > p:not(.kicker) { color: rgba(255,255,255,.55); }
.film-frame { overflow: hidden; border: 1px solid rgba(255,255,255,.16); border-radius: 18px; background: #000; box-shadow: 0 45px 100px rgba(0,0,0,.4); }
.film-frame video { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: black; }
.film-chapters { min-height: 72px; display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid rgba(255,255,255,.13); }
.film-chapters span { padding: 18px 16px; display: flex; flex-direction: column; gap: 6px; border-right: 1px solid rgba(255,255,255,.11); color: rgba(255,255,255,.5); font-size: 10px; }
.film-chapters span:last-child { border-right: 0; }
.film-chapters b { color: var(--acid); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 8px; letter-spacing: .1em; }
.product-story { background: var(--paper); }
.feature-ledger { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.feature-ledger article { min-height: 330px; padding: 24px 26px; display: flex; flex-direction: column; border-right: 1px solid var(--line); }
.feature-ledger article:last-child { border-right: 0; }
.feature-ledger article > span { color: #129477; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; }
.feature-ledger article > p { margin: auto 0 9px; color: #148d72; font-size: 9px; font-weight: 750; letter-spacing: .15em; text-transform: uppercase; }
.feature-ledger h3 { margin: 0 0 14px; font-size: 22px; letter-spacing: -.035em; }
.feature-ledger small { color: var(--muted); font-size: 12px; line-height: 1.7; }
.showcase { padding-top: 30px; background: var(--paper); }
.showcase-row { min-height: 730px; display: grid; grid-template-columns: .68fr 1.32fr; gap: 70px; align-items: center; border-top: 1px solid var(--line); }
.showcase-row.reverse { grid-template-columns: 1.32fr .68fr; }
.showcase-row.reverse .showcase-copy { order: 2; }
.showcase-copy h2 { font-size: clamp(40px, 4.5vw, 66px); }
.showcase-copy > p:not(.kicker) { margin: 24px 0 0; color: var(--muted); line-height: 1.8; }
.live-data { margin-top: 32px; color: #168c71; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; letter-spacing: .12em; }
.live-data i { margin-right: 9px; width: 6px; height: 6px; background: #22c49e; }
.screen { margin: 0; padding: 8px; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: white; box-shadow: 0 35px 80px rgba(15,30,22,.14); }
.screen-top { color: #68746d; }
.screen img { display: block; width: 145%; max-width: none; height: auto; border: 1px solid #e4e8e4; border-radius: 8px; transform: translateX(-22%); }
.screen.dark-screen { background: #101411; }
.screen.dark-screen .screen-top { color: rgba(255,255,255,.45); }
.research-loop { color: white; background: #101410; }
.loop-head { max-width: 850px; margin-bottom: 72px; }
.loop-head .kicker { color: var(--mint); }
.loop-grid { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid rgba(255,255,255,.16); }
.loop-grid article { min-height: 300px; padding: 22px 28px; display: flex; flex-direction: column; border-right: 1px solid rgba(255,255,255,.13); border-bottom: 1px solid rgba(255,255,255,.13); }
.loop-grid article:nth-child(3n) { border-right: 0; }
.loop-grid article > span { color: var(--acid); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; }
.loop-mark { position: relative; height: 52px; margin-top: 12px; }
.loop-mark::before { content: ""; position: absolute; left: 0; right: -28px; top: 25px; height: 1px; background: linear-gradient(90deg, rgba(82,230,194,.55), rgba(255,255,255,.08)); }
.loop-mark i { position: absolute; z-index: 1; left: 0; top: 21px; width: 9px; height: 9px; border: 2px solid #101410; border-radius: 50%; background: var(--mint); box-shadow: 0 0 0 1px var(--mint); }
.loop-grid article > p { margin: auto 0 9px; color: var(--mint); font-size: 9px; font-weight: 740; letter-spacing: .15em; }
.loop-grid h3 { margin: 0 0 12px; color: white; font-size: 22px; letter-spacing: -.035em; }
.loop-grid small { color: rgba(255,255,255,.45); font-size: 12px; line-height: 1.7; }
.emergence-quote { position: relative; min-height: 700px; padding: 120px max(28px, calc((100vw - 1280px) / 2)); display: grid; grid-template-columns: 1fr 1fr; gap: 90px; align-items: center; overflow: hidden; background: #d9ff90; }
.quote-orbit { position: absolute; left: 15%; top: 50%; width: 470px; height: 470px; transform: translateY(-50%); border: 1px solid rgba(10,35,21,.18); border-radius: 50%; }
.quote-orbit::before, .quote-orbit::after { content: ""; position: absolute; inset: 16%; border: 1px solid rgba(10,35,21,.13); border-radius: 50%; }
.quote-orbit::after { inset: 34%; }
.quote-orbit i { position: absolute; left: calc(50% + cos(calc(var(--n) * 20deg)) * 42%); top: calc(50% + sin(calc(var(--n) * 20deg)) * 42%); }
.quote-source { position: relative; z-index: 1; min-height: 360px; padding: 36px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid rgba(9,28,18,.3); background: rgba(217,255,144,.38); backdrop-filter: blur(8px); }
.quote-source > span, .quote-source small { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; letter-spacing: .13em; }
.quote-source strong { font-size: clamp(50px, 5vw, 76px); line-height: .9; letter-spacing: -.06em; }
.quote-copy { position: relative; z-index: 1; }
.quote-copy p { max-width: 540px; margin: 28px 0 0; color: #38513e; font-size: 17px; line-height: 1.8; }
.evidence { color: white; background: #050706; }
.section-intro ul { margin: 28px 0 0; padding: 0; display: grid; gap: 10px; list-style: none; }
.section-intro li { color: rgba(255,255,255,.68); font-size: 12px; }
.section-intro li span { margin-right: 9px; color: var(--acid); }
.evidence-visuals { display: grid; grid-template-columns: .42fr 1.58fr; gap: 16px; align-items: start; }
.evidence-visuals figure { margin: 0; padding: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,.17); border-radius: 15px; background: rgba(255,255,255,.05); }
.window-label { color: rgba(255,255,255,.5); }
.window-label b { color: var(--mint); font-weight: 500; }
.evidence-visuals img { display: block; width: 100%; height: auto; border-radius: 8px; }
.mechanism-window { max-height: 650px; }
.mechanism-window img { transform: translateY(-4%); }
.trace-window { align-self: center; }
.method { background: #eef0ea; }
.method-figure { margin: 0; padding: 8px; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: white; box-shadow: 0 28px 70px rgba(20,42,29,.1); }
.method-top { color: #66736b; }
.method-figure img { display: block; width: 100%; height: auto; border-radius: 8px; }
.mode-grid { margin-top: 18px; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.mode-grid article { min-height: 250px; padding: 23px 26px; display: flex; flex-direction: column; border-right: 1px solid var(--line); }
.mode-grid article:last-child { border-right: 0; }
.mode-grid article > span { color: #168d72; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; }
.mode-grid article > p { margin: auto 0 8px; color: #168d72; font-size: 9px; font-weight: 740; letter-spacing: .13em; text-transform: uppercase; }
.mode-grid h3 { margin: 0 0 10px; font-size: 22px; }
.mode-grid small { color: var(--muted); font-size: 12px; line-height: 1.7; }
.final-cta { position: relative; min-height: 760px; padding: 140px 28px; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; color: white; text-align: center; background: #050706; }
.final-cta::before { content: ""; position: absolute; left: 50%; bottom: -300px; width: 900px; height: 700px; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle, rgba(82,230,194,.36), transparent 65%); filter: blur(40px); }
.cta-network { position: absolute; inset: 0; opacity: .45; }
.cta-network i { left: calc(8% + (var(--i) * 3.3%)); top: calc(20% + (var(--i) % 7) * 9%); }
.final-cta > *:not(.cta-network) { position: relative; z-index: 1; }
.final-cta .kicker { color: var(--mint); }
.final-cta h2 { max-width: 1000px; font-size: clamp(60px, 7.5vw, 112px); }
.final-cta > p:not(.kicker) { max-width: 650px; margin: 28px 0 0; color: rgba(255,255,255,.55); font-size: 16px; }
.button.light { color: #07100c !important; background: white; }
.button.outline { color: white !important; border-color: rgba(255,255,255,.25); background: rgba(255,255,255,.04); }
footer { min-height: 170px; padding: 38px max(28px, calc((100vw - 1280px) / 2)); display: grid; grid-template-columns: 1fr 1.5fr auto; align-items: center; gap: 24px; color: #59665e; background: #eef0ea; }
footer p { margin: 0; font-size: 11px; }
footer > div { display: flex; gap: 22px; }
footer > div a { font-size: 11px; }
footer small { grid-column: 1 / -1; padding-top: 20px; border-top: 1px solid var(--line); font-size: 9px; }
@keyframes scan { from { top: 48px; opacity: .15; } to { top: calc(100% - 14px); opacity: .75; } }
@media (max-width: 980px) {
  .topbar { padding: 0 20px; }
  .topbar nav { display: none; }
  .hero { min-height: 980px; padding: 140px 20px 0; }
  .object-rail { grid-template-columns: 1fr 1fr; }
  .object-rail article:nth-child(2) { border-right: 0; }
  .object-rail article:nth-child(-n+2) { border-bottom: 1px solid rgba(255,255,255,.13); }
  .section-pad { padding: 100px 20px; }
  .manifesto-grid, .section-intro, .emergence-quote { grid-template-columns: 1fr; gap: 34px; }
  .feature-ledger { grid-template-columns: 1fr 1fr; }
  .feature-ledger article:nth-child(2) { border-right: 0; }
  .feature-ledger article:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
  .showcase-row, .showcase-row.reverse { min-height: 0; padding: 70px 0; grid-template-columns: 1fr; gap: 40px; }
  .showcase-row.reverse .showcase-copy { order: 0; }
  .loop-grid { grid-template-columns: 1fr 1fr; }
  .loop-grid article:nth-child(3n) { border-right: 1px solid rgba(255,255,255,.13); }
  .loop-grid article:nth-child(2n) { border-right: 0; }
  .evidence-visuals { grid-template-columns: 1fr; }
  .mechanism-window { display: none; }
  .mode-grid { grid-template-columns: 1fr; }
  .mode-grid article { border-right: 0; border-bottom: 1px solid var(--line); }
  .film-chapters { grid-template-columns: repeat(3, 1fr); }
  .film-chapters span:nth-child(3) { border-right: 0; }
  .film-chapters span:nth-child(-n+3) { border-bottom: 1px solid rgba(255,255,255,.11); }
  footer { grid-template-columns: 1fr auto; }
  footer p { display: none; }
}
@media (max-width: 560px) {
  .language { font-size: 11px; }
  .small-download { width: 36px; height: 36px; padding: 0; display: grid; place-items: center; font-size: 0; }
  .small-download span { margin: 0; font-size: 12px; }
  .hero { min-height: 890px; padding-top: 125px; }
  .hero h1 { font-size: 46px; line-height: .98; }
  .locale-zh .hero h1 { font-size: 46px; line-height: 1.08; letter-spacing: -.055em; }
  .hero-text { font-size: 15px; }
  .hero-actions .button { width: 100%; }
  .hero-stage { width: 125%; margin-left: -12.5%; border-radius: 12px 12px 0 0; }
  .stage-head b { display: none; }
  .object-rail { width: 100%; grid-template-columns: 1fr; }
  .object-rail article { min-height: 76px; border-right: 0; border-bottom: 1px solid rgba(255,255,255,.13); }
  .manifesto h2, .section-intro h2, .loop-head h2, .showcase-copy h2, .quote-copy h2 { font-size: 42px; }
  .feature-ledger { grid-template-columns: 1fr; }
  .feature-ledger article { min-height: 260px; border-right: 0; border-bottom: 1px solid var(--line); }
  .film-chapters { grid-template-columns: 1fr 1fr; }
  .film-chapters span, .film-chapters span:nth-child(3) { border-right: 1px solid rgba(255,255,255,.11); border-bottom: 1px solid rgba(255,255,255,.11); }
  .film-chapters span:nth-child(2n) { border-right: 0; }
  .screen img { width: 190%; transform: translateX(-37%); }
  .loop-grid { grid-template-columns: 1fr; }
  .loop-grid article, .loop-grid article:nth-child(3n) { min-height: 260px; border-right: 0; }
  .emergence-quote { min-height: 850px; padding: 90px 20px; }
  .quote-source { min-height: 300px; }
  .quote-source strong { font-size: 48px; }
  .trace-window img { width: 170%; max-width: none; transform: translateX(-36%); }
  .final-cta { min-height: 700px; padding: 90px 20px; }
  .final-cta h2 { font-size: 58px; }
  .cta-actions .button { width: 100%; }
  footer { padding: 35px 20px; grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .site-shell *, .site-shell *::before, .site-shell *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
</style>
