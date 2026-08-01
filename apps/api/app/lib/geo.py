"""Geospatial helpers for teacher attendance geofencing."""

from __future__ import annotations

import math


def haversine_distance(
    lat1: float,
    lng1: float,
    lat2: float,
    lng2: float,
) -> float:
    """Distance in metres between two WGS84 coordinates (Haversine)."""
    r = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def is_within_fence(
    teacher_lat: float,
    teacher_lng: float,
    school_lat: float,
    school_lng: float,
    radius_metres: int,
) -> tuple[bool, float]:
    """Return (within_fence, distance_metres)."""
    distance = haversine_distance(teacher_lat, teacher_lng, school_lat, school_lng)
    return distance <= radius_metres, round(distance, 2)
