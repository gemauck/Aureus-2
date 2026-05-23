"""Unit tests for dispense exception rule engine."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'scripts', 'dispense-exception-audit'))

from exceptionRules import compute_all, match_rate  # noqa: E402
from parseWorkbook import load_workbook  # noqa: E402

SAMPLE_PATH = os.environ.get(
    'DISPENSE_EXCEPTION_SAMPLE',
    '/Users/gemau/Downloads/Exxaro Belfast Mine - Transaction Exceptions - In Context - Apr 2026.xlsx',
)


@unittest.skipUnless(os.path.isfile(SAMPLE_PATH), 'sample workbook not available')
class DispenseExceptionRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_workbook(SAMPLE_PATH)
        cls.transactions = cls.data['transactions']
        cls.computed = compute_all(cls.transactions)

    def test_transaction_count(self):
        self.assertGreater(len(self.transactions), 3000)

    def test_exception_60_match_rate(self):
        result = match_rate(self.transactions, self.computed, 'exception_60')
        self.assertGreaterEqual(result['match_pct'], 99.0)
        self.assertEqual(result['total_flagged'], 392)

    def test_exception_120_match_rate(self):
        result = match_rate(self.transactions, self.computed, 'exception_120')
        self.assertGreaterEqual(result['match_pct'], 99.0)

    def test_initial_dispense_non_eligible(self):
        non_eligible = [t for t in self.transactions if t.get('refund_eligibility') == 'Non-Eligible']
        self.assertEqual(len(non_eligible), 3)
        for row in non_eligible:
            comp = self.computed[str(row['transaction_id'])]
            self.assertTrue(comp.flags.initial_dispense)


if __name__ == '__main__':
    unittest.main()
