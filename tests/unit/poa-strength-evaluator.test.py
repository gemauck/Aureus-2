"""Unit tests for POA batch strength rules evaluator."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "poa-review"))

from poaStrengthEvaluator import (
    aggregate_proof_batch,
    evaluate_batch_rules,
    evaluate_all_labels,
    load_rules,
    compliance_points_from_result,
    STRENGTH_INSUFFICIENT,
    STRENGTH_STRONG,
    STRENGTH_MODERATE,
    STRENGTH_WEAK,
)
import pandas as pd


def test_strong_batch_all_criteria():
    rules = load_rules()
    batch = {
        "proofCount": 2,
        "activities": ["load and haul in north pit"],
        "locations": ["north pit"],
        "materials": ["coal rom"],
        "comments": [],
        "sources": ["fms"],
        "intensityValues": {"Loads / Tonnes": 12.0},
        "combinedText": "load and haul in north pit | north pit | coal rom",
        "activityText": "load and haul in north pit",
        "locText": "north pit",
        "matText": "coal rom",
    }
    result = evaluate_batch_rules(batch, rules)
    assert result["strength"] == STRENGTH_STRONG
    assert result["score"] == 4
    assert result["shortfalls"] == []
    assert len(result["compliancePoints"]) >= 4
    joined = " ".join(result["compliancePoints"])
    assert "Primary production activity identified" in joined


def test_insufficient_no_proof():
    rules = load_rules()
    batch = aggregate_proof_batch(pd.DataFrame())
    result = evaluate_batch_rules(batch, rules)
    assert result["strength"] == STRENGTH_INSUFFICIENT
    assert result["score"] == 0


def test_weak_secondary_plant_only():
    rules = load_rules()
    batch = {
        "proofCount": 1,
        "activities": ["crushing at plant"],
        "locations": ["plant"],
        "materials": ["processed coal"],
        "comments": [],
        "sources": [],
        "intensityValues": {},
        "combinedText": "crushing at plant | plant | processed coal",
        "activityText": "crushing at plant",
        "locText": "plant",
        "matText": "processed coal",
    }
    result = evaluate_batch_rules(batch, rules)
    assert result["strength"] in (STRENGTH_WEAK, STRENGTH_INSUFFICIENT)
    assert len(result["shortfalls"]) >= 2


def test_evaluate_all_labels_dataframe():
    rows = [
        {
            "Transaction ID": "T1",
            "Asset Number": "A1",
            "Date & Time": "2026-04-01 10:00:00",
            "Activity": "",
            "Location.1": "",
            "Material": "",
            "Source": "",
            "Total SMR Usage": 0,
            "Loads / Tonnes": 0,
        },
        {
            "Transaction ID": "",
            "Asset Number": "A1",
            "Date & Time": "2026-04-01 09:00:00",
            "Activity": "load and haul",
            "Location.1": "north pit",
            "Material": "coal",
            "Source": "fms",
            "Total SMR Usage": 5,
            "Loads / Tonnes": 3,
        },
    ]
    df = pd.DataFrame(rows)
    df["Date & Time"] = pd.to_datetime(df["Date & Time"], errors="coerce")
    txn_id_str = df["Transaction ID"].astype(str).str.strip()
    txn_mask = df["Transaction ID"].notna() & (txn_id_str != "") & (txn_id_str != "Transaction ID")
    proof_mask = (~txn_mask) & df["Asset Number"].notna()
    df["label"] = "A1-1"
    results = evaluate_all_labels(df, proof_mask, txn_mask)
    assert "A1-1" in results
    assert results["A1-1"]["strength"] == STRENGTH_STRONG
    assert compliance_points_from_result(results["A1-1"])
    assert results["A1-1"]["shortfalls"] == [] or isinstance(results["A1-1"]["shortfalls"], list)


def test_primary_activities_dozer_grading_dewatering():
    rules = load_rules()
    for activity in ("Dozer 2 Seam MB", "Grading", "Dewatering", "Pumping water"):
        batch = {
            "proofCount": 1,
            "activities": [activity.lower()],
            "locations": ["north pit"],
            "materials": ["coal"],
            "comments": [],
            "sources": [],
            "intensityValues": {"Total SMR Usage": 2.0},
            "combinedText": f"{activity.lower()} | north pit | coal",
        }
        result = evaluate_batch_rules(batch, rules)
        assert result["criteria"]["activity"] is True, activity


def test_shift_day_fallback_second_dispense():
    rows = [
        {
            "Transaction ID": "",
            "Asset Number": "870-R",
            "Date & Time": "2026-04-02 00:00:00",
            "Activity": "Loading 2 Seam MB",
            "Location.1": "north pit",
            "Material": "coal",
            "Total SMR Usage": 8,
        },
        {
            "Transaction ID": "T1",
            "Asset Number": "870-R",
            "Date & Time": "2026-04-02 08:48:37",
            "Activity": "",
        },
        {
            "Transaction ID": "T2",
            "Asset Number": "870-R",
            "Date & Time": "2026-04-02 16:39:19",
            "Activity": "",
        },
    ]
    df = pd.DataFrame(rows)
    df["Date & Time"] = pd.to_datetime(df["Date & Time"], errors="coerce")
    txn_id_str = df["Transaction ID"].astype(str).str.strip()
    txn_mask = df["Transaction ID"].notna() & (txn_id_str != "") & (txn_id_str != "Transaction ID")
    proof_mask = (~txn_mask) & df["Asset Number"].notna()
    df.loc[txn_mask & (df["Transaction ID"] == "T1"), "label"] = "870-R-1"
    df.loc[txn_mask & (df["Transaction ID"] == "T2"), "label"] = "870-R-2"
    df.loc[proof_mask, "label"] = "870-R-1"

    results = evaluate_all_labels(df, proof_mask, txn_mask)
    assert results["870-R-2"].get("shiftProofApplied") is True
    assert results["870-R-2"]["strength"] != STRENGTH_INSUFFICIENT
    assert any("shift/day" in s.lower() or "verify applicability" in s.lower() for s in results["870-R-2"]["shortfalls"])


if __name__ == "__main__":
    test_strong_batch_all_criteria()
    test_insufficient_no_proof()
    test_weak_secondary_plant_only()
    test_evaluate_all_labels_dataframe()
    test_primary_activities_dozer_grading_dewatering()
    test_shift_day_fallback_second_dispense()
    print("All POA strength evaluator tests passed.")
