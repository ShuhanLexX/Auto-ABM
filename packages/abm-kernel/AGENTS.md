# AGENTS.md — abm-kernel

`packages/abm-kernel`：标准化 ABM 内核（纯 Python，零 Web 依赖）。

## 命令

```bash
cd packages/abm-kernel
uv sync --all-extras
uv run ruff check .
uv run ruff format --check .
uv run mypy src
uv run pytest
```

## 约定

- 不得依赖 FastAPI / Web 层。
- 数据结构用 Pydantic v2；命名见 `docs/engineering/coding-standards.md`。
- 涉及随机逻辑必须显式传种子（宪法 P1）。
