// Completely Rewritten Aegis//Agent Live Cluster Verification Script
async function runTest() {
    // 1. Pointing explicitly to your verified live Render endpoint
    const gatewayUrl = "https://aegis-agent-4u79.onrender.com";

    
    
    console.log("🚀 Initializing live cluster connection test...");
    console.log(`📡 Targeting endpoint: ${gatewayUrl}/api/config`);
    
    try {
        // 2. Dispatching the configuration update payload
        const response = await fetch(`${gatewayUrl}/api/config`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                maxAmountLimitKES: 7500
            })
        });
        
        // 3. Parsing the response stream from Render
        const result = await response.json();
        console.log("\n✅ Live Server Network Connection: SUCCESS");
        console.log("📦 Response Payload Data:");
        console.dir(result, { depth: null });
        
    } catch (error) {
        console.log("\n❌ Network Routing Failed");
        console.error("Reason:", error.message);
    }
}

runTest();
