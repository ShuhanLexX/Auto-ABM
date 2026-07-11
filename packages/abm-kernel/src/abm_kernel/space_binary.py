"""Compact binary encoding of SpaceSnapshots for the simulation canvas (P1).

The byte layout here is the single source of truth; the desktop decoder
(`desktop/src/abm/canvas/frameFormat.ts`) mirrors it byte-for-byte. See
docs/ai/impl/simulation-canvas.md §4 and kernel-bridge.md §5.

Wire format (little-endian)::

    header        kind:u8, tick:u32, count:u32               (struct "<BII")
    grid full     header + Uint8 state[width*height]         (kind=1)
    points full   header + Uint8 state[N]                     (kind=2)
    delta         header + (index:u32, state:u8) * count      (kind=3)

Only state bytes travel each frame — colours are resolved on the desktop from
the palette index, and network node coordinates / edges ship once in the JSON
`meta` frame (`build_network_meta`). Everything in this module is display-only
and never consumes the model RNG, so it cannot affect reproducibility (P1).
"""

from __future__ import annotations

import base64
import struct
from typing import TYPE_CHECKING, Any

import networkx as nx
from abm_kernel.space_state import build_state_palette

if TYPE_CHECKING:
    from abm_kernel.schemas import ModelConfig
    from abm_kernel.schemas.space import SpaceSnapshot

KIND_GRID_FULL = 1
KIND_POINTS_FULL = 2
KIND_DELTA = 3

# Reserved palette index for unoccupied grid cells / unknown states. Palette
# indices must therefore stay <= 254 (always true for categorical MVP states).
EMPTY_STATE = 255

# Spring layout uses the dense numpy path below this size (no scipy needed);
# larger networks fall back to the O(n) random layout.
_SPRING_MAX = 400

_HEADER = struct.Struct("<BII")  # kind:u8, tick:u32, count:u32
_DELTA_ITEM = struct.Struct("<IB")  # index:u32, state:u8


# ---- per-frame encoding (pure) -------------------------------------------


def encode_full_grid(tick: int, states: bytes | bytearray | list[int]) -> bytes:
    body = bytes(states)
    return _HEADER.pack(KIND_GRID_FULL, tick, len(body)) + body


def encode_full_points(tick: int, states: bytes | bytearray | list[int]) -> bytes:
    body = bytes(states)
    return _HEADER.pack(KIND_POINTS_FULL, tick, len(body)) + body


def encode_delta(tick: int, changes: list[tuple[int, int]]) -> bytes:
    head = _HEADER.pack(KIND_DELTA, tick, len(changes))
    body = b"".join(_DELTA_ITEM.pack(idx, st) for idx, st in changes)
    return head + body


def decode_frame(buf: bytes) -> dict[str, Any]:
    """Decode a frame back to a dict (used by the round-trip tests)."""
    mv = memoryview(buf)
    kind, tick, count = _HEADER.unpack_from(mv, 0)
    offset = _HEADER.size
    if kind == KIND_DELTA:
        changes: list[tuple[int, int]] = []
        for i in range(count):
            idx, st = _DELTA_ITEM.unpack_from(mv, offset + i * _DELTA_ITEM.size)
            changes.append((idx, st))
        return {"kind": kind, "tick": tick, "count": count, "changes": changes}
    state = list(bytes(mv[offset : offset + count]))
    return {"kind": kind, "tick": tick, "count": count, "state": state}


def apply_delta(state: bytearray, changes: list[tuple[int, int]]) -> bytearray:
    for idx, st in changes:
        state[idx] = st
    return state


def diff_states(prev: bytes | bytearray, new: bytes | bytearray) -> list[tuple[int, int]]:
    return [(i, new[i]) for i in range(len(new)) if prev[i] != new[i]]


# ---- palette + snapshot -> state indices ---------------------------------


def build_palette(config: ModelConfig, extra_states: set[str | None] | None = None) -> list[str]:
    """Stable ordered list of state values; index = position (sorted for determinism).

    Built from each agent type's primary display state. Categorical values use
    declared choices; continuous numeric values use stable bins so later ticks do
    not produce unknown palette entries and vanish from the canvas.
    """
    return build_state_palette(config, extra_states)


def grid_states(
    payload: dict[str, Any], index: dict[str, int], width: int, height: int
) -> bytearray:
    """Row-major (y*width+x) state index buffer; unoccupied cells = EMPTY_STATE."""
    states = bytearray([EMPTY_STATE]) * (width * height)
    for cell in payload.get("cells", []):
        x = int(cell["x"])
        y = int(cell["y"])
        if 0 <= x < width and 0 <= y < height:
            states[y * width + x] = _state_index(cell.get("state"), index)
    return states


def points_states(payload: dict[str, Any], index: dict[str, int]) -> bytearray:
    """State index buffer in node order (nodes are pre-sorted by build_space_snapshot)."""
    nodes = payload.get("nodes", [])
    states = bytearray(len(nodes))
    for i, node in enumerate(nodes):
        states[i] = _state_index(node.get("state"), index)
    return states


def _state_index(state: Any, index: dict[str, int]) -> int:
    if state is None:
        return EMPTY_STATE
    return index.get(str(state), EMPTY_STATE)


# ---- network layout meta (once per run) ----------------------------------


def build_network_meta(
    node_ids: list[Any], edges: list[Any], *, seed: int
) -> dict[str, Any]:
    """Precompute node coordinates (normalized to [0,1]) + edge index pairs once.

    Layout is deterministic for a given seed and display-only (does not touch the
    model RNG). Coordinates ship as base64 Float32 (x,y interleaved, node order);
    edges as base64 Uint32 (a,b interleaved, indices into node order).
    """
    graph = nx.Graph()
    graph.add_nodes_from(node_ids)
    graph.add_edges_from((a, b) for a, b in edges)

    positions = _network_positions(graph, node_ids, seed)
    coords: list[float] = [0.0] * (len(node_ids) * 2)
    for i, node in enumerate(node_ids):
        x, y = positions[node]
        coords[2 * i] = float(x)
        coords[2 * i + 1] = float(y)
    _normalize_xy(coords)

    order = {node: i for i, node in enumerate(node_ids)}
    flat_edges: list[int] = []
    for a, b in edges:
        if a in order and b in order:
            flat_edges.append(order[a])
            flat_edges.append(order[b])

    layout_bytes = struct.pack(f"<{len(coords)}f", *coords) if coords else b""
    edges_bytes = struct.pack(f"<{len(flat_edges)}I", *flat_edges) if flat_edges else b""
    return {
        "count": len(node_ids),
        "edge_count": len(flat_edges) // 2,
        "layout_b64": base64.b64encode(layout_bytes).decode("ascii"),
        "edges_b64": base64.b64encode(edges_bytes).decode("ascii"),
    }


def _network_positions(graph: nx.Graph, node_ids: list[Any], seed: int) -> dict[Any, Any]:
    if not node_ids:
        return {}
    if len(node_ids) <= _SPRING_MAX:
        try:
            return dict(nx.spring_layout(graph, seed=seed, dim=2))
        except Exception:  # pragma: no cover - layout best effort, fall back
            pass
    return dict(nx.random_layout(graph, seed=seed))


def _normalize_xy(coords: list[float]) -> None:
    """Min-max normalize x and y independently into [0,1] (in place)."""
    count = len(coords) // 2
    if count == 0:
        return
    for offset in (0, 1):
        axis = coords[offset::2]
        lo = min(axis)
        hi = max(axis)
        span = hi - lo
        if span < 1e-9:
            for i in range(count):
                coords[2 * i + offset] = 0.5
        else:
            for i in range(count):
                coords[2 * i + offset] = (coords[2 * i + offset] - lo) / span


# ---- stateful encoder (full first, then delta) ---------------------------


class FrameEncoder:
    """Turns successive SpaceSnapshots into binary frames, choosing full vs delta.

    The first frame (and any frame whose change ratio exceeds `delta_max_ratio`,
    or whose buffer length changes) is sent full; otherwise a compact delta.
    """

    def __init__(
        self,
        space: str,
        palette: list[str],
        *,
        width: int = 0,
        height: int = 0,
        delta_max_ratio: float = 0.5,
    ) -> None:
        self.space = space
        self.palette = palette
        self.index = {state: i for i, state in enumerate(palette)}
        self.width = width
        self.height = height
        self._delta_max_ratio = delta_max_ratio
        self._prev: bytearray | None = None

    def encode(self, snapshot: SpaceSnapshot) -> bytes:
        if self.space == "grid":
            states = grid_states(snapshot.payload, self.index, self.width, self.height)
        else:
            states = points_states(snapshot.payload, self.index)

        prev = self._prev
        self._prev = states
        if prev is None or len(prev) != len(states):
            return self._encode_full(snapshot.tick, states)

        changes = diff_states(prev, states)
        if len(changes) > self._delta_max_ratio * max(1, len(states)):
            return self._encode_full(snapshot.tick, states)
        return encode_delta(snapshot.tick, changes)

    def _encode_full(self, tick: int, states: bytearray) -> bytes:
        if self.space == "grid":
            return encode_full_grid(tick, states)
        return encode_full_points(tick, states)


__all__ = [
    "EMPTY_STATE",
    "KIND_DELTA",
    "KIND_GRID_FULL",
    "KIND_POINTS_FULL",
    "FrameEncoder",
    "apply_delta",
    "build_network_meta",
    "build_palette",
    "decode_frame",
    "diff_states",
    "encode_delta",
    "encode_full_grid",
    "encode_full_points",
    "grid_states",
    "points_states",
]
