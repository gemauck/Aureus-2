"""Unit tests for POA batch strength rules evaluator."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "poa-review"))

from poaStrengthEvaluator import (
    aggregate_proof_batch,
    detect_sector,
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
    assert "Primary mining activity identified" in joined
    assert result["sector"] == "mining"


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


def test_forestry_harvesting_strong():
    rules = load_rules()
    batch = {
        "proofCount": 1,
        "activities": ["felling and extraction to roadside"],
        "locations": ["compartment 12 plantation"],
        "materials": ["timber logs"],
        "comments": [],
        "sources": [],
        "intensityValues": {"Total SMR Usage": 6.0},
        "combinedText": "felling and extraction to roadside | compartment 12 plantation | timber logs",
    }
    result = evaluate_batch_rules(batch, rules)
    assert result["sector"] == "forestry"
    assert result["criteria"]["activity"] is True
    assert result["strength"] == STRENGTH_STRONG


def test_farming_harvest_strong():
    rules = load_rules()
    batch = {
        "proofCount": 1,
        "activities": ["baler baling hay"],
        "locations": ["north field farm"],
        "materials": ["hay"],
        "comments": [],
        "sources": [],
        "intensityValues": {"Total SMR Usage": 4.0},
        "combinedText": "baler baling hay | north field farm | hay",
    }
    result = evaluate_batch_rules(batch, rules)
    assert result["sector"] == "farming"
    assert result["criteria"]["activity"] is True
    assert result["strength"] == STRENGTH_STRONG


def test_detect_sector_forestry_over_mining_default():
    rules = load_rules()
    batch = {
        "proofCount": 1,
        "activities": ["thinning compartment"],
        "locations": ["pine plantation"],
        "materials": ["pulpwood"],
        "comments": [],
        "sources": [],
        "intensityValues": {},
        "combinedText": "thinning compartment | pine plantation | pulpwood",
    }
    ctx = detect_sector(batch, rules)
    assert ctx["sector"] == "forestry"


def test_initial_schedule6_terms_still_match_after_spreadsheet_merge():
    rules = load_rules()
    assert "exploration" in (rules["sectors"]["mining"].get("primaryActivities") or [])
    batch = {
        "proofCount": 1,
        "activities": ["exploration drilling on site"],
        "locations": ["north pit"],
        "materials": ["coal"],
        "comments": [],
        "fieldSnippets": [],
        "sources": [],
        "intensityValues": {"Total SMR Usage": 2.0},
        "combinedText": "exploration drilling on site | north pit | coal",
        "holisticText": "exploration drilling on site | coal | north pit",
    }
    result = evaluate_batch_rules(batch, rules)
    assert result["criteria"]["activity"] is True


def test_flex_match_similar_activity_names():
    rules = load_rules()
    for activity in (
        "LOAD & HAUL",
        "loading and hauling",
        "Drill and Blast",
        "TRANSPORT MATERIAL",
    ):
        batch = {
            "proofCount": 1,
            "activities": [activity.lower()],
            "locations": ["north pit"],
            "materials": ["coal"],
            "comments": [],
            "fieldSnippets": [],
            "sources": [],
            "intensityValues": {"Total SMR Usage": 3.0},
            "combinedText": f"{activity.lower()} | north pit | coal",
            "holisticText": f"{activity.lower()} | coal | north pit",
        }
        result = evaluate_batch_rules(batch, rules)
        assert result["criteria"]["activity"] is True, activity


def test_holistic_transport_coal_pit_inferred_haul():
    """Activity column alone may say 'transport'; coal + pit + haul wording = primary mining."""
    rules = load_rules()
    batch = aggregate_proof_batch(
        pd.DataFrame(
            [
                {
                    "Transaction ID": "",
                    "Asset Number": "870-R",
                    "Date & Time": "2026-04-02 06:00:00",
                    "Activity": "transporting materials",
                    "Location.1": "north pit",
                    "Material": "coal",
                    "Total SMR Usage": 12,
                    "Loads / Tonnes": 4,
                }
            ]
        )
    )
    result = evaluate_batch_rules(batch, rules)
    assert result["criteria"]["activity"] is True
    assert result["criteria"]["material"] is True
    assert result["criteria"]["location"] is True
    assert result["strength"] in (STRENGTH_STRONG, STRENGTH_MODERATE)


def test_holistic_reads_non_standard_proof_columns():
    rules = load_rules()
    batch = aggregate_proof_batch(
        pd.DataFrame(
            [
                {
                    "Transaction ID": "",
                    "Asset Number": "DT-2",
                    "Date & Time": "2026-04-03 07:00:00",
                    "Activity": "Transporting Materials",
                    "Location.1": "south pit",
                    "Material": "rom coal",
                    "Equipment Type": "Dump Truck",
                    "Total SMR Usage": 6,
                }
            ]
        )
    )
    assert "dump truck" in batch.get("holisticText", "")
    result = evaluate_batch_rules(batch, rules)
    assert result["criteria"]["activity"] is True


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


def test_refuelling_diesel_not_eligible():
    rules = load_rules()
    batch = aggregate_proof_batch(
        pd.DataFrame(
            [
                {
                    "Transaction ID": "",
                    "Asset Number": "BOW-1",
                    "Date & Time": "2026-04-01 08:00:00",
                    "Activity": "Refuelling diesel",
                    "Location.1": "north pit",
                    "Material": "diesel",
                    "Total SMR Usage": 2,
                }
            ]
        )
    )
    result = evaluate_batch_rules(batch, rules)
    assert result["criteria"]["activity"] is False
    assert any("refuel" in s.lower() or "diesel" in s.lower() for s in result["shortfalls"])


def test_refuelling_water_eligible():
    rules = load_rules()
    batch = aggregate_proof_batch(
        pd.DataFrame(
            [
                {
                    "Transaction ID": "",
                    "Asset Number": "BOW-2",
                    "Date & Time": "2026-04-01 09:00:00",
                    "Activity": "Refuelling water",
                    "Location.1": "south pit",
                    "Material": "water",
                    "Total SMR Usage": 3,
                }
            ]
        )
    )
    result = evaluate_batch_rules(batch, rules)
    assert result["criteria"]["activity"] is True
    assert result["strength"] in (STRENGTH_STRONG, STRENGTH_MODERATE, STRENGTH_WEAK)


def test_breakdown_maint_not_eligible_activity():
    rules = load_rules()
    batch = aggregate_proof_batch(
        pd.DataFrame(
            [
                {
                    "Transaction ID": "",
                    "Asset Number": "BD-1",
                    "Date & Time": "2026-04-01 08:00:00",
                    "Activity": "Breakdown / Maint",
                    "Comments": "Day-Shift-A",
                    "Source": "Activity Report Mc",
                    "Custom Attribute": "Operator: Breakdown",
                    "Location.1": "Pit 4&5",
                    "Opening SMR": 406778,
                    "Closing SMR": 406778,
                }
            ]
        )
    )
    result = evaluate_batch_rules(batch, rules)
    assert result["criteria"]["activity"] is False
    assert not any("Primary mining activity identified" in p for p in result["compliancePoints"])
    assert any("breakdown" in s.lower() or "non-operational" in s.lower() for s in result["shortfalls"])


def test_standby_idle_not_eligible():
    rules = load_rules()
    batch = aggregate_proof_batch(
        pd.DataFrame(
            [
                {
                    "Transaction ID": "",
                    "Asset Number": "SB-1",
                    "Date & Time": "2026-04-01 12:00:00",
                    "Activity": "Standby / Idle",
                    "Location.1": "north pit",
                    "Material": "coal",
                    "Total SMR Usage": 1,
                }
            ]
        )
    )
    result = evaluate_batch_rules(batch, rules)
    assert result["criteria"]["activity"] is False


def test_asset_name_without_activity_not_eligible():
    rules = load_rules()
    batch = aggregate_proof_batch(
        pd.DataFrame(
            [
                {
                    "Transaction ID": "",
                    "Asset Number": "HM400-1",
                    "Date & Time": "2026-04-01 11:00:00",
                    "Activity": "",
                    "Asset Description": "KOMATSU-HM400-ADT",
                    "Equipment Type": "Dump Truck",
                    "Opening SMR": 15908,
                    "Closing SMR": 15908,
                }
            ]
        )
    )
    result = evaluate_batch_rules(batch, rules)
    assert result["criteria"]["activity"] is False
    assert any(
        "asset" in s.lower() or "equipment" in s.lower() or "operation" in s.lower()
        for s in result["shortfalls"]
    )
    joined_points = " ".join(result.get("compliancePoints") or [])
    assert "Primary mining activity identified (KOMATSU" not in joined_points


def test_diesel_bowser_activity_excluded():
    rules = load_rules()
    batch = {
        "proofCount": 1,
        "activities": ["diesel bowser"],
        "locations": ["north pit"],
        "materials": ["diesel"],
        "comments": [],
        "sources": [],
        "intensityValues": {"Total SMR Usage": 1.0},
        "combinedText": "diesel bowser | north pit | diesel",
        "holisticText": "diesel bowser | north pit | diesel",
    }
    result = evaluate_batch_rules(batch, rules)
    assert result["criteria"]["activity"] is False


if __name__ == "__main__":
    test_strong_batch_all_criteria()
    test_insufficient_no_proof()
    test_weak_secondary_plant_only()
    test_evaluate_all_labels_dataframe()
    test_primary_activities_dozer_grading_dewatering()
    test_forestry_harvesting_strong()
    test_farming_harvest_strong()
    test_detect_sector_forestry_over_mining_default()
    test_initial_schedule6_terms_still_match_after_spreadsheet_merge()
    test_flex_match_similar_activity_names()
    test_holistic_transport_coal_pit_inferred_haul()
    test_holistic_reads_non_standard_proof_columns()
    test_shift_day_fallback_second_dispense()
    test_refuelling_diesel_not_eligible()
    test_refuelling_water_eligible()
    test_diesel_bowser_activity_excluded()
    test_asset_name_without_activity_not_eligible()
    test_breakdown_maint_not_eligible_activity()
    test_standby_idle_not_eligible()
    print("All POA strength evaluator tests passed.")
