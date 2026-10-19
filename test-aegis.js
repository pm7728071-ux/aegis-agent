async function runTest() {
    // Testing the base domain root directly
    const gatewayUrl = "https://onrender.com";
    
    console.log("🚀 Pinging Aegis//Agent root server...");
    
    try {
        const response = await fetch(gatewayUrl, {
            method: 'GET'
        });
        
        const text = await response.text();
        console.log("✅ Server HTML/Text Response Received:");
        console.log(text.substring(0, 200)); // Show the first 200 characters
        
    } catch (error) {
        console.error("❌ Connection Error:", error.message);
    }
}

runTest();
