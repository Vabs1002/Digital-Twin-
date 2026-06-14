import { initializeRAG, searchRAG } from './rag-engine.js';
import { loadMemory, resetMemory } from './memory-manager.js';

console.log("=== RUNNING BACKEND INTEGRATION DIAGNOSTICS ===");

// 1. Test RAG Engine
console.log("\n1. Testing RAG Engine...");
initializeRAG();
const results = searchRAG("gradient descent", 2);
console.log("RAG Search query: 'gradient descent'");
console.log(`RAG Search returned ${results.length} result(s):`);
results.forEach((r, i) => {
  console.log(`  [Match ${i+1}] Title: "${r.title}" (Source: ${r.source})`);
  console.log(`    Excerpt: "${r.text.substring(0, 120)}..."`);
});

if (results.length > 0) {
  console.log("✅ RAG Engine: PASS");
} else {
  console.error("❌ RAG Engine: FAIL (No search results returned)");
}

// 2. Test Memory Manager
console.log("\n2. Testing Memory Manager...");
const currentMemory = loadMemory();
console.log("Loaded Memory Object:", JSON.stringify(currentMemory, null, 2));

if (currentMemory && currentMemory.userName) {
  console.log("✅ Memory Manager: PASS");
} else {
  console.error("❌ Memory Manager: FAIL (Failed to parse or create default memory)");
}

console.log("\n=== DIAGNOSTICS COMPLETED ===");
if (results.length > 0 && currentMemory) {
  process.exit(0);
} else {
  process.exit(1);
}
