# How to Build This Project From Scratch (Step-by-Step)

This guide walks you through the exact steps, folder setup, and commands so you can build this entire Andrew Ng Digital Twin project by yourself from a blank folder.

---

## Phase 1: Set Up the Folders
Create your master project folder (e.g. `andrew-ng-twin`) and inside it, create two main folders:
1.  **`server`** (for our backend API and voice generator)
2.  **`client`** (for our React web page dashboard)

---

## Phase 2: Build the Backend Server

### Step 1: Initialize Node.js & Install Packages
Open your terminal, go into the `server` folder, and initialize it:
```bash
cd server
npm init -y
```
Now, install the required packages:
*   `express` (to handle HTTP API requests)
*   `cors` (to allow our React web page to talk to the server)
*   `dotenv` (to load our private API key)
*   `@google/generative-ai` (to talk to Gemini)
*   `fuse.js` (to run fuzzy search over lecture notes)
*   `uuid` (to generate unique filenames for audio files)

Install them by running:
```bash
npm install express cors dotenv @google/generative-ai fuse.js uuid
```

### Step 2: Configure Environment Settings
Create a file named **`package.json`** (this is already generated, but you must open it and add the following line so Node knows we are using modern import syntax):
```json
"type": "module"
```

Next, create a **`.env`** file to hold your private key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=5000
```
*(Also create a `.env.example` file without your real key, and a `.gitignore` containing `node_modules/` and `.env` so you don't upload secrets to GitHub).*

### Step 3: Create the Lecture Notes Folder (RAG Corpus)
1.  Create a folder named **`documents`** inside `server`.
2.  Create plain text files inside it (like `supervised-learning.txt`, `neural-networks.txt`) containing Andrew Ng's lecture transcripts.
3.  Ensure each paragraph is separated by a double newline (`\n\n`) so our search script can read them.

### Step 4: Write the Search Engine (`rag-engine.js`)
Create a file named **`rag-engine.js`**.
1.  Import `fs` (to read files) and `Fuse` (to search).
2.  Read all text files in `/documents` and split them into paragraphs.
3.  Initialize `Fuse.js` with the paragraphs.
4.  Export a function `searchRAG(query)` that takes the user's question and returns the top 3 matching paragraphs.

### Step 5: Write the Memory Manager (`memory-manager.js`)
Create a file named **`memory-manager.js`**.
1.  Write functions to load and save `memory.json` (stores userName, background, goals, etc.).
2.  Write an asynchronous background function `updateLongTermMemory()`. It calls Gemini, feeds it the conversation history, and asks Gemini to return new facts about the user strictly formatted in JSON.
3.  Save the updated facts to `memory.json`.

### Step 6: Set Up Python Voice Generator (`generate-audio.py`)
1.  Ensure you have Python installed.
2.  Install the Microsoft voice library:
    ```bash
    pip install edge-tts
    ```
3.  Create **`generate-audio.py`**. Write a script that imports `edge_tts`, takes text from arguments, configures the speech speed to `-10%` (for Andrew's slow pacing), and saves it as an MP3 file in `server/public/audio/`.

### Step 7: Assemble the Main Server (`server.js`)
Create **`server.js`**.
1.  Set up Express and configure it to serve static files from `server/public/audio/`.
2.  Create the `/api/chat` route:
    *   Load the chat history from `chat-history.json` and sanitize it (ensure alternating roles).
    *   Query RAG for lecture paragraphs.
    *   Assemble the system prompt, including RAG context and student memory profile.
    *   Call Gemini stream API.
    *   Listen to `res.on('close')` to stop streaming if the client disconnects.
    *   If the stream fails/cancels, roll back (remove) the last user message. If it succeeds, save the history.
3.  Create the `/api/tts` route:
    *   Call the Python voice script using `execFile('python', [...args])` to prevent quotes from breaking in Windows.

---

## Phase 3: Build the Frontend Client

### Step 1: Initialize Vite + React
Go back to the root folder, and initialize the client using Vite:
```bash
cd ..
npm create vite@latest client -- --template react-ts
cd client
npm install
```
Now, install `lucide-react` for neat icons:
```bash
npm install lucide-react
```

### Step 2: Set Up Styling (`index.css`)
Open **`src/index.css`** and delete everything in it. Write your custom CSS tokens:
*   Set up a dark blue-grey background.
*   Add glassmorphic visual styles: translucent panels (`background: rgba(..., 0.65)`), thin borders, and blur filters (`backdrop-filter: blur(12px)`).

### Step 3: Build the Layout Dashboard (`App.tsx`)
Open **`src/App.tsx`**.
1.  Create state variables: `messages` (chat log), `memory` (learner profile), `sources` (matching lectures), `isThinking` (typing dots indicator).
2.  Write `handleSendMessage()`:
    *   Add user message to state.
    *   Create an `AbortController` to track the request.
    *   Call `/api/chat` with streaming.
    *   Read the response stream byte-by-byte using `TextDecoder` and update the chat screen live as words load.

### Step 4: Build the UI Components
Create a folder named **`src/components/`** and write these files:
1.  **`VoiceSelector.tsx`**: A panel to select and preview US, Singapore, Hong Kong, or British accents.
2.  **`MemoryDashboard.tsx`**: A panel displaying the facts saved in `memory.json`.
3.  **`RAGViewer.tsx`**: A panel showing the matching lecture notes.
4.  **`ChatWindow.tsx`**: The main chat window. Write:
    *   Speech recognition integration (using the browser's mic).
    *   `splitIntoSentences()`: Splits the text at `.!?\n` without looking ahead, keeping the indexes stable.
    *   An `audioQueue` scheduler: Plays the MP3 voice files back-to-back using HTML5 `Audio` objects. When the microphone is turned on, abort the stream and mute the playing audio immediately.

---

## Phase 4: Run the Application

You need two terminal windows open:

1.  **In Terminal 1 (Backend)**:
    ```bash
    cd server
    node server.js
    ```
2.  **In Terminal 2 (Frontend)**:
    ```bash
    cd client
    npm run dev
    ```

Open your browser at the local URL (usually [http://localhost:5173](http://localhost:5173)) and start studying!

---

## Phase 5: Modifying Your Code Using Diff Files

As you build this project by yourself, you will want to make changes or apply updates incrementally. 

Instead of rewriting whole files, you can use **diff files** (or patches) to safely and quickly edit specific lines of code.

To learn how to generate, read, and apply diff files using Git or command line tools:
*   Read the **[A Beginner's Guide to Diff Files (diff_guide.md)](file:///c:/Users/vabsd/Desktop/AIMSUMMER1/zero-to-hero/diff_guide.md)** inside this folder.
*   Try the quick 5-minute local experiment in that guide to see how Git applies code updates instantly.
