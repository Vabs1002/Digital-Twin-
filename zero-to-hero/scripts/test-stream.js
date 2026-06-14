async function testStream() {
  console.log("Querying http://localhost:5000/api/chat with streaming...");
  try {
    const res = await fetch('http://localhost:5000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Hi Andrew, what are agentic workflows?",
        history: []
      })
    });
    
    console.log("Status:", res.status);
    if (!res.ok) {
      console.error("❌ Streaming API failed!");
      process.exit(1);
    }
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let textReceived = "";

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;
      const chunk = decoder.decode(value);
      textReceived += chunk;
      process.stdout.write("."); // Print dots as we receive chunks
    }

    console.log("\n\nStream completed!");
    console.log("Received data length:", textReceived.length);
    if (textReceived.includes("data:")) {
      console.log("✅ Streaming API: SUCCESS!");
      process.exit(0);
    } else {
      console.error("❌ Streaming API: FAILED (No SSE data blocks found)");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Streaming API connection error:", error);
    process.exit(1);
  }
}

testStream();
