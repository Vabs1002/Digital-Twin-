# Andrew Ng Digital Twin: An Interactive AI Teacher with Dual Memory & Streaming Neural Voice

I built this project to create an interactive Digital Twin of the world-renowned AI professor and educator **Andrew Ng**. My goal was to design a highly responsive classroom companion that captures Andrew’s signature encouraging, calm, and structured teaching style, while ensuring zero-latency speech feedback and persistent memory of student profiles.

I structured this repository as a full-stack JavaScript application, with an Express backend serving a custom RAG engine and Microsoft Edge Neural Voice, paired with a glassmorphic dashboard built in Vite + React.

---

## 🌟 What I Built (Core Features)

1.  **Pedagogical Persona**: I instructed Gemini 2.5 Flash to act strictly as Andrew Ng. He explains machine learning concepts using analogies and intuitive mappings before introducing mathematical formulas. I also updated his prompt to restrict raw LaTeX symbols (e.g. speaking "theta transpose x" instead of `$\theta^T x$`) and raw code blocks, ensuring that the spoken text matches the written text perfectly without reading command-line brackets or variables.
2.  **Fuzzy-Search RAG Engine**: To ground Andrew's responses in his actual CS229 Stanford course material, I built a local fuzzy search engine using **Fuse.js**. I chunked five lecture syllabus files (Linear Regression, Neural Networks, Bias/Variance, Career Advice, and Agentic Workflows). When you submit a question, my server automatically fetches the most relevant lecture passages and injects them as grounding context.
3.  **Dual Memory System**:
    *   **Short-Term History**: I implemented a persistent history logger (`chat-history.json`) that manages the conversation stream. I wrote a server-side sanitization parser to filter out empty turns, guarantee role alternation (`user` -> `model`), and roll back unmatched prompts if a connection is aborted, preventing history payload corruption.
    *   **Long-Term Fact Profile**: After every response, my backend runs a background thread asking Gemini to extract student traits (name, background level, goals, topics discussed) and updates them to a persistent `memory.json`. The next time you log in, Andrew starts the conversation remembering your name and progress!
4.  **Low-Latency Neural Speech Queue**: Waiting for an LLM to generate a long reply and then waiting for an MP3 file to compile can introduce upwards of 6 seconds of lag. To solve this, I designed a real-time tokenizer on the client. As the text streams in, the client splits it at sentence boundaries and immediately requests a neural voice preview for that individual sentence. Small clips load in under 150ms, meaning **Andrew starts speaking instantly** while the rest of the text is still streaming!
5.  **Multi-Accent Selector**: I added a properties panel where you can choose between four accents representing Andrew’s international background: Standard US, Singapore Calm, Hong Kong Soft, and Precise British.
6.  **Full Voice Interruption**: I connected client-side `AbortController` signals to the server's streaming routes. If you activate the microphone to interrupt him while he is speaking, the client aborts the pending HTTP stream, flushes the audio queue, mutes the player, and begins listening immediately.

---

## 📂 Repository Structure

I cleaned up the project root to ensure it is neat and organized:
*   `client/`: My Vite + React + TypeScript frontend codebase. All layouts are defined in `src/index.css` using custom glassmorphic properties.
*   `server/`: My Express + Node.js backend. Contains the RAG files, documents, and system configuration.
*   `zero-to-hero/`: I created this folder for other developers who want to study my code from scratch. It contains a detailed [theory.md](file:///c:/Users/vabsd/Desktop/AIMSUMMER1/zero-to-hero/theory.md) explaining my architectural choices, alongside the developer test scripts I used during building.

---

## 🚀 Setup & Installation

Follow these steps to run the project locally on your machine:

### Prerequisites
*   Node.js (v18 or higher)
*   Python 3 (needed for Edge TTS integration)
*   `edge-tts` python package. You can install it by running:
    ```bash
    pip install edge-tts
    ```

### 1. Configure the Backend Server
1.  Navigate to the server directory:
    ```bash
    cd server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Duplicate the example environment file:
    ```bash
    copy .env.example .env
    ```
4.  Open `.env` and fill in your Gemini API key (retrieve a free key in 30 seconds at [Google AI Studio](https://aistudio.google.com/)):
    ```env
    GEMINI_API_KEY=your_actual_key_here
    PORT=5000
    ```
5.  Start the server:
    ```bash
    npm run start
    ```
    *The server will start at `http://localhost:5000`.*

### 2. Configure the Client
1.  Open a new terminal window and navigate to the client directory:
    ```bash
    cd client
    ```
2.  Install client dependencies:
    ```bash
    npm install
    ```
3.  Start the Vite developer server:
    ```bash
    npm run dev
    ```
4.  Open your browser and navigate to the URL shown (typically [http://localhost:5173/](http://localhost:5173/)).
