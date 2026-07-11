import {
  FlaskConical,
  GitFork,
  Network,
  Package,
  Search,
  SlidersHorizontal,
  FileText,
} from 'lucide-react'
import type { ComposerQuickActionItem } from '../components/ui/moon-composer'
import type { TranslationKey } from '../i18n'
import type { AbmMode } from '../abm/stores/abmStore'

type Translate = (key: TranslationKey) => string

const iconClass = 'h-4 w-4'

// ABM research entry points. Ids are kept stable (they key the i18n strings and
// the prompt map); only the labels, prompts, and icons carry ABM meaning now.
export function buildComposerQuickActions(t: Translate, mode: AbmMode = 'research'): ComposerQuickActionItem[] {
  if (mode === 'dialogue') {
    return [
      { id: 'explain-mechanism', icon: <Network className={iconClass} />, label: '解释机制' },
      { id: 'explain-agents', icon: <GitFork className={iconClass} />, label: '解释智能体' },
      { id: 'explain-interval', icon: <Search className={iconClass} />, label: '解释曲线区间' },
      { id: 'odd-review', icon: <FileText className={iconClass} />, label: '阅读 ODD' },
    ]
  }

  if (mode === 'autonomous') {
    return [
      { id: 'auto-explore', icon: <Search className={iconClass} />, label: '自主探索问题' },
      { id: 'auto-model', icon: <FlaskConical className={iconClass} />, label: '自动建模验证' },
      { id: 'auto-experiment', icon: <SlidersHorizontal className={iconClass} />, label: '自动实验计划' },
      { id: 'auto-synthesis', icon: <FileText className={iconClass} />, label: '形成研究结论' },
    ]
  }

  return [
    { id: 'code', icon: <FlaskConical className={iconClass} />, label: t('empty.quick.code') },
    { id: 'app', icon: <GitFork className={iconClass} />, label: t('empty.quick.app') },
    { id: 'components', icon: <SlidersHorizontal className={iconClass} />, label: t('empty.quick.components') },
    { id: 'theme', icon: <Network className={iconClass} />, label: t('empty.quick.theme') },
    { id: 'landing', icon: <Search className={iconClass} />, label: t('empty.quick.landing') },
    { id: 'docs', icon: <FileText className={iconClass} />, label: t('empty.quick.docs') },
    { id: 'assets', icon: <Package className={iconClass} />, label: t('empty.quick.assets') },
  ]
}

export function composerQuickActionPrompt(id: string, t: Translate, mode: AbmMode = 'research'): string {
  if (mode === 'dialogue') {
    const prompts: Record<string, string> = {
      'explain-mechanism': '请解释当前仿真的核心机制、关键假设，以及哪些机制最可能驱动宏观结果。',
      'explain-agents': '请基于当前仿真的智能体状态，解释不同类型/状态智能体的行为差异和可能影响。',
      'explain-interval': '请解释我在结果曲线中选中的区间：发生了什么、哪些变量变化最大、可能对应哪些微观机制。',
      'odd-review': '请用 ODD 协议结构帮我阅读当前模型，并指出哪些部分还需要补充。',
    }
    return prompts[id] ?? ''
  }

  if (mode === 'autonomous') {
    const prompts: Record<string, string> = {
      'auto-explore': '请围绕这个研究问题自主完成 ABM 探索：先澄清必要信息，再提出模型、采纳或编辑、验证、运行基线、生成深度实验视图，最后给出证据化研究结论。研究问题是：',
      'auto-model': '请自主设计并验证一个适合该问题的 ABM 模型，要求说明机制、空间/网络表示、关键参数、ODD 摘要和可观察指标。研究问题是：',
      'auto-experiment': '请基于当前仿真自主规划扩展实验，包括参数敏感性、随机种子合奏、干预/反事实和鲁棒性检查，并生成需要的深度实验视图。',
      'auto-synthesis': '请检查当前仿真的模型、运行结果、Trace 和实验视图，形成一份有证据引用的 ABM 研究结论。',
    }
    return prompts[id] ?? ''
  }

  const prompts: Record<string, string> = {
    code: t('empty.quick.codePrompt'),
    app: t('empty.quick.appPrompt'),
    components: t('empty.quick.componentsPrompt'),
    theme: t('empty.quick.themePrompt'),
    landing: t('empty.quick.landingPrompt'),
    docs: t('empty.quick.docsPrompt'),
    assets: t('empty.quick.assetsPrompt'),
  }
  return prompts[id] ?? ''
}
