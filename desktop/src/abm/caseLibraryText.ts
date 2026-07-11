import type { Locale } from '../i18n'
import type { AbmCaseCategory, AbmCaseStudy } from './researchAssets'

export interface CaseStudyDisplay {
  name: string
  subtitle: string
  category: string
  domain: string
  canvas: string
  scale: string
  difficulty: string
  tags: string[]
  summary: string
  mechanism: string
  metrics: string[]
  experiments: string[]
}

type EnglishCase = Partial<Omit<CaseStudyDisplay, 'category' | 'canvas' | 'difficulty' | 'metrics'>>

const CATEGORY_EN: Record<AbmCaseCategory, string> = {
  '空间自组织': 'Spatial Self-Organization',
  '网络传播与扩散': 'Network Spread & Diffusion',
  '意见与极化': 'Opinion & Polarization',
  '合作与制度': 'Cooperation & Institutions',
  '阈值与集体行动': 'Thresholds & Collective Action',
}

const CANVAS_EN: Record<AbmCaseStudy['canvas'], string> = {
  '网格斑块': 'Patch Grid',
  '社会网络': 'Social Network',
  '移动个体': 'Moving Agents',
  '混合场景': 'Hybrid Scene',
}

const DIFFICULTY_EN: Record<AbmCaseStudy['difficulty'], string> = {
  '入门': 'Starter',
  '进阶': 'Intermediate',
  '研究级': 'Research',
}

const CASE_EN: Record<string, EnglishCase> = {
  'schelling-urban-segregation': {
    name: 'Schelling Urban Segregation',
    subtitle: 'How mild neighbor preferences amplify into spatial segregation',
    domain: 'Urban Mobility',
    tags: ['classic', 'spatial emergence', 'thresholds'],
    summary: 'Two resident groups and empty cells reveal how weak micro-preferences accumulate into macro segregation.',
    mechanism: 'Agents compare nearby same-type share with a tolerance threshold, then move to an acceptable vacancy.',
    experiments: ['Tolerance sweep', 'Vacancy comparison', 'Multi-seed robustness'],
  },
  'wildfire-fuel-front': {
    name: 'Wildfire Fuel-Front Spread',
    subtitle: 'Wind, fuel density, and spotting drive spatial fire spread',
    domain: 'Disaster & Environment',
    tags: ['wildfire', 'spatial spread', 'intervention'],
    summary: 'Simulates a fire front advancing through fuel patches, burned scars, and asymmetric wind effects.',
    mechanism: 'Fuel cells ignite from nearby fire, wind weighting, and spotting probability.',
    experiments: ['Fuel-density sensitivity', 'Wind intervention', 'Firebreak counterfactual'],
  },
  'rumor-platform-moderation': {
    name: 'Platform Rumor Moderation',
    subtitle: 'Forwarding, forgetting, and intervention windows on a social graph',
    domain: 'Public Opinion',
    tags: ['rumor', 'intervention', 'network spread'],
    summary: 'Models users as network nodes to compare early debunking, throttling, and delayed moderation.',
    mechanism: 'Contagion-like contact spread combines with recovery or forgetting; interventions shift transmission or recovery rates.',
    experiments: ['Intervention timing', 'Transmission sweep', 'Seed-node robustness'],
  },
  'opinion-polarization-confidence': {
    name: 'Bounded-Confidence Polarization',
    subtitle: 'Selective interaction can create consensus or fragmentation',
    domain: 'Opinion Dynamics',
    tags: ['polarization', 'continuous opinion', 'network structure'],
    summary: 'Continuous opinions move toward neighbors within a confidence bound; narrow bounds form multiple opinion clusters.',
    mechanism: 'Agents update only from neighbors whose opinions are close enough, using a learning rate.',
    experiments: ['Confidence sweep', 'Network-density comparison', 'Bridge-node intervention'],
  },
  'public-goods-cooperation': {
    name: 'Public-Goods Cooperation',
    subtitle: 'Multiplier, imitation, and cooperation collapse',
    domain: 'Collective Action',
    tags: ['game theory', 'cooperation', 'institutions'],
    summary: 'Players cooperate or defect on local networks; payoff differences drive strategy imitation.',
    mechanism: 'Cooperation pays a cost into a multiplied pool, then agents copy neighbors by payoff difference and noise.',
    experiments: ['Punishment threshold sweep', 'Network comparison', 'Institutional shock'],
  },
  'innovation-adoption-bass': {
    name: 'Innovation Adoption Curve',
    subtitle: 'Advertising and neighbor imitation create an S-curve',
    domain: 'Innovation & Markets',
    tags: ['diffusion', 'adoption', 'market'],
    summary: 'Combines external advertising and social imitation to inspect adoption curves, peaks, and saturation speed.',
    mechanism: 'Non-adopters respond to external adoption probability and the share of adopted neighbors.',
    experiments: ['External influence sweep', 'Influencer seeding', 'Network-density comparison'],
  },
  'threshold-cascade-mobilization': {
    name: 'Threshold Cascade Mobilization',
    subtitle: 'How small active minorities trigger network-level cascades',
    domain: 'Social Movements',
    tags: ['complex contagion', 'thresholds', 'cascade'],
    summary: 'Agents participate only after enough neighbors are active, exposing mobilization tipping points.',
    mechanism: 'Heterogeneous thresholds and network position determine whether seed activity becomes a global cascade.',
    experiments: ['Seed-position counterfactual', 'Threshold-distribution sweep', 'Edge-removal intervention'],
  },
  'sir-campus-contact': {
    name: 'Campus Contact Spread',
    subtitle: 'Classes, dorms, and events shape spatial contact risk',
    domain: 'Public Health',
    tags: ['SIR', 'spatial contact', 'policy'],
    summary: 'A spatial infection model for comparing spread, recovery, and isolation policies.',
    mechanism: 'Infectious agents transmit locally; recovered agents leave the chain, and isolation reduces local risk.',
    experiments: ['Isolation strength sweep', 'Initial infection sites', 'Time-window intervention'],
  },
  'housing-gentrification': {
    name: 'Neighborhood Gentrification Mobility',
    subtitle: 'Rent pressure, neighborhood preference, and spatial replacement',
    domain: 'Urban Sociology',
    tags: ['mobility', 'inequality', 'spatial structure'],
    summary: 'Approximates neighborhood replacement with resident types and relocation thresholds.',
    mechanism: 'Residents move according to neighborhood composition and affordability thresholds, producing replacement bands.',
    experiments: ['Housing subsidy counterfactual', 'Threshold heterogeneity', 'Vacancy-rate shock'],
  },
  'evacuation-information': {
    name: 'Evacuation Information Diffusion',
    subtitle: 'Risk perception, neighbor alerts, and route congestion',
    domain: 'Emergency Management',
    tags: ['evacuation', 'risk spread', 'intervention'],
    summary: 'Treats evacuation intent as threshold activation to compare broadcasts, neighbor alerts, and critical-node warnings.',
    mechanism: 'Agents act when the share of risk alerts exceeds their threshold; network position shapes total response.',
    experiments: ['Broadcast timing', 'Critical-node alerts', 'Threshold uncertainty'],
  },
  'market-herding': {
    name: 'Market Herding',
    subtitle: 'Local imitation and external signals create irrational swings',
    domain: 'Economic Behavior',
    tags: ['market', 'herding', 'continuous opinion'],
    summary: 'Models investment leaning as a continuous opinion under neighbor influence and an external signal.',
    mechanism: 'Traders are pulled by trusted neighbors and weakly by outside news.',
    experiments: ['Signal-strength sweep', 'Network concentration', 'Shock recovery'],
  },
  'resource-commons-fishery': {
    name: 'Commons Fishery Governance',
    subtitle: 'Cooperative harvesting, sanctions, and payoff stability',
    domain: 'Resource Governance',
    tags: ['commons', 'institutions', 'robustness'],
    summary: 'Approximates common-pool governance with a public-goods game and compares sanctions and multipliers.',
    mechanism: 'Agents copy neighbor strategies by payoff; sanctions alter cooperation incentives.',
    experiments: ['Institution strength sweep', 'Multi-seed ensemble', 'Payoff shock'],
  },
  'migration-chain-network': {
    name: 'Migration Chain Diffusion',
    subtitle: 'How family and friend networks lower migration thresholds',
    domain: 'Population Migration',
    tags: ['migration', 'network externality', 'diffusion'],
    summary: 'Represents migration as adoption: more migrated contacts increase the chance of moving.',
    mechanism: 'External opportunity signals and adopted neighbors jointly raise adoption probability.',
    experiments: ['Opportunity-signal sweep', 'Initial migrant placement', 'Network-fragment counterfactual'],
  },
  'school-norm-diffusion': {
    name: 'School Norm Diffusion',
    subtitle: 'Peer pressure and norm adoption thresholds',
    domain: 'Education Sociology',
    tags: ['norms', 'peer influence', 'thresholds'],
    summary: 'Students adopt a learning or behavior norm after enough peers have adopted it.',
    mechanism: 'Individual thresholds and community structure determine whether the norm crosses groups.',
    experiments: ['Class bridge intervention', 'Threshold heterogeneity', 'Key-student seeding'],
  },
  'traffic-route-choice': {
    name: 'Traffic Route-Choice Congestion',
    subtitle: 'Learning and local information shift congestion patterns',
    domain: 'Transportation',
    tags: ['traffic', 'choice', 'feedback'],
    summary: 'Approximates commuter route choice and observes how local payoff feedback relocates congestion.',
    mechanism: 'Commuters copy route strategies from neighbors or past payoff, changing aggregate congestion.',
    experiments: ['Information strategy', 'Toll counterfactual', 'Network-stratification intervention'],
  },
  'land-use-firebreak-policy': {
    name: 'Land-Use Firebreak Policy',
    subtitle: 'Policy boundary effects in heterogeneous fuel landscapes',
    domain: 'Ecological Governance',
    tags: ['land use', 'firebreak', 'spatial policy'],
    summary: 'Uses wildfire spread to evaluate how fuel layouts and firebreak width change burned area.',
    mechanism: 'Fuel heterogeneity changes front connectivity; firebreaks lower cross-region ignition.',
    experiments: ['Firebreak-width sweep', 'Fuel-patch heterogeneity', 'Wind counterfactual'],
  },
  'forest-percolation-critical': {
    name: 'Forest-Fire Percolation Threshold',
    subtitle: 'Fuel density creates phase transitions near a critical point',
    domain: 'Complex Systems',
    tags: ['percolation', 'phase transition', 'criticality'],
    summary: 'A classic forest-fire percolation case where small fuel-density changes flip local fires into global burn-through.',
    mechanism: 'Ignition spreads through connected fuel clusters; above the threshold, a spanning cluster appears.',
    experiments: ['Critical density sweep', 'Finite-size scaling', 'Ignition-location robustness'],
  },
  'vaccination-hesitancy-grid': {
    name: 'Vaccination Hesitancy and Herd Immunity',
    subtitle: 'Spatial vaccination gaps leave transmission corridors',
    domain: 'Public Health',
    tags: ['vaccination', 'herd immunity', 'spatial heterogeneity'],
    summary: 'Compares uniform vaccination with clustered hesitancy to show how immunity gaps sustain local outbreaks.',
    mechanism: 'Susceptible agents are infected by local pressure; vaccinated agents are removed from the chain.',
    experiments: ['Vaccination-rate sweep', 'Spatial clustering comparison', 'Initial infection robustness'],
  },
  'epidemic-superspreader-network': {
    name: 'Superspreader Network Outbreak',
    subtitle: 'Uneven degree distributions amplify early spread',
    domain: 'Public Health',
    tags: ['superspreaders', 'scale-free', 'contact network'],
    summary: 'Studies how a few high-degree nodes dominate outbreak peak size and arrival time.',
    mechanism: 'Contact spread and recovery occur on a heterogeneous network; hubs infect many neighbors early.',
    experiments: ['Hub protection', 'Transmission sweep', 'Early intervention timing'],
  },
  'viral-marketing-launch': {
    name: 'Viral Marketing Launch',
    subtitle: 'Seeding and word of mouth amplify adoption',
    domain: 'Marketing',
    tags: ['word of mouth', 'seeding', 'growth curve'],
    summary: 'Compares broad advertising with key-node seeding for adoption speed and final penetration.',
    mechanism: 'Non-adopters respond to advertising and adopted-neighbor share; seed position changes the early slope.',
    experiments: ['Seed budget allocation', 'External influence sweep', 'Community-structure comparison'],
  },
  'media-echo-chamber': {
    name: 'Media Echo Chambers and Polarization',
    subtitle: 'Homophily and bounded confidence reinforce each other',
    domain: 'Political Communication',
    tags: ['echo chamber', 'polarization', 'homophily'],
    summary: 'Explores how homophilous networks and narrow confidence bounds lock opinions into separated clusters.',
    mechanism: 'Agents interact only with close opinions; homophily weakens cross-cluster bridges.',
    experiments: ['Confidence sweep', 'Bridge-node injection', 'Homophily comparison'],
  },
  'climate-treaty-cooperation': {
    name: 'Climate Treaty Cooperation',
    subtitle: 'Multiplier, punishment, and free-rider tension',
    domain: 'Global Governance',
    tags: ['public goods', 'climate governance', 'sanctions'],
    summary: 'Frames emissions reduction as public-goods contribution to test whether sanctions sustain cooperation.',
    mechanism: 'Contributions are multiplied and shared; agents imitate by payoff while sanctions reshape incentives.',
    experiments: ['Punishment-strength sweep', 'Multiplier comparison', 'Institutional shock'],
  },
  'protest-riot-threshold': {
    name: 'Protest and Riot Thresholds',
    subtitle: 'Mobilization tipping points under Granovetter thresholds',
    domain: 'Social Movements',
    tags: ['Granovetter', 'critical mass', 'complex contagion'],
    summary: 'A classic threshold model where initial active mass determines whether mobilization dies or spreads.',
    mechanism: 'Agents participate when active-neighbor share exceeds their threshold; threshold variance controls runaway cascades.',
    experiments: ['Threshold variance sweep', 'Initial activation size', 'Network density comparison'],
  },
  'bank-run-panic': {
    name: 'Bank-Run Panic Cascade',
    subtitle: 'Confidence thresholds and withdrawal cascades',
    domain: 'Financial Stability',
    tags: ['bank run', 'confidence', 'cascade'],
    summary: 'Models withdrawals as threshold activation: panic spreads when too many neighbors withdraw.',
    mechanism: 'Depositors withdraw after observed withdrawals exceed their confidence threshold, reinforcing panic on the network.',
    experiments: ['Confidence-threshold sweep', 'Key-depositor intervention', 'Capital injection timing'],
  },
}

export const CASE_LIBRARY_UI_EN = {
  title: 'ABM Case Library',
  intro: 'Add a case to a research question. It will appear under Simulation Management.',
  importTo: 'Import to',
  newProject: 'New case research question',
  searchPlaceholder: 'Search models, domains, mechanisms...',
  all: 'All',
  empty: 'No matching cases. Try another keyword or category.',
  details: 'Case Details',
  mechanism: 'Modeling Mechanism',
  experiments: 'Recommended Experiments',
  canvas: 'Canvas',
  scale: 'Scale',
  template: 'Model family',
  metrics: 'Metrics',
  add: 'Add',
  open: 'Open',
  addToProject: 'Add to Project',
  addAndOpen: 'Add and Open',
  addedSuffix: 'was added to Simulation Management.',
  importError: 'Failed to import case',
  defaultProjectName: 'Case Research Question',
  defaultProjectQuestion: 'Imported from case library',
  importedNote: 'Imported cases stay editable in Simulation Management.',
  totalCount: '{total} cases',
  showing: 'Showing {from}-{to} of {total}',
} as const

export const CASE_LIBRARY_UI_ZH: Record<keyof typeof CASE_LIBRARY_UI_EN, string> = {
  title: 'ABM 经典案例库',
  intro: '选择案例后加入研究问题，案例会进入该项目的仿真管理。',
  importTo: '导入到',
  newProject: '新建案例研究问题',
  searchPlaceholder: '搜索模型、领域、机制...',
  all: '全部',
  empty: '没有匹配的案例，换个关键词或类别试试。',
  details: '案例详情',
  mechanism: '建模机制',
  experiments: '推荐实验',
  canvas: '画布',
  scale: '规模',
  template: '模型族',
  metrics: '指标',
  add: '加入',
  open: '打开',
  addToProject: '加入项目',
  addAndOpen: '加入并打开',
  addedSuffix: '已导入仿真管理。',
  importError: '导入案例失败',
  defaultProjectName: '案例研究问题',
  defaultProjectQuestion: '从案例库导入',
  importedNote: '导入后绑定当前研究问题，可在仿真管理继续编辑版本。',
  totalCount: '共 {total} 个案例',
  showing: '显示 {from}-{to} / 共 {total}',
}

export function isChineseCaseLocale(locale: Locale): boolean {
  return locale === 'zh' || locale === 'zh-TW'
}

export function getCaseLibraryUi(locale: Locale): Record<keyof typeof CASE_LIBRARY_UI_EN, string> {
  return isChineseCaseLocale(locale) ? CASE_LIBRARY_UI_ZH : CASE_LIBRARY_UI_EN
}

export function getCaseCategoryLabel(category: AbmCaseCategory, locale: Locale): string {
  return isChineseCaseLocale(locale) ? category : CATEGORY_EN[category]
}

export function getCaseStudyDisplay(study: AbmCaseStudy, locale: Locale): CaseStudyDisplay {
  if (isChineseCaseLocale(locale)) return study
  const english = CASE_EN[study.id] ?? {}
  return {
    ...study,
    ...english,
    category: CATEGORY_EN[study.category],
    canvas: CANVAS_EN[study.canvas],
    difficulty: DIFFICULTY_EN[study.difficulty],
  }
}
