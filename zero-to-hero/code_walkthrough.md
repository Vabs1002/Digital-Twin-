# Code Walkthrough: Line-by-Line Developer Guide

This guide walks you through the actual code files in the repository. I have written this to explain **how** we coded it, **why** we wrote it this way, and the design patterns used so you can master the codebase from scratch.

---

## 📁 Repository Structure

Here is how the main production files relate to each other:

```
c:\Users\vabsd\Desktop\AIMSUMMER1\
│
├── README.md                          <-- Root project manual (Humanized)
│
├── client/                            <-- Frontend Code (Vite + React + TS)
│   ├── src/
│   │   ├── App.tsx                    <-- App State, SSE stream parser, API controller
│   │   ├── index.css                  <-- UI colors, Glassmorphism, animations
│   │   └── components/
│   │       ├── ChatWindow.tsx         <-- Tokenizer, Audio Queue player, Speech recognition
│   │       ├── MemoryDashboard.tsx    <-- Displays remembered facts
│   │       ├── RAGViewer.tsx          <-- Displays fetched lecture notes
│   │       └── VoiceSelector.tsx      <-- Accent profile preview panel
│   └── package.json
│
└── server/                            <-- Backend Code (Express + Node.js)
    ├── server.js                      <-- Server start, API routes (/api/chat, /api/tts), execFile
    ├── rag-engine.js                  <-- Chunk loader, Fuse.js fuzzy engine
    ├── memory-manager.js              <-- JSON file read/write, background memory extractor
    ├── generate-audio.py              <-- Python subprocess connecting to edge-tts API
    ├── documents/                     <-- Stanford lecture note text files
    ├── chat-history.json              <-- Conversation logs (flat-file DB)
    ├── memory.json                    <-- Long-term profile memory (flat-file DB)
    └── package.json
```

---

## ⚙️ Part 1: The Backend (Express Server)

Let's walk through the key components of the backend.

### 1. The Main Server: `server/server.js`

This is the central entry point of the server. Let's look at how the core routines are built:

#### A. Protecting Sample Voice Files
On server start, we clean up cached TTS audio files to save disk space, but we must protect our voice preview samples:
```javascript
function cleanupAudioFiles() {
  const files = fs.readdirSync(AUDIO_DIR);
  const now = Date.now();
  const maxAge = 15 * 60 * 1000; // 15 minutes

  files.forEach(file => {
    // We ignore files starting with 'sample-' so our voice previews are never deleted!
    if (file.endsWith('.mp3') && !file.startsWith('sample-')) {
      const filePath = path.join(AUDIO_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
      }
    }
  });
}
```

#### B. Safe Subprocess Generation (`/api/tts`)
To convert text to speech, we call the Python script. Here is how we code the shell-free execution using `execFile`:
```javascript
app.post('/api/tts', async (req, res) => {
  const { text, voice } = req.body;
  
  const filename = `${uuidv4()}.mp3`;
  const outputPath = path.join(AUDIO_DIR, filename);
  const selectedVoice = voice || "en-US-AndrewNeural";

  // Clean raw newlines and markdown characters
  const cleanText = text
    .replace(/\n/g, ' ')
    .replace(/[\*\#\_\`]/g, '');

  // We use execFile instead of exec. We pass cleanText, outputPath, and selectedVoice
  // as independent arguments in an array. This prevents Windows shell parsing errors.
  execFile('python', ['generate-audio.py', cleanText, outputPath, selectedVoice], (error, stdout, stderr) => {
    if (error) {
      console.error("Edge TTS execution failed via execFile:", error, stderr);
      return res.status(500).json({ error: "Failed to generate neural audio speech." });
    }
    res.json({ audioUrl: `http://localhost:5000/audio/${filename}` });
  });
});
```

#### C. Reliable Client Disconnect Detection
If a student closes the web page, we should instantly stop calling Gemini to save API tokens:
```javascript
  let isClientDisconnected = false;
  let isResponseFinished = false;

  // We listen to the response 'close' event instead of the request 'close' event.
  // This is because POST request streams close immediately after the JSON body is read.
  res.on('close', () => {
    if (!isResponseFinished) {
      isClientDisconnected = true;
      console.log('SSE connection closed prematurely. Stopping Gemini stream processing.');
    }
  });
```

#### D. Automatic Chat History Rollback
If the Gemini API fails or the student interrupts, the server automatically rolls back the last user message from the JSON file:
```javascript
    if (streamSucceeded) {
      // Save assistant response
      savedHistory.push(assistantMsg);
      saveChatHistory(savedHistory);
    } else {
      // Stream failed or aborted. Remove the unmatched user prompt so history remains alternating
      console.log("Stream aborted/failed. Rolling back last user message.");
      const currentHistory = loadChatHistory();
      if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1].role === 'user') {
        currentHistory.pop();
        saveChatHistory(currentHistory);
      }
    }
```

---

### 2. The Search Index: `server/rag-engine.js`
This file splits documents and searches them using keyword relevance:
*   `initializeRAG()` reads the text files inside the `/documents` folder.
*   It splits them by paragraphs (denoted by `\n\n`) into a flat array of chunks.
*   `searchRAG(query, limit)` runs a search using `Fuse.js` with settings:
    ```javascript
    const options = {
      keys: ['text'],
      threshold: 0.4, // Matches keywords even with typos or varying suffix endings
      ignoreLocation: true
    };
    ```
    This matches search words anywhere in the paragraph and returns the top matches.

---

### 3. Background Memory Manager: `server/memory-manager.js`
This file reads `memory.json` and updates facts in a non-blocking background thread:
*   `loadMemory()` loads the JSON. If the file is missing, it returns a default object.
*   `updateLongTermMemory(userMessage, assistantMessage, apiKey)` is an asynchronous function. It starts a new Gemini model call with a system prompt that says:
    *"Extract the user's name, coding background, age, goals, and discussed topics from this dialogue. Return it strictly as a JSON object."*
*   It parses the resulting JSON, merges the new facts with `memory.json`, and writes it to disk.

---

## 🎨 Part 2: The Frontend (React Client)

Let's look at how the client parses streams and queues audio:

### 1. Stream Parsing: `client/src/App.tsx`
When the client calls `/api/chat`, it parses the incoming event stream:
```typescript
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || ''; // Hold onto incomplete chunks

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const data = JSON.parse(trimmed.substring(6));
        if (data.text) {
          assistantReply += data.text;
          // Update the message state so the UI rerenders the new words live
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantReply } : m));
        }
      }
    }
  }
```

---

### 2. Sentence Audio Queue: `client/src/components/ChatWindow.tsx`
This file contains the tokenizer and the playback queue scheduling logic.

#### A. Stable Sentence Tokenizer
I wrote `splitIntoSentences` to divide the AI's reply into individual sentences dynamically as it loads:
```typescript
  const splitIntoSentences = (text: string): string[] => {
    const sentences: string[] = [];
    let currentSentence = '';
    const tokens = text.split(/(\s+)/);
    const abbreviations = ['mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'vs.', 'e.g.', 'i.e.', 'etc.', 'al.', 'approx.'];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Split immediately on paragraph breaks
      if (/\n/.test(token)) {
        if (currentSentence.trim()) {
          sentences.push(currentSentence.trim());
          currentSentence = '';
        }
        continue;
      }
      
      currentSentence += token;
      const trimmed = token.trim();
      if (!trimmed) continue;
      
      const hasPunctuation = /[.!?]$/.test(trimmed);
      if (hasPunctuation) {
        const cleanWord = trimmed.replace(/[()\[\]{}"']/g, '').toLowerCase();
        const isAbbreviation = abbreviations.includes(cleanWord) || abbreviations.includes(cleanWord + '.');
        const isListNumber = /^\d+\.$/.test(trimmed);
        
        // We do NOT use lookahead here (checking next tokens). This ensures that sentence splits
        // are stable and never change their index as the text continues to load.
        if (!isAbbreviation && !isListNumber) {
          sentences.push(currentSentence.trim());
          currentSentence = '';
        }
      }
    }
    return sentences;
  };
```

#### B. The Audio Queue Player
Short audio files are played back-to-back using a queue:
```typescript
  const playNextInQueue = () => {
    if (audioQueue.current.length === 0) {
      isPlayingQueue.current = false;
      setIsPlayingAudio(false);
      return;
    }

    isPlayingQueue.current = true;
    setIsPlayingAudio(true);
    const nextAudioUrl = audioQueue.current.shift()!;
    
    const audio = new Audio(nextAudioUrl);
    audioRef.current = audio;

    // When this clip finishes playing, automatically play the next one!
    audio.onended = () => {
      playNextInQueue();
    };

    audio.onerror = () => {
      playNextInQueue();
    };

    audio.play().catch(err => {
      playNextInQueue();
    });
  };
```

---

## 🐍 Part 3: Python Speech Engine (`server/generate-audio.py`)

This python script runs in a separate process:
*   It imports `edge_tts`, Microsoft's neural text-to-speech library.
*   It instantiates the stream using a custom pacing:
    ```python
    communicate = edge_tts.Communicate(text, voice, rate="-10%")
    ```
    *Note: Andrew Ng has a very calm, slow, and deliberate speaking cadence. I configured the speech synthesis parameters to slow down the generation rate by **10%** to capture his natural teaching rhythm.*
*   It saves the output directly to the requested folder as an MP3 file, which Node.js serves back to the React client.
