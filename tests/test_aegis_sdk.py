"""Offline unit tests for the Aegis Python SDK (no network)."""
import sys, os, unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from aegis_sdk import AegisClient, AegisUnavailable, AegisError

class SdkTests(unittest.TestCase):
    def _client(self):
        return AegisClient(api_key="agk_test")

    def test_audit_sends_idempotency_header(self):
        c = self._client()
        with patch("aegis_sdk.requests.post") as p:
            p.return_value = MagicMock(status_code=200, json=lambda: {"status": "APPROVED", "auditId": "a1"})
            v = c.audit(750, "KES")
            self.assertEqual(v["status"], "APPROVED")
            headers = p.call_args.kwargs["headers"]
            self.assertIn("x-idempotency-key", headers)
            self.assertEqual(headers["Authorization"], "Bearer agk_test")

    def test_audit_denied_raises(self):
        c = self._client()
        with patch("aegis_sdk.requests.post") as p:
            p.return_value = MagicMock(status_code=403, json=lambda: {"status": "BLOCKED", "reason": "over limit"})
            with self.assertRaises(AegisError):
                c.audit(99999999)

    def test_unreachable_raises_unavailable_never_approves(self):
        c = self._client()
        import requests as _r
        with patch("aegis_sdk.requests.post", side_effect=_r.ConnectionError("boom")):
            with self.assertRaises(AegisUnavailable):
                c.audit(10)

    def test_reversal_sends_warrant_id(self):
        c = self._client()
        with patch("aegis_sdk.requests.post") as p:
            p.return_value = MagicMock(status_code=200, json=lambda: {"status": "REVERSED"})
            v = c.reverse("aegis_wt_123", reason="dispute")
            self.assertEqual(v["status"], "REVERSED")
            self.assertEqual(p.call_args.kwargs["json"]["warrantId"], "aegis_wt_123")

    def test_verify_agent_unknown(self):
        with patch("aegis_sdk.requests.get") as g:
            g.return_value = MagicMock(ok=False, status_code=404)
            r = AegisClient.verify_agent("aegis_ag_missing")
            self.assertEqual(r, {"registered": False, "status": "UNKNOWN"})

if __name__ == "__main__":
    unittest.main()
