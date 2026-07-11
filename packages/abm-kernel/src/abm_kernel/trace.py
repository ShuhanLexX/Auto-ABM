"""TraceWriter — line-delimited JSON trace (data-contracts.md §4).

One file per Run. First line is `run_meta`, last line is `run_end`. Volume is
controlled by `level`: off → meta/end only; key → + tick_metrics/event/mechanism;
full → + agent_delta. AI explanations later read slices of this (constitution P2).
"""

from __future__ import annotations

import json
from pathlib import Path
from types import TracebackType
from typing import Any, Literal, Self, TextIO

from abm_kernel.errors import TraceError
from abm_kernel.util import now_iso

TraceLevel = Literal["off", "key", "full"]
TRACE_SCHEMA_VERSION = "1"


class TraceWriter:
    """Append trace records as JSON lines to a file."""

    def __init__(self, path: str | Path, level: TraceLevel = "key") -> None:
        self.path = Path(path)
        self.level: TraceLevel = level
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh: TextIO = self.path.open("w", encoding="utf-8")
        self._closed = False

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()

    def _write(self, record: dict[str, Any]) -> None:
        if self._closed:
            raise TraceError("TraceWriter 已关闭，无法继续写入")
        self._fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    def meta(self, **fields: Any) -> None:
        """Write the first-line run_meta record."""
        self._write({"kind": "run_meta", "schema_version": TRACE_SCHEMA_VERSION, **fields})

    def tick_metrics(self, tick: int, metrics: dict[str, float]) -> None:
        """Write per-tick macro metrics (always, unless level=off)."""
        if self.level == "off":
            return
        self._write({"kind": "tick_metrics", "tick": tick, "metrics": metrics})

    def event(self, tick: int, name: str, **fields: Any) -> None:
        """Write a key event record."""
        if self.level == "off":
            return
        self._write({"kind": "event", "tick": tick, "name": name, **fields})

    def mechanism_fired(self, tick: int, mechanism_id: str, **fields: Any) -> None:
        """Write a mechanism-fired record (level >= key)."""
        if self.level == "off":
            return
        self._write(
            {"kind": "mechanism_fired", "tick": tick, "mechanism_id": mechanism_id, **fields}
        )

    def space_snapshot(self, tick: int, snapshot: dict[str, Any]) -> None:
        """Write a space snapshot for the simulation canvas (level != off; §10/§4).

        `snapshot` carries the `space` kind plus its payload (e.g. nodes/edges for
        network, cells for grid). Display-only data; not part of reproduction (P1).
        """
        if self.level == "off":
            return
        self._write({"kind": "space_snapshot", "tick": tick, "snapshot": snapshot})

    def agent_init(self, agent_id: int, agent_type: str, state: dict[str, Any]) -> None:
        """Write an agent's initial (construction-time) state (level=full only).

        Recorded once per agent before setup so the full agent roster + tick-0
        defaults can be reconstructed and then replayed via agent_delta (P1/P2).
        """
        if self.level != "full":
            return
        self._write(
            {
                "kind": "agent_init",
                "tick": 0,
                "agent_id": agent_id,
                "agent_type": agent_type,
                "state": dict(state),
            }
        )

    def agent_delta(
        self, tick: int, agent_id: int, agent_type: str, changes: dict[str, Any]
    ) -> None:
        """Write an agent state-change record (level=full only)."""
        if self.level != "full":
            return
        self._write(
            {
                "kind": "agent_delta",
                "tick": tick,
                "agent_id": agent_id,
                "agent_type": agent_type,
                "changes": changes,
            }
        )

    def end(self, tick: int, status: str) -> None:
        """Write the final run_end record and close the file."""
        self._write({"kind": "run_end", "tick": tick, "status": status, "finished_at": now_iso()})
        self.close()

    def close(self) -> None:
        """Close the underlying file handle (idempotent)."""
        if not self._closed:
            self._fh.close()
            self._closed = True
