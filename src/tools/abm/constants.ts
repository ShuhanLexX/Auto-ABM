export const ABM_PROPOSE_TOOL_NAME = 'abm_propose_simulations'
export const ABM_ADOPT_TOOL_NAME = 'abm_adopt_simulation'
export const ABM_EDIT_MODEL_TOOL_NAME = 'abm_edit_model'
export const ABM_RUN_TOOL_NAME = 'abm_run'
export const ABM_EXPLAIN_TOOL_NAME = 'abm_explain_interval'
export const ABM_UPDATE_ODD_TOOL_NAME = 'abm_update_odd'
export const ABM_CONFIGURE_RESULTS_TOOL_NAME = 'abm_configure_results'
export const ABM_CONTROL_WORKBENCH_TOOL_NAME = 'abm_control_workbench'
export const ABM_INSPECT_TOOL_NAME = 'abm_inspect_simulation'
export const ABM_VALIDATE_TOOL_NAME = 'abm_validate_simulation'
export const ABM_STOP_RUN_TOOL_NAME = 'abm_stop_run'
export const ABM_CONFIGURE_EXPERIMENT_TOOL_NAME = 'abm_configure_experiment_view'
export const ABM_ATTRIBUTE_TOOL_NAME = 'abm_attribute_interval'
export const ABM_COUNTERFACTUAL_TOOL_NAME = 'abm_counterfactual_run'

/** ABM tools that mutate state — disabled in dialogue (read-only) mode. */
export const ABM_MUTATING_TOOL_NAMES: readonly string[] = [
  ABM_PROPOSE_TOOL_NAME,
  ABM_ADOPT_TOOL_NAME,
  ABM_EDIT_MODEL_TOOL_NAME,
  ABM_RUN_TOOL_NAME,
  ABM_UPDATE_ODD_TOOL_NAME,
  ABM_STOP_RUN_TOOL_NAME,
  ABM_COUNTERFACTUAL_TOOL_NAME,
]
