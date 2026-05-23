"""Unit tests for dispense exception decision audit."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'scripts', 'dispense-exception-audit'))

from auditDecisions import run_all_audits  # noqa: E402
from parseWorkbook import load_workbook  # noqa: E402

SAMPLE_PATH = os.environ.get(
    'DISPENSE_EXCEPTION_SAMPLE',
    '/Users/gemau/Downloads/Exxaro Belfast Mine - Transaction Exceptions - In Context - Apr 2026.xlsx',
)


@unittest.skipUnless(os.path.isfile(SAMPLE_PATH), 'sample workbook not available')
class DispenseExceptionAuditTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_workbook(SAMPLE_PATH)
        cls.result = run_all_audits(cls.data)

    def test_exception_recompute_full_match(self):
        self.assertGreaterEqual(self.result['summary']['exception_match_pct'], 99.0)

    def test_review_queue_count(self):
        self.assertEqual(self.result['summary']['review_queue_count'], 10)

    def test_no_abco_comment_errors(self):
        comment_errors = [
            f for f in self.result['findings']
            if f['check'] == 'abco_comment' and f['severity'] == 'error'
        ]
        self.assertEqual(len(comment_errors), 0)

    def test_non_eligible_pass_eligibility_audit(self):
        errors = [
            f for f in self.result['findings']
            if f['check'] == 'refund_eligibility' and f['severity'] == 'error'
        ]
        self.assertEqual(len(errors), 0)


if __name__ == '__main__':
    unittest.main()
