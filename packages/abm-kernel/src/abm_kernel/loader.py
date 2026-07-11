"""Load a ModelBehavior from generated `mechanisms.py` (AI codegen contract).

Contract (data-contracts.md §6, ADR-0003): an AI-generated `mechanisms.py` must
expose a top-level ``build_behavior() -> ModelBehavior`` whose mechanism/observer
keys cover the matching ModelConfig's ``mechanism.id`` / ``observer.id``.

SECURITY — this module EXECUTES arbitrary Python (constitution P4 "execute_code"):
importing the file runs its top-level code. The caller (backend) MUST only invoke
this after an approved audit gate. There is no sandbox in the MVP (ADR-0003).
"""

from __future__ import annotations

import importlib.util
import itertools
from pathlib import Path

from abm_kernel.behavior import ModelBehavior
from abm_kernel.errors import BuildError, MechanismError
from abm_kernel.schemas import ModelConfig

_BUILD_FN = "build_behavior"
_counter = itertools.count()


def load_behavior_from_file(path: str | Path, config: ModelConfig) -> ModelBehavior:
    """Import a generated mechanisms file and return its validated ModelBehavior.

    Raises:
        BuildError: file missing / not importable / no ``build_behavior`` / wrong type.
        MechanismError: returned behavior does not cover the config's ids.
    """
    file_path = Path(path)
    if not file_path.exists():
        raise BuildError(f"未找到生成代码文件: {file_path}")

    module_name = f"abm_kernel._generated.{config.id}_{next(_counter)}"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise BuildError(f"无法为 {file_path} 创建模块 spec")

    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)  # executes generated code (gated by audit, P4)
    except Exception as exc:  # noqa: BLE001 — surface any codegen error as BuildError
        raise BuildError(f"加载生成代码失败 ({file_path}): {exc}") from exc

    build_fn = getattr(module, _BUILD_FN, None)
    if not callable(build_fn):
        raise BuildError(f"生成代码 {file_path} 缺少顶层 {_BUILD_FN}() 函数")

    behavior = build_fn()
    if not isinstance(behavior, ModelBehavior):
        raise BuildError(f"{_BUILD_FN}() 必须返回 ModelBehavior，实际返回 {type(behavior)!r}")

    _validate_coverage(behavior, config)
    return behavior


def _validate_coverage(behavior: ModelBehavior, config: ModelConfig) -> None:
    """Ensure the behavior implements every mechanism/observer the config declares."""
    missing_mechanisms = [m.id for m in config.mechanisms if m.id not in behavior.mechanisms]
    if missing_mechanisms:
        raise MechanismError(f"生成 behavior 缺少机制实现: {missing_mechanisms}")
    missing_observers = [o.id for o in config.observers if o.id not in behavior.observers]
    if missing_observers:
        raise MechanismError(f"生成 behavior 缺少观测指标实现: {missing_observers}")
