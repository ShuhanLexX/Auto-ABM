"""Built-in reference + template models — baselines and one-click starting points.

Importing this package registers each model's behavior in the behavior registry.
"""

from __future__ import annotations

from abm_kernel.models.diffusion import DIFFUSION_BEHAVIOR, diffusion_model_config
from abm_kernel.models.opinion import OPINION_BEHAVIOR, opinion_model_config
from abm_kernel.models.public_goods import PUBLIC_GOODS_BEHAVIOR, public_goods_model_config
from abm_kernel.models.rumor import RUMOR_BEHAVIOR, rumor_model_config
from abm_kernel.models.schelling import SCHELLING_BEHAVIOR, schelling_model_config
from abm_kernel.models.sir import SIR_BEHAVIOR, sir_model_config
from abm_kernel.models.social_influence import (
    SOCIAL_INFLUENCE_BEHAVIOR,
    social_influence_model_config,
)
from abm_kernel.models.wildfire import WILDFIRE_BEHAVIOR, wildfire_model_config

__all__ = [
    "DIFFUSION_BEHAVIOR",
    "OPINION_BEHAVIOR",
    "PUBLIC_GOODS_BEHAVIOR",
    "RUMOR_BEHAVIOR",
    "SCHELLING_BEHAVIOR",
    "SIR_BEHAVIOR",
    "SOCIAL_INFLUENCE_BEHAVIOR",
    "WILDFIRE_BEHAVIOR",
    "diffusion_model_config",
    "opinion_model_config",
    "public_goods_model_config",
    "rumor_model_config",
    "schelling_model_config",
    "sir_model_config",
    "social_influence_model_config",
    "wildfire_model_config",
]
