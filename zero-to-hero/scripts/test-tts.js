async function testTTS() {
  console.log("Querying http://localhost:5000/api/tts...");
  try {
    const res = await fetch("http://localhost:5000/api/tts?text=Welcome+back+students+to+Deep+Learning.");
    const data = await res.json();
    console.log("Response status:", res.status);
    console.log("Response JSON:", JSON.stringify(data, null, 2));
    if (res.ok && data.audioUrl) {
      console.log("✅ Neural TTS Integration test passed!");
      process.exit(0);
    } else {
      console.error("❌ Neural TTS Integration test failed!");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Request error:", error);
    process.exit(1);
  }
}

testTTS();
