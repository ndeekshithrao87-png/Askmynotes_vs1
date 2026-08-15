require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const candidates = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-pro-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro"
];

async function test() {
  for (const name of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: name });
      const result = await model.generateContent("Say OK");
      console.log(`✅ WORKS: ${name} -> "${result.response.text().trim()}"`);
    } catch (err) {
      console.log(`❌ FAILED: ${name} -> ${err.message.split("\n")[0]}`);
    }
  }
}

test();