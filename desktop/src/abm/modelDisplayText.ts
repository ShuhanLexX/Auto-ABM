import type { Locale } from '../i18n'

interface DisplayEntry {
  label: string
  description?: string
}

interface MechanismEntry extends DisplayEntry {
  trigger?: string
  effect?: string
}

const PARAMETER_EN: Record<string, DisplayEntry> = {
  fuel_density: {
    label: 'Tree Density',
    description: 'Share of patches initialized with burnable trees; controls whether the fire front connects.',
  },
  rock_density: {
    label: 'Rock Density',
    description: 'Share of patches initialized as non-burnable rock barriers.',
  },
  spread_probability: {
    label: 'Neighbor Ignition Probability',
    description: 'Base probability that a burning neighbor ignites a fuel patch.',
  },
  wind_bias: {
    label: 'Wind Bias',
    description: 'Extra ignition probability when fire spreads from left to right.',
  },
  spot_fire_probability: {
    label: 'Spot Fire Probability',
    description: 'Probability of a distant new ignition without adjacent fire.',
  },
  regrowth_rate_per_tick: {
    label: 'Fuel Regrowth Rate',
    description: 'Probability that a burned patch regrows fuel on each tick.',
  },
  ignition_count: {
    label: 'Initial Ignition Count',
    description: 'Number of ignition points seeded during initialization.',
  },
  beta: {
    label: 'Transmission Probability',
  },
  gamma: {
    label: 'Recovery Probability',
  },
  initial_infected: {
    label: 'Initial Infected',
  },
  debunk_rate: {
    label: 'Debunking Conversion Rate',
  },
  intervention_start: {
    label: 'Intervention Start Tick',
  },
  tolerance: {
    label: 'Similarity Tolerance Threshold',
    description: 'Agents relocate when the share of similar neighbors falls below this value.',
  },
  innovation_p: {
    label: 'Innovation Coefficient',
    description: 'Spontaneous adoption probability without neighbor influence.',
  },
  imitation_q: {
    label: 'Imitation Coefficient',
    description: 'Weight of neighbor adoption share on adoption probability.',
  },
  initial_adopters: {
    label: 'Initial Adopters',
  },
  confidence_threshold: {
    label: 'Confidence Threshold',
    description: 'Agents only influence each other when opinion distance is below this value.',
  },
  convergence_rate: {
    label: 'Convergence Rate',
    description: 'Share of the opinion gap closed during each interaction.',
  },
  multiplication_factor: {
    label: 'Multiplication Factor',
    description: 'Multiplier applied to pooled cooperative contributions.',
  },
  cost: {
    label: 'Contribution Cost',
  },
  selection_strength: {
    label: 'Selection Strength (K)',
    description: 'Sensitivity of Fermi imitation to payoff differences.',
  },
  initial_coop_rate: {
    label: 'Initial Cooperation Rate',
  },
  mean_threshold: {
    label: 'Mean Threshold',
    description: 'Center of the individual threshold distribution.',
  },
  initial_active: {
    label: 'Initial Active Agents',
  },
}

const MECHANISM_EN: Record<string, MechanismEntry> = {
  seed_fuel_and_ignition: {
    label: 'Terrain and Ignition Seeding',
    trigger: 'Initialization',
    effect: 'Create tree, rock, and empty terrain; seed the initial ignition point.',
  },
  advance_fire_front: {
    label: 'Fire Front Advance',
    trigger: 'Each tick while fire can spread',
    effect: 'Burning patches become burned; nearby trees can ignite through neighbor, wind, and optional spot-fire effects.',
  },
  fuel_regrowth: {
    label: 'Fuel Regrowth',
    trigger: 'Each tick',
    effect: 'Burned patches can regrow into trees according to the regrowth rate.',
  },
  seed_infection: {
    label: 'Initial Infection Seeding',
    trigger: 'Initialization',
    effect: 'Select initial infected agents.',
  },
  spread: {
    label: 'Rumor Spread',
    trigger: 'Each tick through network contacts',
    effect: 'Infected agents can transmit the rumor to susceptible neighbors.',
  },
  infect: {
    label: 'Neighborhood Infection',
    trigger: 'Each tick through local contacts',
    effect: 'Infected residents can transmit infection to susceptible neighbors.',
  },
  recover: {
    label: 'Recovery',
    trigger: 'Each tick for infected agents',
    effect: 'Infected agents recover or stop spreading.',
  },
  intervention: {
    label: 'Debunking Intervention',
    trigger: 'After the intervention start tick',
    effect: 'Convert some rumor spreaders into recovered or debunked agents.',
  },
  assign_groups: {
    label: 'Group Assignment',
    trigger: 'Initialization',
    effect: 'Assign residents to groups on the grid.',
  },
  relocate: {
    label: 'Unsatisfied Relocation',
    trigger: 'Each tick for residents below tolerance',
    effect: 'Move unsatisfied residents to open cells.',
  },
  seed_adopters: {
    label: 'Early Adopter Seeding',
    trigger: 'Initialization',
    effect: 'Seed the first innovation adopters.',
  },
  adopt: {
    label: 'Innovation Adoption',
    trigger: 'Each tick',
    effect: 'Non-adopters may adopt from external influence and neighbor imitation.',
  },
  assign_opinions: {
    label: 'Initial Opinion Assignment',
    trigger: 'Initialization',
    effect: 'Assign continuous opinions to agents.',
  },
  interact: {
    label: 'Bounded-Confidence Interaction',
    trigger: 'Each tick for close-enough opinions',
    effect: 'Agents with similar opinions move toward each other.',
  },
  assign_strategies: {
    label: 'Initial Strategy Assignment',
    trigger: 'Initialization',
    effect: 'Assign cooperation or defection strategies.',
  },
  play_round: {
    label: 'Public-Goods Round',
    trigger: 'Each tick',
    effect: 'Compute payoffs from cooperative contributions and the multiplier.',
  },
  update_strategies: {
    label: 'Strategy Imitation Update',
    trigger: 'After each public-goods round',
    effect: 'Agents may imitate better-performing neighbors.',
  },
  assign_thresholds: {
    label: 'Threshold Assignment',
    trigger: 'Initialization',
    effect: 'Assign individual activation thresholds.',
  },
  seed_active: {
    label: 'Initial Activation Seeding',
    trigger: 'Initialization',
    effect: 'Seed initially active agents.',
  },
  maybe_activate: {
    label: 'Threshold Activation',
    trigger: 'Each tick when active-neighbor share exceeds threshold',
    effect: 'Inactive agents become active.',
  },
}

const OBSERVER_EN: Record<string, string> = {
  tree: 'Tree Patches',
  rock: 'Rock Patches',
  fuel: 'Burnable Patches',
  burning: 'Burning Patches',
  burned: 'Burned Patches',
  empty: 'Empty Patches',
  burned_rate: 'Burned Rate',
  susceptible: 'Susceptible',
  infected: 'Infected',
  recovered: 'Recovered',
  segregation: 'Mean Similar-Neighbor Share',
  unhappy: 'Unsatisfied Residents',
  adopters: 'Adopters',
  non_adopters: 'Non-Adopters',
  adoption_rate: 'Adoption Rate',
  opinion_mean: 'Mean Opinion',
  opinion_variance: 'Opinion Variance',
  clusters: 'Opinion Clusters',
  cooperation_rate: 'Cooperation Rate',
  mean_payoff: 'Mean Payoff',
  active: 'Active Agents',
  inactive: 'Inactive Agents',
  active_rate: 'Activation Rate',
}

const AGENT_EN: Record<string, DisplayEntry> = {
  patch: { label: 'Patch', description: 'A grid cell representing empty, tree, rock, burning, or burned land.' },
  person: { label: 'Person', description: 'An individual in the network holding one of the model states.' },
  resident: { label: 'Resident', description: 'A resident living on the grid.' },
  player: { label: 'Player', description: 'A game participant choosing to cooperate or defect.' },
}

interface ModelEntry extends DisplayEntry {
  notes?: string
}

/**
 * Model-level display text for the built-in kernel templates (authored in
 * Chinese as the simulation source of truth). Keyed by ModelConfig.id so the
 * ODD/panels can render a system-language document for non-Chinese locales.
 */
const MODEL_EN: Record<string, ModelEntry> = {
  reference_rumor: {
    label: 'Rumor Spread + Debunking Intervention (SIR on a network)',
    description: 'A reference model of rumor spreading and debunking on a social network, used as a self-consistent kernel/contract baseline.',
    notes: 'All individuals start susceptible; initial_infected agents are seeded as infected at random.',
  },
  template_sir_grid: {
    label: 'Spatial SIR Epidemic (grid)',
    description: 'A susceptible/infected/recovered epidemic on a grid; infection spreads to the Moore neighborhood.',
    notes: 'Residents are placed on the grid; initial_infected residents are seeded as infected at random.',
  },
  template_schelling: {
    label: 'Schelling Segregation Model (grid)',
    description: 'Two groups of residents relocate on a grid based on their share of same-group neighbors, and spatial segregation emerges.',
    notes: 'Residents are scattered on the grid, half group a and half group b, with empty cells left open for relocation.',
  },
  template_innovation_diffusion: {
    label: 'Innovation Diffusion (Bass / simple contagion)',
    description: 'Adoption of an innovation on a social network: external influence (advertising) plus neighbor imitation drives adoption, producing an S-shaped diffusion curve.',
    notes: 'All individuals start as non-adopters; initial_adopters early adopters are seeded at random.',
  },
  template_opinion_dynamics: {
    label: 'Opinion Dynamics (bounded confidence)',
    description: 'Bounded-confidence opinion dynamics on a social network: only sufficiently close opinions influence each other and converge, forming opinion clusters.',
    notes: 'Each individual is assigned an initial opinion uniformly at random in [0, 1].',
  },
  template_public_goods: {
    label: 'Public Goods Game (network)',
    description: 'A public-goods game on a network: cooperators contribute, the pooled amount is multiplied and split equally, and agents imitate more successful neighbors.',
    notes: 'Cooperators are assigned at random by initial_coop_rate; the rest defect.',
  },
  template_social_influence: {
    label: 'Social-Influence Threshold Model (complex contagion)',
    description: 'A Granovetter threshold model: an individual activates only when the share of active neighbors reaches their personal threshold.',
    notes: 'All individuals start inactive; thresholds are drawn around mean_threshold and initial_active agents are seeded active.',
  },
  template_wildfire_grid: {
    label: 'Wildfire Spread (single-ignition terrain grid)',
    description: 'A spatial grid of trees, rock, and empty land; fire starts from a single ignition point, spreads across burnable trees, and leaves burned-out areas.',
    notes: 'Every grid cell is a patch; initialization lays out terrain by tree/rock density and seeds the initial ignition near a single point.',
  },
}

export function isChineseAbmLocale(locale: Locale): boolean {
  return locale === 'zh' || locale === 'zh-TW'
}

export function localizeParameterText(
  id: string,
  fallbackLabel: string,
  fallbackDescription: string | undefined,
  locale: Locale,
): DisplayEntry {
  if (isChineseAbmLocale(locale)) return { label: fallbackLabel, description: fallbackDescription }
  const entry = PARAMETER_EN[id]
  return {
    label: entry?.label ?? fallbackLabel,
    description: entry?.description ?? fallbackDescription,
  }
}

export function localizeMechanismText(id: string, fallbackLabel: string, locale: Locale): string {
  if (isChineseAbmLocale(locale)) return fallbackLabel
  return MECHANISM_EN[id]?.label ?? fallbackLabel
}

export function localizeMechanismDetail(
  id: string,
  field: 'trigger' | 'effect',
  fallback: string | undefined,
  locale: Locale,
): string | undefined {
  if (isChineseAbmLocale(locale)) return fallback
  return MECHANISM_EN[id]?.[field] ?? fallback
}

export function localizeObserverText(id: string, fallbackLabel: string, locale: Locale): string {
  if (isChineseAbmLocale(locale)) return fallbackLabel
  return OBSERVER_EN[id] ?? fallbackLabel
}

export function localizeModelText(
  id: string,
  fallbackName: string,
  fallbackDescription: string | undefined,
  locale: Locale,
): DisplayEntry {
  if (isChineseAbmLocale(locale)) return { label: fallbackName, description: fallbackDescription }
  const entry = MODEL_EN[id]
  return {
    label: entry?.label ?? fallbackName,
    description: entry?.description ?? fallbackDescription,
  }
}

export function localizeInitializationNotes(
  modelId: string,
  fallbackNotes: string | undefined,
  locale: Locale,
): string | undefined {
  if (isChineseAbmLocale(locale)) return fallbackNotes
  return MODEL_EN[modelId]?.notes ?? fallbackNotes
}

export function localizeAgentTypeText(id: string, fallbackLabel: string, fallbackDescription: string | undefined, locale: Locale): DisplayEntry {
  if (isChineseAbmLocale(locale)) return { label: fallbackLabel, description: fallbackDescription }
  const entry = AGENT_EN[id]
  return {
    label: entry?.label ?? fallbackLabel,
    description: entry?.description ?? fallbackDescription,
  }
}
