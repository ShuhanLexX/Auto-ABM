import type { Tool } from '../../Tool.js'
import { ProposeSimulationsTool } from './proposeSimulationsTool.js'
import { AdoptSimulationTool } from './adoptSimulationTool.js'
import { ExplainIntervalTool } from './explainIntervalTool.js'
import { EditModelTool } from './editModelTool.js'
import { RunTool } from './runTool.js'
import { StopRunTool } from './stopRunTool.js'
import { UpdateOddTool } from './updateOddTool.js'
import { ConfigureResultsTool } from './configureResultsTool.js'
import { ControlWorkbenchTool } from './controlWorkbenchTool.js'
import { InspectSimulationTool } from './inspectSimulationTool.js'
import { ValidateSimulationTool } from './validateSimulationTool.js'
import { ConfigureExperimentViewTool } from './configureExperimentViewTool.js'
import { AttributeIntervalTool } from './attributeIntervalTool.js'
import { CounterfactualRunTool } from './counterfactualRunTool.js'

export { ABM_MUTATING_TOOL_NAMES } from './constants.js'

/**
 * ABM agent-loop tools. This fork is an ABM research workbench, so these are part
 * of the default tool set. Set ENABLE_ABM_TOOLS=0 (or false) to fall back to the
 * coding-only base tools.
 */
export function getAbmTools(): Tool[] {
  return [
    ProposeSimulationsTool as unknown as Tool,
    AdoptSimulationTool as unknown as Tool,
    ExplainIntervalTool as unknown as Tool,
    EditModelTool as unknown as Tool,
    RunTool as unknown as Tool,
    StopRunTool as unknown as Tool,
    UpdateOddTool as unknown as Tool,
    ConfigureResultsTool as unknown as Tool,
    ControlWorkbenchTool as unknown as Tool,
    InspectSimulationTool as unknown as Tool,
    ValidateSimulationTool as unknown as Tool,
    ConfigureExperimentViewTool as unknown as Tool,
    AttributeIntervalTool as unknown as Tool,
    CounterfactualRunTool as unknown as Tool,
  ]
}

export function isAbmToolsEnabled(): boolean {
  const flag = process.env.ENABLE_ABM_TOOLS
  if (flag === undefined || flag === '') return true
  return flag !== '0' && flag.toLowerCase() !== 'false'
}
