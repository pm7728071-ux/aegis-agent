/** AEGIS//AGENT SDK. Current preview deployment; replace origin after publication. */
class AegisClient {
  constructor(agentIdentifier, endpoint = "https://id-preview--5e418230-5342-41e8-a5ff-758e8eff2d25.lovable.app/api/audit") {
    this.agentId = agentIdentifier || "Unnamed_External_Agent";
    this.gatewayUrl = endpoint;
  }
  async auditTransaction(amount, currency = "KES", mpesaRecipient = null) {
    try {
      const response = await fetch(this.gatewayUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: this.agentId, amount, currency, mpesaRecipient }),
      });
      if (!response.ok) throw new Error(`Audit failed (${response.status})`);
      return await response.json();
    } catch {
      return { status: "BLOCKED", reason: "Audit gateway unavailable; transaction frozen." };
    }
  }
}
module.exports = AegisClient;