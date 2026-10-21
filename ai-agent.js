import OpenAI from "openai";
import dotenv from "dotenv";

// Load configuration keys from the .env file
dotenv.config();
console.log("Checking API Key setup:", process.env.OPENAI_API_KEY ? "Key Found! ✅" : "Key is EMPTY/MISSING! ❌");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Uses AI to draft a personalized, high-converting response 
 * for Beautiful Homes Design by Godfrey.
 */
async function generateAiReply(customerName, customerMessage) {
  const systemPrompt = 
    "You are an elite, highly professional AI Receptionist for 'Beautiful Homes Design by Godfrey', " +
    "a premier premium home construction and remodeling company. " +
    "Godfrey is currently on a live construction site overseeing a luxury renovation project. " +
    "Your goal is to be warm, acknowledge the customer's request, and aggressively guide them " +
    "to book a free project consultation link: https://calendly.com. " +
    "Keep the response under 3 sentences. Be extremely professional.";

  const userPrompt = `Customer Name: ${customerName}\nCustomer Message: '${customerMessage}'`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast, incredibly cheap, and sharp
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("AI Error:", error);
    return `Hi ${customerName}, thanks for reaching out! Godfrey is on-site right now. Please book a time here: https://calendly.com`;
  }
}

// --- QUICK LOCAL TEST RUN ---
async function runTest() {
  console.log("Testing AI Agent Engine...");
  const reply = await generateAiReply(
    "Alice", 
    "Hi, I want to get a quote for remodeling my kitchen next month. Do you do custom cabinets?"
  );
  console.log("\n--- AI GENERATED RESPONSE TO CLIENT ---");
  console.log(reply);
}

runTest();
