"""Static validation of AI-generated ``mechanisms.py`` against the kernel API.

The kernel deliberately exposes a *small* runtime surface to mechanism/observer
functions (the authoritative whitelist lives in ``data-contracts.md`` §6). LLMs
frequently hallucinate removed/legacy Mesa APIs — ``model.schedule``,
``model.current_step``, calling ``model.agents(...)`` — which import fine but only
blow up at *run* time, inside a single step, on a specific research question.

This module statically rejects those constructs **without executing the code**
(safe to run before the P4 ``execute_code`` gate), so the modeling skill can feed
precise errors back to the LLM and auto-repair the proposal before a user ever
sees or runs it (constitution E5: AI-generated models must actually run).
"""

from __future__ import annotations

import ast
import builtins

# Names always resolvable without a local/module binding.
_SAFE_BUILTINS: frozenset[str] = frozenset(dir(builtins)) | {
    "__name__",
    "__file__",
    "__doc__",
}

# Attribute names that never exist on KernelModel/KernelAgent. These are the
# documented real-world hallucinations (lessons.md 2026-06-27) plus the legacy
# Mesa surface the thin kernel removed. The current tick is `model.steps`;
# there is no schedule / time / datacollector (data-contracts.md §6).
_FORBIDDEN_ATTRS: dict[str, str] = {
    "current_step": "当前 tick 用 `model.steps`",
    "current_tick": "当前 tick 用 `model.steps`",
    "tick": "当前 tick 用 `model.steps`",
    "time": "没有 `model.time`；当前 tick 用 `model.steps`",
    "schedule": "没有 `model.schedule`：遍历用 `for a in model.agents`，当前 tick 用 `model.steps`",
    "datacollector": "没有 datacollector：宏观指标用 observer 函数返回数值",
    "num_agents": "没有 `model.num_agents`：用 `sum(1 for _ in model.agents)` 计数",
    "running": "没有 `model.running`：运行步数由外层 runner 控制",
    "step_count": "当前 tick 用 `model.steps`",
}

# Global RNG modules are banned — all randomness must go through `model.random`
# so runs stay reproducible (constitution P1).
_FORBIDDEN_RANDOM_MODULES = {"random", "numpy.random"}


class _MechanismVisitor(ast.NodeVisitor):
    """Collect runtime-API violations from a parsed mechanisms module."""

    def __init__(self) -> None:
        self.issues: list[str] = []

    def visit_Attribute(self, node: ast.Attribute) -> None:
        hint = _FORBIDDEN_ATTRS.get(node.attr)
        if hint is not None:
            self.issues.append(f"第 {node.lineno} 行：使用了不存在的接口 `.{node.attr}`——{hint}。")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func
        # `model.agents` is an iterable AgentSet, not callable: reject model.agents("person").
        if isinstance(func, ast.Attribute) and func.attr == "agents":
            self.issues.append(
                f"第 {func.lineno} 行：`model.agents` 不可调用——用 `for a in model.agents:` 遍历，"
                '按 `a.agent_type_id == "<type>"` 筛选。'
            )
        self.generic_visit(node)

    def _flag_random(self, lineno: int, mod: str) -> None:
        self.issues.append(
            f"第 {lineno} 行：禁止全局随机 `{mod}`——一律用 `model.random`（可复现 P1）。"
        )

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            if alias.name in _FORBIDDEN_RANDOM_MODULES:
                self._flag_random(node.lineno, alias.name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module in _FORBIDDEN_RANDOM_MODULES:
            self._flag_random(node.lineno, node.module)
        self.generic_visit(node)


def _arg_names(args: ast.arguments) -> set[str]:
    """All parameter names introduced by a function/lambda signature."""
    names = {a.arg for a in (*args.posonlyargs, *args.args, *args.kwonlyargs)}
    if args.vararg:
        names.add(args.vararg.arg)
    if args.kwarg:
        names.add(args.kwarg.arg)
    return names


class _BindingCollector(ast.NodeVisitor):
    """Collect names bound *directly* in one scope, never descending into nested scopes.

    Nested function/lambda bodies own their scope, so we record their *name* (a binding
    in the current scope) but do not walk inside them.
    """

    def __init__(self) -> None:
        self.names: set[str] = set()

    def _add_target(self, target: ast.expr) -> None:
        if isinstance(target, ast.Name):
            self.names.add(target.id)
        elif isinstance(target, ast.Starred):
            self._add_target(target.value)
        elif isinstance(target, ast.Tuple | ast.List):
            for elt in target.elts:
                self._add_target(elt)

    def visit_Assign(self, node: ast.Assign) -> None:
        for target in node.targets:
            self._add_target(target)
        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        self._add_target(node.target)
        self.generic_visit(node)

    def visit_AugAssign(self, node: ast.AugAssign) -> None:
        self._add_target(node.target)
        self.generic_visit(node)

    def visit_NamedExpr(self, node: ast.NamedExpr) -> None:
        self._add_target(node.target)
        self.generic_visit(node)

    def visit_For(self, node: ast.For) -> None:
        self._add_target(node.target)
        self.generic_visit(node)

    def visit_AsyncFor(self, node: ast.AsyncFor) -> None:
        self._add_target(node.target)
        self.generic_visit(node)

    def visit_With(self, node: ast.With) -> None:
        for item in node.items:
            if item.optional_vars is not None:
                self._add_target(item.optional_vars)
        self.generic_visit(node)

    def visit_AsyncWith(self, node: ast.AsyncWith) -> None:
        for item in node.items:
            if item.optional_vars is not None:
                self._add_target(item.optional_vars)
        self.generic_visit(node)

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
        if node.name:
            self.names.add(node.name)
        self.generic_visit(node)

    def visit_comprehension(self, node: ast.comprehension) -> None:
        self._add_target(node.target)
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.names.add((alias.asname or alias.name).split(".")[0])

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        for alias in node.names:
            self.names.add(alias.asname or alias.name)

    def visit_Global(self, node: ast.Global) -> None:
        self.names.update(node.names)

    def visit_Nonlocal(self, node: ast.Nonlocal) -> None:
        self.names.update(node.names)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.names.add(node.name)  # bound here; its body is a separate scope

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self.names.add(node.name)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self.names.add(node.name)

    def visit_Lambda(self, node: ast.Lambda) -> None:
        return  # anonymous + own scope: nothing bound in the current scope


def _scope_bindings(body: list[ast.stmt]) -> set[str]:
    collector = _BindingCollector()
    for node in body:
        collector.visit(node)
    return collector.names


def _resolve(name: str, chain: list[set[str]]) -> bool:
    return name in _SAFE_BUILTINS or any(name in scope for scope in chain)


def _walk_names(node: ast.AST, chain: list[set[str]], issues: list[str]) -> None:
    """Flag Load-context names unresolvable in the current scope chain.

    Recurses with an extended chain when entering a nested function/lambda so closure
    variables resolve, but a name defined only in a *sibling* function does not.
    """
    if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
        # Decorators and default values are evaluated in the *enclosing* scope.
        for deco in node.decorator_list:
            _walk_names(deco, chain, issues)
        for default in (*node.args.defaults, *(d for d in node.args.kw_defaults if d)):
            _walk_names(default, chain, issues)
        local = _arg_names(node.args) | _scope_bindings(node.body)
        for stmt in node.body:
            _walk_names(stmt, [*chain, local], issues)
        return
    if isinstance(node, ast.Lambda):
        for default in (*node.args.defaults, *(d for d in node.args.kw_defaults if d)):
            _walk_names(default, chain, issues)
        _walk_names(node.body, [*chain, _arg_names(node.args)], issues)
        return
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
        if not _resolve(node.id, chain):
            issues.append(
                f"第 {node.lineno} 行：使用了未定义的变量 `{node.id}`——"
                "很可能把参数名写错了（agent 级机制签名是 fn(agent, model)，"
                "model 级是 fn(model)），运行到该分支会 NameError 崩溃。"
            )
        return
    for child in ast.iter_child_nodes(node):
        _walk_names(child, chain, issues)


def _undefined_name_issues(tree: ast.Module) -> list[str]:
    """Scope-aware undefined-name detection (no execution).

    Bails out (returns no issues) when the module contains constructs that can introduce
    names invisible to static analysis — ``class`` bodies or ``from x import *`` — leaving
    those rare cases to the runtime/smoke layer rather than risking a false positive that
    blocks a valid model.
    """
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            return []
        if isinstance(node, ast.ImportFrom) and any(a.name == "*" for a in node.names):
            return []
    issues: list[str] = []
    module_scope = _scope_bindings(tree.body)
    for node in tree.body:
        _walk_names(node, [module_scope], issues)
    # Dedupe identical messages (same name used repeatedly) while preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for issue in issues:
        if issue not in seen:
            seen.add(issue)
            unique.append(issue)
    return unique


def validate_mechanisms_source(source: str) -> list[str]:
    """Return human-readable issues for a generated mechanisms source (empty == clean).

    Static analysis only — never executes ``source`` — so it is safe to call before
    the P4 ``execute_code`` gate. Catches (1) hallucinated runtime APIs (forbidden
    attributes / ``model.agents(...)`` / global RNG) and (2) undefined names (scope
    typos like ``a`` instead of ``agent``) that import cleanly but crash on a late branch.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return [f"mechanisms.py 语法错误（第 {exc.lineno} 行）：{exc.msg}"]
    visitor = _MechanismVisitor()
    visitor.visit(tree)
    return [*visitor.issues, *_undefined_name_issues(tree)]
