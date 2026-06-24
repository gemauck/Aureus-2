"""Load configurable site rule profiles for review escalation."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

RULES_PATH = Path(__file__).resolve().parent / "site_rules.json"


@dataclass
class SiteRuleProfile:
    key: str
    label: str
    escalate_fill_outside: bool = True
    escalate_odo_le_zero: bool = True
    escalate_odo_gt_50: bool = True
    escalate_split_fill_chain: bool = True
    escalate_avr_sync: bool = True
    respect_abco_ok: bool = True
    economy_escalation: bool = False
    economy_variance_threshold: float = 0.6

    @classmethod
    def from_dict(cls, key: str, data: dict[str, Any]) -> SiteRuleProfile:
        return cls(
            key=key,
            label=str(data.get("label") or key),
            escalate_fill_outside=bool(data.get("escalate_fill_outside", True)),
            escalate_odo_le_zero=bool(data.get("escalate_odo_le_zero", True)),
            escalate_odo_gt_50=bool(data.get("escalate_odo_gt_50", True)),
            escalate_split_fill_chain=bool(data.get("escalate_split_fill_chain", True)),
            escalate_avr_sync=bool(data.get("escalate_avr_sync", True)),
            respect_abco_ok=bool(data.get("respect_abco_ok", True)),
            economy_escalation=bool(data.get("economy_escalation", False)),
            economy_variance_threshold=float(data.get("economy_variance_threshold", 0.6)),
        )


def load_site_rules(path: str | Path | None = None) -> dict[str, Any]:
    rules_path = Path(path) if path else RULES_PATH
    return json.loads(rules_path.read_text(encoding="utf-8"))


def get_site_profile(profile_key: str | None = None, rules_path: str | None = None) -> SiteRuleProfile:
    data = load_site_rules(rules_path)
    key = profile_key or data.get("default_profile") or "belfast"
    profiles = data.get("profiles") or {}
    if key not in profiles:
        key = data.get("default_profile") or next(iter(profiles), "belfast")
    return SiteRuleProfile.from_dict(key, profiles.get(key, {}))


def list_site_profiles(rules_path: str | None = None) -> list[dict[str, str]]:
    data = load_site_rules(rules_path)
    profiles = data.get("profiles") or {}
    return [{"key": key, "label": str(value.get("label") or key)} for key, value in profiles.items()]
