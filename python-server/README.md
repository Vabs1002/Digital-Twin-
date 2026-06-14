# Andrew Ng Digital Twin - Python Server (FastAPI)

I created this folder to provide a complete, low-latency **Python alternative** to the Node.js backend. It mirrors the exact same API endpoints on the same port (`5000`), meaning you can run the React frontend against it without changing a single line of client code!

---

## 🚀 How to Run the Python Backend

### Prerequisites
*   Python 3.8 or higher installed on your computer.

### Step 1: Install Dependencies
Open your terminal, navigate to the `python-server` directory, and install the required packages:
```bash
cd python-server
pip install -r requirements.txt
```

### Step 2: Configure Environment Settings
1.  Duplicate the example environment file:
    ```bash
    copy .env.example .env
    ```
2.  Open the newly created `.env` file and insert your Google Gemini API key:
    ```env
    GEMINI_API_KEY=your_actual_gemini_api_key_here
    ```

### Step 3: Run the Server
Start the FastAPI application using `uvicorn`:
```bash
python server.py
```
*The server will start at `http://127.0.0.1:5000`.*

---

## ⚙️ How it Works under the Hood

*   **FastAPI & SSE Streaming**: Built using the async FastAPI framework, returning streamed LLM tokens over Server-Sent Events (`StreamingResponse`) with disconnect listeners.
*   **Native Edge-TTS**: Since we are in Python, we call the `edge-tts` voice library directly. We don't spawn subprocesses (`execFile`) anymore, which increases speed and eliminates command-line quote bugs.
*   **Fuzzy-Search RAG**: Uses the high-performance `rapidfuzz` library in `rag_engine.py` to match search keywords across the Stanford lecture notes in `documents/`.
*   **Persistent Memory & History**: Reads and writes to `chat-history.json` and `memory.json` locally using standard Python JSON parsing. Updates facts in the background asynchronously using FastAPI Background Tasks.
