"""Read labelBatches + rulesResults JSON from stdin; print merged strength JSON to stdout."""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from poaStrengthEvaluator import summarize_strength_results
from poaStrengthLLM import evaluate_labels_with_llm


def main() -> None:
    payload = json.load(sys.stdin)
    label_batches = payload.get("labelBatches") or {}
    rules_results = payload.get("rulesResults") or {}
    cache_dir = os.environ.get("POA_STRENGTH_CACHE_DIR") or None

    merged = evaluate_labels_with_llm(label_batches, rules_results, cache_dir=cache_dir)

    out_results = {}
    for label, res in merged.items():
        out_results[label] = {
            "criteria": res.get("criteria"),
            "score": res.get("score"),
            "strength": res.get("strength"),
            "shortfalls": res.get("shortfalls", []),
            "method": res.get("method", "rules"),
        }

    print(
        json.dumps(
            {
                "labelResults": out_results,
                "strengthSummary": summarize_strength_results(merged),
                "usedLlm": any(r.get("method") == "llm" for r in merged.values()),
            }
        )
    )


if __name__ == "__main__":
    main()
