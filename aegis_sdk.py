"""Aegis Policy Gate Python SDK.

The official client for agents that move money on M-Pesa.
Every transaction is checked against a live policy before settlement.

    from aegis_sdk import AegisClient
    aegis = AegisClient(api_key="agk_...")
    verdict = aegis.audit(amount=750, currency="KES")
    if verdict["status"] == "APPROVED":
        settle = aegis.settle(verdict["warrant"], payer_phone="254700000000")

Zero dependencies beyond `requests`. Fail-closed: if Aegis is unreachable,
audit() raises AegisUnavailable — never treat that as approval.
"""
import time
import uuid

import requests


class AegisError(Exception):
    """Aegis refused the request (policy breach, auth failure, replay...)."""


class AegisUnavailable(AegisError):
    """Aegis could not be reached. Fail-closed: do NOT proceed with the payment."""


class AegisClient:
    def __init__(self, base_url="https://aegis-agent-4u79.onrender.com", api_key=None, timeout=10):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.agent_id = None

    @staticmethod
    def register(name, base_url="https://aegis-agent-4u79.onrender.com", policy_limit_kes=None, timeout=10):
        """Register a new agent and return (client, api_key). The key is shown ONCE."""
        body = {"name": name}
        if policy_limit_kes is not None:
            body["policyLimitKES"] = policy_limit_kes
        r = requests.post(f"{base_url.rstrip('/')}/api/agents/register", json=body, timeout=timeout)
        if r.status_code != 201:
            raise AegisError(f"registration failed: {r.status_code} {r.text[:200]}")
        data = r.json()
        client = AegisClient(base_url=base_url, api_key=data["apiKey"], timeout=timeout)
        client.agent_id = data["agentId"]
        return client, data["apiKey"]

    def _post(self, path, payload, extra_headers=None):
        headers = {"Authorization": f"Bearer {self.api_key}"}
        if extra_headers:
            headers.update(extra_headers)
        try:
            r = requests.post(f"{self.base_url}{path}", json=payload, headers=headers, timeout=self.timeout)
        except requests.RequestException as exc:
            raise AegisUnavailable(f"gate unreachable, transaction must NOT proceed: {exc}") from exc
        try:
            return r.status_code, r.json()
        except ValueError:
            return r.status_code, {}

    def audit(self, amount, currency="KES", require_approval=False, idempotency_key=None):
        """Ask the gate BEFORE moving money. Returns the verdict dict.

        Send idempotency_key to make retries safe: replays return the original
        verdict instead of creating a duplicate transaction.
        """
        payload = {"amount": amount, "currency": currency}
        if require_approval:
            payload["requireApproval"] = True
        headers = {}
        key = idempotency_key or f"{uuid.uuid4().hex}"
        headers["x-idempotency-key"] = key
        status, body = self._post("/api/audit", payload, extra_headers=headers)
        if status in (401, 403, 429, 503):
            raise AegisError(f"denied ({status}): {body.get('reason') or body.get('error')}")
        return body

    def settle(self, warrant, payer_phone):
        """Settle an approved transaction with its signed single-use warrant."""
        status, body = self._post("/api/payments/settle", {"warrant": warrant, "payerPhone": payer_phone})
        if status not in (200, 201):
            raise AegisError(f"settlement refused ({status}): {body.get('error') or body.get('reason')}")
        return body

    def reverse(self, warrant_id, reason="dispute"):
        """Reverse a settled transaction. Returns the signed reversal warrant."""
        status, body = self._post("/api/payments/reversal", {"warrantId": warrant_id, "reason": reason})
        if status not in (200, 201):
            raise AegisError(f"reversal refused ({status}): {body.get('error') or body.get('reason')}")
        return body

    def rotate_key(self):
        """Rotate this agent's API key. The old key dies immediately."""
        status, body = self._post("/api/agents/rotate", {})
        if status not in (200, 201):
            raise AegisError(f"rotation failed ({status}): {body.get('error')}")
        self.api_key = body["apiKey"]
        return body

    def me(self):
        r = requests.get(f"{self.base_url}/api/agents/me",
                         headers={"Authorization": f"Bearer {self.api_key}"}, timeout=self.timeout)
        if r.status_code != 200:
            raise AegisError(f"status check failed ({r.status_code})")
        return r.json()

    def analytics(self):
        r = requests.get(f"{self.base_url}/api/agents/me/analytics",
                         headers={"Authorization": f"Bearer {self.api_key}"}, timeout=self.timeout)
        if r.status_code != 200:
            raise AegisError(f"analytics failed ({r.status_code})")
        return r.json()

    @staticmethod
    def verify_agent(agent_id, base_url="https://aegis-agent-4u79.onrender.com", timeout=10):
        """Know-Your-Agent: publicly verify any agent's registration and reputation."""
        r = requests.get(f"{base_url.rstrip('/')}/api/agents/verify/{agent_id}", timeout=timeout)
        return r.json() if r.ok else {"registered": False, "status": "UNKNOWN"}
