"""Binary snapshot encoding round-trips + delta application (P1 Task 1).

These cover the wire format the desktop decoder mirrors byte-for-byte
(desktop/src/abm/canvas/frameFormat.ts). Pure functions, no model build.
"""

from __future__ import annotations

import base64
import struct

from abm_kernel import build_model, build_space_snapshot
from abm_kernel.models import opinion_model_config, sir_model_config
from abm_kernel.space_binary import (
    EMPTY_STATE,
    KIND_DELTA,
    KIND_GRID_FULL,
    KIND_POINTS_FULL,
    FrameEncoder,
    apply_delta,
    build_network_meta,
    build_palette,
    decode_frame,
    diff_states,
    encode_delta,
    encode_full_grid,
    encode_full_points,
    grid_states,
    points_states,
)


def test_points_full_round_trip() -> None:
    frame = decode_frame(encode_full_points(5, [0, 1, 2, 1]))
    assert frame["kind"] == KIND_POINTS_FULL
    assert frame["tick"] == 5
    assert frame["state"] == [0, 1, 2, 1]


def test_grid_full_round_trip() -> None:
    states = [0, EMPTY_STATE, 2, 1]
    frame = decode_frame(encode_full_grid(3, states))
    assert frame["kind"] == KIND_GRID_FULL
    assert frame["tick"] == 3
    assert frame["state"] == states


def test_delta_round_trip_and_apply() -> None:
    frame = decode_frame(encode_delta(9, [(1, 3), (3, 2)]))
    assert frame["kind"] == KIND_DELTA
    assert frame["tick"] == 9
    assert frame["changes"] == [(1, 3), (3, 2)]

    state = bytearray([0, 0, 0, 0])
    apply_delta(state, frame["changes"])
    assert list(state) == [0, 3, 0, 2]


def test_diff_then_apply_equals_full() -> None:
    prev = bytearray([0, 0, 1, 1])
    new = bytearray([0, 2, 1, 0])
    changes = diff_states(prev, new)
    assert changes == [(1, 2), (3, 0)]
    rebuilt = apply_delta(bytearray(prev), changes)
    assert list(rebuilt) == list(new)


def test_build_palette_from_categorical_choices_is_sorted() -> None:
    palette = build_palette(sir_model_config())
    assert palette == ["infected", "recovered", "susceptible"]


def test_build_palette_unions_extra_states() -> None:
    palette = build_palette(sir_model_config(), {"infected", "dead", None})
    assert palette == ["dead", "infected", "recovered", "susceptible"]


def test_build_palette_bins_continuous_states() -> None:
    palette = build_palette(opinion_model_config(population=20))

    assert len(palette) == 10
    assert palette[0].startswith("opinion: 0.00-0.10")
    assert palette[-1].startswith("opinion: 0.90-1.00")


def test_continuous_network_states_remain_visible_after_updates() -> None:
    cfg = opinion_model_config(population=40, network_p=0.2)
    model = build_model(cfg, seed=12)
    model.setup()
    initial = build_space_snapshot(model)
    palette = build_palette(cfg, {node["state"] for node in initial.payload["nodes"]})
    index = {state: i for i, state in enumerate(palette)}

    for _ in range(8):
        model.step()

    later = build_space_snapshot(model)
    states = points_states(later.payload, index)

    assert states
    assert all(state != EMPTY_STATE for state in states)


def test_grid_states_row_major_with_empty_fill() -> None:
    index = {"a": 0, "b": 1}
    payload = {
        "width": 3,
        "height": 2,
        "cells": [
            {"x": 0, "y": 0, "state": "a"},
            {"x": 2, "y": 1, "state": "b"},
            {"x": 1, "y": 0, "state": None},
        ],
    }
    states = grid_states(payload, index, 3, 2)
    # index = y*width + x
    assert states[0] == 0  # (0,0)=a
    assert states[1] == EMPTY_STATE  # (1,0)=None
    assert states[5] == 1  # (2,1)=b
    assert len(states) == 6


def test_points_states_in_node_order() -> None:
    index = {"S": 0, "I": 1}
    payload = {
        "nodes": [{"id": 0, "state": "S"}, {"id": 1, "state": "I"}, {"id": 2, "state": None}]
    }
    assert list(points_states(payload, index)) == [0, 1, EMPTY_STATE]


class _Snap:
    def __init__(self, tick: int, space: str, payload: dict) -> None:
        self.tick = tick
        self.space = space
        self.payload = payload


def _nodes(states: list[str]) -> dict:
    return {"nodes": [{"id": i, "state": s} for i, s in enumerate(states)]}


def test_encoder_emits_full_then_delta() -> None:
    palette = ["S", "I"]
    enc = FrameEncoder("network", palette)

    first = enc.encode(_Snap(0, "network", _nodes(["S", "S"])))
    assert decode_frame(first)["kind"] == KIND_POINTS_FULL

    second = enc.encode(_Snap(1, "network", _nodes(["I", "S"])))
    decoded = decode_frame(second)
    assert decoded["kind"] == KIND_DELTA
    assert decoded["changes"] == [(0, 1)]


def test_encoder_falls_back_to_full_when_change_ratio_high() -> None:
    palette = ["S", "I"]
    enc = FrameEncoder("network", palette, delta_max_ratio=0.25)
    enc.encode(_Snap(0, "network", _nodes(["S", "S", "S", "S"])))
    # Flip 3/4 nodes -> exceeds 25% ratio -> full frame.
    frame = enc.encode(_Snap(1, "network", _nodes(["I", "I", "I", "S"])))
    assert decode_frame(frame)["kind"] == KIND_POINTS_FULL


def test_build_network_meta_layout_normalized_and_aligned() -> None:
    node_ids = [0, 1, 2, 3]
    edges = [[0, 1], [1, 2], [2, 3]]
    meta = build_network_meta(node_ids, edges, seed=7)

    assert meta["count"] == 4
    assert meta["edge_count"] == 3

    layout = struct.unpack("<8f", base64.b64decode(meta["layout_b64"]))
    assert len(layout) == 8  # x,y per node
    assert min(layout) >= 0.0 and max(layout) <= 1.0

    edge_idx = struct.unpack("<6I", base64.b64decode(meta["edges_b64"]))
    assert list(edge_idx) == [0, 1, 1, 2, 2, 3]


def test_build_network_meta_is_deterministic_for_seed() -> None:
    node_ids = [0, 1, 2, 3, 4]
    edges = [[0, 1], [1, 2], [3, 4]]
    a = build_network_meta(node_ids, edges, seed=11)
    b = build_network_meta(node_ids, edges, seed=11)
    assert a == b
