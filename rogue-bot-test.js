// Standalone Config Telemetry Verification Script
async function verifyLiveConfig() {
    const targetUrl = 'https://onrender.com';
    
    console.log("📡 Querying live cluster configuration profile parameters...");
    
    try {
        const response = await fetch(targetUrl, {
            method: 'GET'
        });
        
        const data = await response.json();
        console.log("\n✅ [SUCCESS] Global Cloud Sync Operational!");
        console.log("📦 Deployed Database Parameters:");
        console.dir(data, { depth: null });
        
    } catch (error) {
        console.log("\n❌ Global Gateway Route Restricted");
        console.error("Reason:", error.message);
    }
}

verifyLiveConfig();
