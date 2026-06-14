import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
console.log("Using API Key:", GEMINI_API_KEY ? GEMINI_API_KEY.substring(0, 15) + "..." : "NONE");

async function run() {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Write a one-sentence greeting.");
    console.log("Result:", result.response.text());
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
