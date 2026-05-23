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
    return f"""You are an expert South African diesel refund Proof of Activity (POA) evaluator.
Assess whether proof records between fuel dispenses support primary production under Schedule 6 of the Customs and Excise Act.

Primary production includes in-pit mining, extraction, load-and-haul, drilling, blasting, stripping, overburden removal, grading, dozer/dozing, dewatering, and pumping — NOT secondary plant processing, crushing-only, or workshop activity.

When proof describes a single shift/day activity entry, it may support multiple dispenses within 24 hours for the same asset; note gaps but do not reject grading, dozer, dewatering, or pumping as non-primary when clearly at the mine face or pit.

For each batch, decide if ANY proof row satisfies each criterion (multi-source proof aggregates):
1. activity — primary Schedule 6 production activity (not secondary processing/crushing/plant-only)
2. location — mine/pit area (not Plant, Workshop, Crusher, processing plant as the only location)
3. material — primary materials (coal, ROM, overburden, hards, softs) not only processed product
4. intensity — loads, tonnes, SMR hours, km/hr, or similar usage intensity present

Hint keywords (not exhaustive):
- Primary activities: {", ".join(rules.get("primaryActivities", [])[:15])}...
- Secondary activities: {", ".join(rules.get("secondaryActivities", [])[:10])}...
- Primary locations: {", ".join(rules.get("primaryLocations", [])[:12])}...
- Secondary locations: {", ".join(rules.get("secondaryLocations", [])[:10])}...

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
