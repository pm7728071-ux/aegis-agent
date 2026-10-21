async function runTest() {
const endpoint = "https://id-preview--5e418230-5342-41e8-a5ff-758e8eff2d25.lovable.app/api/audit";
// Invalid input checks the route without creating test transactions.
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 0, currency: "KES" }),
});
const verdict = await response.json();
if (response.status !== 400 || verdict.status !== "BLOCKED") throw new Error(`Audit route check failed (${response.status})`);
console.log("Audit endpoint reachable; invalid transaction blocked without creating sample data.");
}
runTest().catch(error => { console.error(error.message); process.exitCode = 1; });
