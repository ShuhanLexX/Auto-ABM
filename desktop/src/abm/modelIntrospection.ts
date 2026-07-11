import type { Locale } from '../i18n'
import { useSettingsStore } from '../stores/settingsStore'
import type { AbmSimulation, ModelConfig } from './types'
import { localizeMechanismDetail, localizeMechanismText, localizeParameterText } from './modelDisplayText'

export type RecordLike = Record<string, unknown>

export interface ParameterSpec {
  id: string
  label: string
  value: unknown
  min?: number
  max?: number
  step?: number
  description?: string
  /** true = declared in config.parameters (named, typed); false = ad-hoc interface param. */
  declared?: boolean
}

export interface MechanismNode {
  id: string
  label: string
  trigger?: string
  effect?: string
  phase?: string
  code?: string
}

export function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readRecords(value: unknown): RecordLike[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

export function readString(record: RecordLike, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : null
}

export function readNumber(record: RecordLike, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readModelId(config: ModelConfig, fallback = '未命名模型'): string {
  return readString(config, 'id') ?? readString(config, 'model_id') ?? readString(config, 'modelId') ?? readString(config, 'name') ?? fallback
}

export function readModelVersion(simulation: AbmSimulation | null): string {
  return simulation?.modelVersion ||
    readString(simulation?.config ?? {}, 'model_version') ||
    readString(simulation?.config ?? {}, 'modelVersion') ||
    readString(simulation?.config ?? {}, 'version') ||
    '未绑定'
}

export function readAgentCounts(config: ModelConfig): Record<string, number> {
  const initialization = isRecord(config.initialization) ? config.initialization : {}
  const raw = initialization.agentCounts ?? initialization.agent_counts
  if (!isRecord(raw)) return {}
  const counts: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) counts[key] = value
  }
  return counts
}

function currentLocale(locale?: Locale): Locale {
  return locale ?? useSettingsStore.getState().locale
}

export function readParameterSpecs(simulation: AbmSimulation | null, locale?: Locale): ParameterSpec[] {
  if (!simulation) return []
  const displayLocale = currentLocale(locale)
  const params = simulation.interface.params ?? {}
  const fromConfig = readRecords(simulation.config.parameters).map((parameter) => {
    const id = readString(parameter, 'id') ?? readString(parameter, 'name') ?? 'parameter'
    const fallbackLabel = readString(parameter, 'label') ?? readString(parameter, 'name') ?? id
    const display = localizeParameterText(
      id,
      fallbackLabel,
      readString(parameter, 'description') ?? undefined,
      displayLocale,
    )
    return {
      id,
      label: display.label,
      value: params[id] ?? parameter.default ?? parameter.value ?? '',
      min: readNumber(parameter, 'min'),
      max: readNumber(parameter, 'max'),
      step: readNumber(parameter, 'step'),
      description: display.description,
      declared: true,
    }
  })
  const declared = new Set(fromConfig.map((parameter) => parameter.id))
  // Ad-hoc interface params (e.g. leftover proposal keyParams) are not part of
  // the model's declared parameter set — the kernel behavior never reads them.
  const fromInterface = Object.entries(params)
    .filter(([key]) => !declared.has(key))
    .map(([key, value]) => ({ id: key, label: key, value, declared: false }))
  return [...fromConfig, ...fromInterface]
}

export function readMechanismNodes(config: ModelConfig, locale?: Locale): MechanismNode[] {
  const displayLocale = currentLocale(locale)
  return readRecords(config.mechanisms).map((mechanism, index) => {
    const id = readString(mechanism, 'id') ?? readString(mechanism, 'name') ?? `mechanism-${index + 1}`
    const fallbackLabel = readString(mechanism, 'name') ?? id
    return {
      id,
      label: localizeMechanismText(id, fallbackLabel, displayLocale),
      trigger: localizeMechanismDetail(id, 'trigger', readString(mechanism, 'trigger') ?? undefined, displayLocale),
      effect: localizeMechanismDetail(id, 'effect', readString(mechanism, 'effect') ?? undefined, displayLocale),
      phase: readString(mechanism, 'phase') ?? undefined,
      code: readString(mechanism, 'code') ?? readString(mechanism, 'source') ?? undefined,
    }
  })
}

export function formatAgentCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts)
  if (entries.length === 0) return '等待初始化规模'
  return entries.map(([key, value]) => `${key} ${value.toLocaleString()}`).join(' · ')
}
