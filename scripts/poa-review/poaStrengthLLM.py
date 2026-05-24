"""
Optional OpenAI layer for POA batch strength evaluation.
"""
from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from typing import Any

from poaStrengthEvaluator import (
    evaluate_batch_rules,
    load_rules,
    merge_llm_result,
    tier_from_score,
)

DEFAULT_MODEL = "gpt-4o-mini"
CHUNK_SIZE = 18
CACHE_DIR_NAME = "strength-cache"
# Cap LLM calls so large mines do not run for hours / OOM with batch payloads in memory.
MAX_LLM_LABELS = 400


def _cache_dir(base_temp: str | None = None) -> str:
    root = base_temp or os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "..", "uploads", "poa-review-temp"
    )
    path = os.path.join(os.path.abspath(root), CACHE_DIR_NAME)
    os.makedirs(path, exist_ok=True)
    return path


def _batch_cache_key(batch: dict) -> str:
    payload = json.dumps(
        {
            "label": batch.get("label"),
            "activities": batch.get("activities"),
            "locations": batch.get("locations"),
            "materials": batch.get("materials"),
            "intensityValues": batch.get("intensityValues"),
            "combinedText": (batch.get("combinedText") or "")[:2000],
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _read_cache(cache_path: str) -> dict | None:
    if not os.path.isfile(cache_path):
        return None
    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _write_cache(cache_path: str, data: dict) -> None:
    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception:
        pass


def _build_system_prompt(rules: dict) -> str:
    sectors = rules.get("sectors") or {}
    mining = sectors.get("mining", {})
    forestry = sectors.get("forestry", {})
    farming = sectors.get("farming", {})
    return f"""You are an expert South African diesel refund Proof of Activity (POA) evaluator.
Assess whether proof records between fuel dispenses support own primary production under Schedule 6 Part 3 of the Customs and Excise Act.

CRITICAL: Determine sector context first — mining, forestry, or farming — then apply Schedule No. 6, Part 3, Item 670.04, Note 6 for that sector:
- Mining — Note 6, paragraph (f): exploration, overburden removal, mineral recovery/extraction, in-pit load-and-haul, drilling, blasting, dewatering/pumping for the mine, site access roads, tailings/waste on site — NOT post-recovery crushing/beneficiation or off-site processing.
- Forestry — Note 6, paragraph (g): land prep, planting, plantation maintenance, fire breaks, thinning/pruning, felling/harvesting, extraction and carting in the forest — NOT sawmill/chip-mill milling or mill construction.
- Farming — Note 6, paragraph (h): crop/livestock primary production, ploughing/planting/harvesting, irrigation, baling, herding, fence/firebreak work on the farming property — NOT buyer transport or leisure game viewing/lodging.
Refund extent for on-land sectors is Note 6(b)(i).

Common operational POA wording (grading, dozer, pumping, single shift/day entry) may still qualify when clearly tied to eligible primary production for the detected sector.

When proof describes a single shift/day activity entry, it may support multiple dispenses within 24 hours for the same asset; note gaps but do not reject eligible site activities without cause.

For each batch, decide if ANY proof row satisfies each criterion (multi-source proof aggregates):
1. activity — primary Schedule 6 Part 3 production activity for the detected sector (not secondary processing/milling/office-only)
2. location — sector-appropriate production site (mine/pit, forest/plantation, or farm — not only plant/workshop/sawmill as sole location)
3. material — primary sector materials (e.g. ROM/coal/overburden; timber/logs/seedlings; crops/hay/livestock) not only processed product
4. intensity — loads, tonnes, SMR hours, km/hr, bales, or similar usage intensity present

Hint keywords (not exhaustive):
- Mining primary: {", ".join((mining.get("primaryActivities") or [])[:12])}...
- Forestry primary: {", ".join((forestry.get("primaryActivities") or [])[:12])}...
- Farming primary: {", ".join((farming.get("primaryActivities") or [])[:12])}...

Return ONLY valid JSON array. Each element:
{{"label": string, "criteria": {{"activity": bool, "location": bool, "material": bool, "intensity": bool}}, "shortfalls": [string]}}
shortfalls: list human-readable gaps for criteria NOT met; empty array if all met."""


def _openai_chat(api_key: str, system: str, user: str, model: str = DEFAULT_MODEL) -> str:
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]


def _parse_llm_response(content: str) -> list[dict]:
    parsed = json.loads(content)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("results", "batches", "evaluations", "data"):
            if key in parsed and isinstance(parsed[key], list):
                return parsed[key]
        if "label" in parsed:
            return [parsed]
    return []


def evaluate_labels_with_llm(
    label_batches: dict[str, dict],
    rules_results: dict[str, dict],
    *,
    cache_dir: str | None = None,
    model: str = DEFAULT_MODEL,
) -> dict[str, dict]:
    """
    Enhance rules results with LLM where API key available.
    label_batches: label -> aggregate_proof_batch output
    rules_results: label -> evaluate_batch_rules output
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return rules_results

    rules = load_rules()
    cache_root = _cache_dir(cache_dir)
    merged = dict(rules_results)
    labels = [l for l in label_batches.keys() if label_batches[l].get("proofCount", 0) > 0]

    if len(labels) > MAX_LLM_LABELS:
        print(
            f"POA Strength LLM skipped: {len(labels)} proof batches exceeds limit {MAX_LLM_LABELS}. "
            "Using rules-only.",
            flush=True,
        )
        return rules_results

    for i in range(0, len(labels), CHUNK_SIZE):
        chunk_labels = labels[i : i + CHUNK_SIZE]
        chunk_payload = []
        uncached: list[str] = []

        for label in chunk_labels:
            batch = label_batches[label]
            key = _batch_cache_key(batch)
            cache_path = os.path.join(cache_root, f"{key}.json")
            cached = _read_cache(cache_path)
            if cached:
                merged[label] = merge_llm_result(rules_results[label], cached)
            else:
                uncached.append(label)
                chunk_payload.append(
                    {
                        "label": label,
                        "assetNumber": batch.get("assetNumber", ""),
                        "assetDescription": batch.get("assetDescription", ""),
                        "proofCount": batch.get("proofCount", 0),
                        "activities": batch.get("activities", [])[:5],
                        "locations": batch.get("locations", [])[:5],
                        "materials": batch.get("materials", [])[:5],
                        "sources": batch.get("sources", [])[:5],
                        "intensityValues": batch.get("intensityValues", {}),
                        "combinedText": (batch.get("combinedText") or "")[:1500],
                    }
                )

        if not chunk_payload:
            continue

        user_prompt = (
            "Evaluate these POA proof batches. Return JSON: "
            '{"results": [{"label": "...", "criteria": {"activity": true, "location": true, "material": true, "intensity": true}, "shortfalls": []}, ...]}\n\n'
            + json.dumps(chunk_payload, ensure_ascii=False)
        )

        try:
            content = _openai_chat(api_key, _build_system_prompt(rules), user_prompt, model=model)
            items = _parse_llm_response(content)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, KeyError, TimeoutError) as e:
            print(f"POA Strength LLM chunk failed, using rules fallback: {e}", flush=True)
            continue

        by_label = {str(item.get("label")): item for item in items if item.get("label")}

        for label in uncached:
            llm_item = by_label.get(label)
            if not llm_item:
                continue
            criteria = llm_item.get("criteria") or {}
            score = sum(1 for k in ("activity", "location", "material", "intensity") if criteria.get(k))
            llm_norm = {
                "criteria": {
                    "activity": bool(criteria.get("activity")),
                    "location": bool(criteria.get("location")),
                    "material": bool(criteria.get("material")),
                    "intensity": bool(criteria.get("intensity")),
                },
                "shortfalls": llm_item.get("shortfalls") or [],
                "strength": tier_from_score(score),
            }
            merged[label] = merge_llm_result(rules_results[label], llm_norm)
            batch = label_batches[label]
            key = _batch_cache_key(batch)
            cache_path = os.path.join(cache_root, f"{key}.json")
            _write_cache(cache_path, llm_norm)

    return merged
