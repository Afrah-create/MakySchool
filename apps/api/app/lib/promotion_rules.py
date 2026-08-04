"""
Structural promotion rules for year-end rollover.

Industry-standard defaults for Uganda primary/secondary ladders:
- Promote to the next level in the same stream when a target class exists.
- Graduate at terminal levels (P7, S4 O-Level, S6 A-Level).
- S5 after O-Level is NEVER automatic — schools enroll manually.
- Repeat / override is an admin decision; defaults never force repeat.

Tracks are separate: primary wizard vs secondary wizard.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PromotionAction = Literal["promote", "graduate", "manual_next", "no_path"]
RolloverTrack = Literal["primary", "secondary"]

PRIMARY_LEVELS: tuple[str, ...] = ("P1", "P2", "P3", "P4", "P5", "P6", "P7")
O_LEVEL_LEVELS: tuple[str, ...] = ("S1", "S2", "S3", "S4")
A_LEVEL_LEVELS: tuple[str, ...] = ("S5", "S6")
SECONDARY_LEVELS: tuple[str, ...] = O_LEVEL_LEVELS + A_LEVEL_LEVELS

# Explicit next-level map. S4 has no automatic next (manual S5 enrollment).
_NEXT_LEVEL: dict[str, str | None] = {
    "P1": "P2",
    "P2": "P3",
    "P3": "P4",
    "P4": "P5",
    "P5": "P6",
    "P6": "P7",
    "P7": None,  # graduate primary
    "S1": "S2",
    "S2": "S3",
    "S3": "S4",
    "S4": None,  # O-Level complete — S5 is manual
    "S5": "S6",
    "S6": None,  # graduate A-Level
}

_GRADUATE_LEVELS = frozenset({"P7", "S4", "S6"})
_MANUAL_NEXT_LEVELS = frozenset({"S4"})  # complete O-Level; S5 enrollment separate


@dataclass(frozen=True)
class PromotionDecision:
    action: PromotionAction
    current_level: str
    next_level: str | None
    reason: str
    requires_manual_enrollment: bool = False


def track_for_level(level: str) -> RolloverTrack | None:
    if level in PRIMARY_LEVELS:
        return "primary"
    if level in SECONDARY_LEVELS:
        return "secondary"
    return None


def levels_for_track(track: RolloverTrack) -> tuple[str, ...]:
    if track == "primary":
        return PRIMARY_LEVELS
    return SECONDARY_LEVELS


def next_level(level: str) -> str | None:
    return _NEXT_LEVEL.get(level)


def default_promotion_decision(level: str, *, track: RolloverTrack) -> PromotionDecision:
    """
    Default structural decision for a class level within a rollover track.

    Admin overrides (repeat / force promote) are applied later in the wizard.
    """
    allowed = levels_for_track(track)
    if level not in allowed:
        return PromotionDecision(
            action="no_path",
            current_level=level,
            next_level=None,
            reason=f"{level} is outside the {track} rollover track.",
        )

    nxt = next_level(level)

    if level in _GRADUATE_LEVELS and nxt is None:
        if level in _MANUAL_NEXT_LEVELS:
            return PromotionDecision(
                action="graduate",
                current_level=level,
                next_level=None,
                reason=(
                    "Completed O-Level (S4). Student graduates from active O-Level rolls. "
                    "S5/A-Level enrollment is manual and not part of this rollover."
                ),
                requires_manual_enrollment=True,
            )
        if level == "P7":
            return PromotionDecision(
                action="graduate",
                current_level=level,
                next_level=None,
                reason="Completed primary (P7). Student is marked graduated.",
            )
        return PromotionDecision(
            action="graduate",
            current_level=level,
            next_level=None,
            reason="Completed A-Level (S6). Student is marked graduated.",
        )

    if nxt is None:
        return PromotionDecision(
            action="no_path",
            current_level=level,
            next_level=None,
            reason=f"No default next class is defined for {level}.",
        )

    return PromotionDecision(
        action="promote",
        current_level=level,
        next_level=nxt,
        reason=f"Promote {level} → {nxt} (same stream when available).",
    )


def map_class_label(level: str, stream: str | None) -> str:
    return f"{level}{stream}" if stream else level
