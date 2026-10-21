/**
 * AEGISAGENT OFFICIAL DEVELOPER CONNECTION KIT (SDK) v1.0.0
 * 🛡️ Secure Your Autonomous Machine Transactions in 2 Milliseconds
 * 🏢 Endpoint Target: Live Render Production Cloud Cluster
 */

class AegisClient {
    /**
     * Initialize the connection client
     * @param {string} agentIdentifier - The unique ID name of your autonomous AI bot
     */
    constructor(agentIdentifier) {
        this.agentId = agentIdentifier || "Unnamed_External_Agent";
        // Directly pointing to your live production cloud server gateway link!
        this.gatewayUrl = "https://aegis-agent-4u79.onrender.com";
    }

    /**
     * Intercept and audit a transaction before it reaches banking/payment networks
     * @param {number} financialAmount - The numeric transaction cost value
     * @param {string} currencyCode - "KES" or "USD"
     * @param {string} optionalMpesaTarget - Outbound recipient phone string
     * @returns {Promise<Object>} The unalterable firewall safety status and verdict
     */
    async auditTransaction(financialAmount, currencyCode = "KES", optionalMpesaTarget = null) {
        const payload = {
            agentId: this.agentId,
            amount: financialAmount,
            currency: currencyCode,
            mpesaRecipient: optionalMpesaTarget
        };

        try {
            const response = await fetch(this.gatewayUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Aegis Gateway Network Error: Status Code ${response.status}`);
            }

            const securityVerdict = await response.json();
            return securityVerdict;

        } catch (error) {
            console.error(`\n[🚨 AEGIS CLIENT EXCEPTION] Connection Blocked: ${error.message}`);
            // Safety Default: If the gateway is unreachable, hard-block to prevent capital leaks
            return {
                status: "BLOCKED",
                reason: "CRITICAL NETWORK ERROR: Aegis Client entered defensive fallback. Transaction frozen."
            };
        }
    }
}

// Exporting the module for standard backend application architectures
module.exports = AegisClient;
