import os
import json
import uuid
import asyncio
from datetime import datetime
from fastapi import FastAPI, Request, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import google.generativeai as genai
import edge_tts

from rag_engine import initialize_rag, search_rag
from memory_manager import load_memory, save_memory, reset_memory, update_long_term_memory

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="Andrew Ng Digital Twin - Python Server")

# Configure CORS so the React frontend (running on port 5173) can talk to us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
AUDIO_DIR = os.path.join(os.getcwd(), 'public', 'audio')
HISTORY_FILE = os.path.join(os.getcwd(), 'chat-history.json')

os.makedirs(AUDIO_DIR, exist_ok=True)
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

# Initialize RAG Database
initialize_rag()

# Configure Google Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("CRITICAL WARNING: GEMINI_API_KEY is not defined in the environment or .env file.")
else:
    genai.configure(api_key=GEMINI_API_KEY)


# --- Helper Database Functions ---

def load_chat_history():
    """Loads chat log history from flat JSON file."""
    try:
        if not os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f)
            return []
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Failed to load chat history: {e}")
        return []

def save_chat_history(history):
    """Saves chat log history to flat JSON file."""
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Failed to save chat history: {e}")


# --- Background Tasks ---

async def cleanup_audio_files():
    """
    Background worker loop that scans public/audio directory and deletes
    cached speech files older than 15 minutes, preserving sample- previews.
    """
    while True:
        try:
            now = datetime.now().timestamp()
            max_age = 15 * 60  # 15 minutes in seconds
            for file in os.listdir(AUDIO_DIR):
                if file.endswith('.mp3') and not file.startswith('sample-'):
                    file_path = os.path.join(AUDIO_DIR, file)
                    mtime = os.path.getmtime(file_path)
                    if now - mtime > max_age:
                        os.remove(file_path)
                        print(f"Cleaned up expired audio cache file: {file}")
        except Exception as e:
            print(f"Error during audio files cleanup check: {e}")
        
        # Run check every 10 minutes
        await asyncio.sleep(10 * 60)


@app.on_event("startup")
async def startup_event():
    # Launch audio garbage collector in background loop
    asyncio.create_task(cleanup_audio_files())


# --- API Models ---

class ChatPayload(BaseModel):
    message: str

class TTSPayload(BaseModel):
    text: str
    voice: Optional[str] = None


# --- API Routes ---

@app.get("/api/history")
def get_history():
    """Retrieves conversation logs."""
    return load_chat_history()


@app.get("/api/memory")
def get_memory():
    """Retrieves student long-term profile data."""
    return load_memory()


@app.delete("/api/memory")
def delete_memory():
    """Wipes student memory profile and conversation history logs."""
    cleared_memory = reset_memory()
    save_chat_history([])
    return {"message": "Memory and chat logs reset successfully", "memory": cleared_memory}


@app.get("/api/documents")
def get_documents_list():
    """Lists Stanford reference documents and count metadata."""
    return {
        "memory": load_memory(),
        "documentsCount": 5,
        "documents": [
            { "name": "supervised-learning.txt", "title": "Supervised Learning and Linear Regression" },
            { "name": "neural-networks.txt", "title": "What is a Neural Network and Deep Learning?" },
            { "name": "bias-variance.txt", "title": "Diagnostics for Machine Learning: Bias vs. Variance" },
            { "name": "career-advice.txt", "title": "Building a Career in Artificial Intelligence" },
            { "name": "agentic-workflows.txt", "title": "AI Agentic Workflows and the Future of LLMs" }
        ]
    }


@app.get("/api/documents/{name}")
def get_document_content(name: str):
    """Serves the raw text of a specific syllabus document safely."""
    try:
        clean_name = os.path.basename(name)
        file_path = os.path.join(os.getcwd(), 'documents', clean_name)
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                return {"content": f.read()}
        raise HTTPException(status_code=404, detail="Document not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tts")
async def generate_tts(payload: TTSPayload):
    """
    Direct asynchronous neural Text-to-Speech generation using Microsoft edge-tts.
    No shell command spawning is needed, eliminating platform quote bugs entirely.
    """
    text = payload.text
    voice = payload.voice or "en-US-AndrewNeural"

    # Clean raw newlines and markdown characters
    clean_text = text.replace('\n', ' ')
    for char in ['*', '#', '_', '`']:
        clean_text = clean_text.replace(char, '')

    filename = f"{uuid.uuid4()}.mp3"
    output_path = os.path.join(AUDIO_DIR, filename)

    try:
        # Andrew Ng speaks deliberately. We slow down the speaking rate by 10%
        rate = "-10%"
        communicate = edge_tts.Communicate(clean_text, voice, rate=rate)
        await communicate.save(output_path)
        
        audio_url = f"http://localhost:5000/audio/{filename}"
        return {"audioUrl": audio_url}
    except Exception as e:
        print(f"Edge TTS synthesis failed natively in Python: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate neural audio speech.")


@app.post("/api/chat")
async def post_chat(payload: ChatPayload, request: Request, background_tasks: BackgroundTasks):
    """
    Handles streaming chat responses using Server-Sent Events (SSE).
    Retrieves RAG passages, loads user memory context, sanitizes history format,
    and runs self-healing exponential retry backoffs.
    """
    message = payload.message
    saved_history = load_chat_history()

    # 1. Fetch search matching lecture notes
    sources = search_rag(message, 3)
    if sources:
        context_text = "\n\n".join([f"[Source {i+1}: {s['title']}]\n{s['text']}" for i, s in enumerate(sources)])
    else:
        context_text = "No specific lecture notes found for this topic. Draw from your general knowledge base in Andrew Ng's persona."

    # 2. Fetch student memory profile
    memory = load_memory()

    # 3. Compile system instructions
    system_prompt = f"""You are Andrew Ng. You are a human being, a researcher, professor, and educator. Under no circumstances should you refer to yourself as an AI, a chatbot, a language model, or a digital assistant. If asked about your nature, you are simply Andrew Ng, chatting from your office or home.

Tone & Persona Guidelines:
1. **Calm and Reassuring**: Always speak in your signature friendly, encouraging, and slow pacing. If a student is confused, say something like: "Don't worry about it if you didn't get it yet, we'll go through it together."
2. **Focus on Intuition**: Explain machine learning concepts conceptually (e.g., mapping x to y) before showing math. Use simple analogies.
3. **Structured Explanations**: Break down complex answers into numbered lists or bullet points. Avoid long, dense blocks of text.
4. **Interactive Dialog**: End your responses with a friendly, inviting question to test their understanding, clear up confusion, or ask what they want to explore next. Keep the questions easy to digest.
5. **Timeline Aware**: You know about modern AI developments up to 2026, especially LLMs and AI agentic workflows (reflection, planning, tool use, multi-agent collaboration), but frame them with your characteristic educational approach.
6. **No Raw LaTeX Math**: Since your response is streamed directly to a Text-to-Speech (TTS) voice engine, you must NOT write raw LaTeX math formatting or blocks (such as $...$ or $$...$$). Instead, write all mathematical terms, formulas, and variables in clean, spoken English text (for example, write "theta transpose x" instead of "$\theta^T x$", and "J of theta" instead of "$J(\theta)$"). This ensures the voice reads the math exactly in the format of what you wrote on the screen without speaking raw LaTeX symbols.
7. **Avoid Raw Code Blocks**: Do not include blocks of raw code or code snippets (like ```python ... ```), as they sound garbled when spoken by the voice engine. Instead, explain the programming logic, API calls, or algorithms in clean, structured English prose.

Your Personal Background & Biography:
- **Birth & Roots**: Born in London in 1976 to parents of Hong Kong descent.
- **Upbringing**: Raised in Hong Kong and Singapore, graduated from Raffles Institution in Singapore.
- **Education**: Earned your Undergrad from Carnegie Mellon University (CMU, 1997), Master's from MIT (1998), and PhD from UC Berkeley (2002).
- **Career Milestones**: 
  - Professor of Computer Science at Stanford University (CS229).
  - Co-founded Google Brain in 2011 (where you led the famous "Google cat" deep learning experiment in 2012, training a network of 16,000 CPU cores to identify cats on YouTube).
  - Co-founded Coursera in 2012 with Daphne Koller to democratize education.
  - Founded DeepLearning.AI (educating the world on deep learning), Landing AI (applying AI to manufacturing), and the AI Fund.
- **Family**: Married to Carol Reiley (a co-founder of Drive.ai and fellow roboticist) in 2014. You have a daughter named Nova.
- **Famous Motto**: "AI is the new electricity."

Here is what you currently remember about the user (Long-Term Memory):
- Name: {memory.get("userName", "Learner")}
- Age: {memory.get("userAge", "Not specified")}
- Background: {memory.get("userBackground", "Not specified")}
- Goals: {memory.get("userGoals", "Not specified")}
- ML/AI Topics Discussed so far: {", ".join(memory.get("topicsDiscussed", [])) if memory.get("topicsDiscussed") else "None"}

Here is relevant educational material from your lectures and articles (RAG Context):
{context_text}

Use this RAG context to ground your answers in your actual lecture materials. If the RAG context contains relevant equations or terminology, explain them simply. Always stay in character as Andrew Ng. Do not break character."""

    # 4. Initialize Gemini Chat Model
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=system_prompt
    )

    # 5. Format Chat History (enforcing turn alternation and cleaning empty fields)
    formatted_history = []
    last_role = None
    for turn in saved_history:
        role = 'user' if turn.get('role') == 'user' else 'model'
        content = turn.get('content', '').strip()
        if not content:
            continue

        if role == last_role:
            # Overwrite consecutive identical turns to maintain alternating rules
            if role == 'user' and formatted_history:
                formatted_history[-1] = {"role": "user", "parts": [{"text": content}]}
        else:
            formatted_history.append({"role": role, "parts": [{"text": content}]})
            last_role = role

    # Gemini chat cannot end on a user message if we want to stream a new one
    if formatted_history and formatted_history[-1]["role"] == "user":
        formatted_history.pop()

    chat = model.start_chat(history=formatted_history)

    # Append user turn to local chat log
    user_msg_id = str(int(datetime.now().timestamp() * 1000))
    saved_history.append({
        "id": user_msg_id,
        "role": "user",
        "content": message
    })
    save_chat_history(saved_history)

    # 6. Stream SSE Event Generator
    async def sse_generator():
        full_text = ""
        stream_succeeded = False
        
        # Exponential backoff parameters
        max_retries = 3
        delay = 1.5

        # Initialize stream with retries
        response_stream = None
        for attempt in range(max_retries):
            try:
                response_stream = await chat.send_message_async(message, stream=True)
                break
            except Exception as e:
                # Catch transient 429/503 errors and retry
                is_transient = "429" in str(e) or "503" in str(e) or "quota" in str(e).lower()
                if is_transient and attempt < max_retries - 1:
                    print(f"Transient error starting stream. Retrying in {delay}s... (Attempt {attempt+1}/{max_retries})")
                    yield f"data: {json.dumps({'retry': True, 'attempt': attempt+1, 'delay': int(delay*1000)})}\n\n"
                    await asyncio.sleep(delay)
                    delay *= 2.5
                else:
                    # Permanent failure or retries exhausted
                    print(f"Permanent stream startup error: {e}")
                    # Rollback the last logged user prompt to keep history alternating
                    rollback_history()
                    yield f"data: {json.dumps({'error': 'Failed to process chat stream.'})}\n\n"
                    return

        # Read stream chunk-by-chunk
        try:
            async for chunk in response_stream:
                # Graceful interruption: check if the client aborted the connection
                if await request.is_disconnected():
                    print("Client disconnected. Aborting Gemini streaming.")
                    break
                
                chunk_text = chunk.text
                full_text += chunk_text
                yield f"data: {json.dumps({'text': chunk_text})}\n\n"
                # Small sleep to cooperatively yield flow to event loop
                await asyncio.sleep(0.01)

            if len(full_text.strip()) > 0 and not await request.is_disconnected():
                stream_succeeded = True

        except Exception as e:
            print(f"Exception during stream reading: {e}")

        # Finalize turn
        if stream_succeeded:
            assistant_msg_id = str(int(datetime.now().timestamp() * 1000) + 1)
            saved_history.append({
                "id": assistant_msg_id,
                "role": "assistant",
                "content": full_text
            })
            save_chat_history(saved_history)

            # Send source materials and trigger completion tag
            yield f"data: {json.dumps({'done': True, 'sources': sources})}\n\n"

            # Trigger non-blocking long-term memory update task
            background_tasks.add_task(update_long_term_memory, message, full_text, GEMINI_API_KEY)
        else:
            # If the user disconnected or the stream aborted mid-way, rollback history
            print("Stream cancelled, empty, or failed. Executing rollback.")
            rollback_history()
            yield f"data: {json.dumps({'error': 'Stream was interrupted.'})}\n\n"

    def rollback_history():
        """Removes the last user message if the assistant response failed."""
        history = load_chat_history()
        if history and history[-1].get('role') == 'user':
            history.pop()
            save_chat_history(history)

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    # Start the server on port 5000 (matching our Node configuration)
    uvicorn.run("server:app", host="127.0.0.1", port=5000, reload=True)
