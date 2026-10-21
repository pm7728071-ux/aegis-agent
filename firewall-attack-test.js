const targetUrl = "https://onrender.com";

const fakeRogueBotPayload = {
    botId: "MALICIOUS_AGENT_RECON_09",
    reason: "Attempted automated payload injection on secure payment gateway rail",
    ipAddress: "192.168.88.254",
    payloadRiskScore: "CRITICAL_99",
    channel: "M-Pesa API Integrator Sandbox Layer"
};

console.log("📡 [LAUNCHING SIMULATED ATTACK] Sending malicious bot signature to Aegis Core Gateway...");

fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fakeRogueBotPayload)
})
.then(res => res.json())
.then(data => {
    console.log("\n✅ [FIREWALL RESPONSE RECEIVED SUCCESSFULLY]");
    console.log(JSON.stringify(data, null, 2));
    console.log("\n🚀 Check your live dashboard—the rogue bot tracker just logged this signature persistently to the cloud!");
})
.catch(err => console.error("❌ Attack Simulation Connection Error:", err.message));
