import dotenv from 'dotenv';
dotenv.config();

const key = process.env.LLM_GATEWAY_API_KEY;
console.log("Using key:", key ? key.slice(0,15) + "..." : "NOT FOUND");

const res = await fetch('https://api.llmgateway.io/v1/models', {
  headers: { 'Authorization': `Bearer ${key}` }
});
console.log("Status:", res.status);
const data = await res.json();

if (data.data) {
  console.log("\n✅ Supported Models:\n");
  data.data.forEach(m => console.log(" -", m.id));
} else {
  console.log("Response:", JSON.stringify(data, null, 2));
}
