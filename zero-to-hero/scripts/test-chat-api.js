// Node 22 supports native global fetch, no import needed

async function runTest() {
  console.log("Sending test request to http://localhost:5000/api/chat...");
  try {
    const response = await fetch('http://localhost:5000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Hi, I am Alex. I want to learn linear regression.",
        history: []
      })
    });
    
    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response data:", JSON.stringify(data, null, 2));
    if (response.ok && data.response) {
      console.log("✅ API Test: SUCCESS!");
      process.exit(0);
    } else {
      console.error("❌ API Test: FAILED!", data);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Connection failed:", error);
    process.exit(1);
  }
}

runTest();
