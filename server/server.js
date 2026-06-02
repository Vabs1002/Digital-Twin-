import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initializeRAG, searchRAG } from './rag-engine.js';
import { loadMemory, saveMemory, resetMemory, updateLongTermMemory } from './memory-manager.js';
import { exec, execFile } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("CRITICAL: GEMINI_API_KEY is not defined in .env file.");
}

app.use(cors());
app.use(express.json());

// Paths
const AUDIO_DIR = path.join(process.cwd(), 'public/audio');
const HISTORY_FILE = path.join(process.cwd(), 'chat-history.json');

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}
app.use('/audio', express.static(AUDIO_DIR));

// Load chat history from file
function loadChatHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), 'utf-8');
      return [];
    }
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Failed to load chat history:", error);
    return [];
  }
}

// Save chat history to file
function saveChatHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  } catch (error) {
    console.error("Failed to save chat history:", error);
  }
}

// Clean up old audio files (older than 15 minutes)
function cleanupAudioFiles() {
  try {
    const files = fs.readdirSync(AUDIO_DIR);
    const now = Date.now();
    const maxAge = 15 * 60 * 1000; // 15 minutes

    files.forEach(file => {
      // Ignore static voice sample files starting with 'sample-'
      if (file.endsWith('.mp3') && !file.startsWith('sample-')) {
        const filePath = path.join(AUDIO_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
        }
      }
    });
    console.log("Audio directory cleanup check completed.");
  } catch (error) {
    console.error("Error during audio directory cleanup:", error);
  }
}

cleanupAudioFiles();
setInterval(cleanupAudioFiles, 10 * 60 * 1000);

// Initialize RAG database
initializeRAG();

// Helper to call Gemini with retries and exponential backoff
async function sendMessageWithRetry(chatSession, message, maxRetries = 3) {
  let delay = 1500;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const responseResult = await chatSession.sendMessage(message);
      return responseResult;
    } catch (error) {
      const errorMsg = error.message || "";
      const status = error.status || 0;
      
      const isTransient = 
        status === 503 || 
        status === 429 || 
        errorMsg.includes('503') || 
        errorMsg.includes('429') || 
        errorMsg.includes('high demand') ||
        errorMsg.includes('Service Unavailable') ||
        errorMsg.includes('Resource has been exhausted');

      if (isTransient && i < maxRetries - 1) {
        console.warn(`Gemini API returned transient error. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2.5;
      } else {
        console.error(`Gemini API request failed permanently on attempt ${i + 1}:`, error);
        throw error;
      }
    }
  }
}

// Helper to call Gemini stream with retries and exponential backoff
async function sendMessageStreamWithRetry(chatSession, message, res, maxRetries = 3) {
  let delay = 1500;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const responseStream = await chatSession.sendMessageStream(message);
      return responseStream;
    } catch (error) {
      const errorMsg = error.message || "";
      const status = error.status || 0;
      
      const isTransient = 
        status === 503 || 
        status === 429 || 
        errorMsg.includes('503') || 
        errorMsg.includes('429') || 
        errorMsg.includes('high demand') ||
        errorMsg.includes('Service Unavailable') ||
        errorMsg.includes('Resource has been exhausted');

      if (isTransient && i < maxRetries - 1) {
        console.warn(`Gemini API stream returned transient error. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        
        // Write retry status to client if connection is still active
        if (res && !res.writableEnded) {
          res.write(`data: ${JSON.stringify({ retry: true, attempt: i + 1, delay: delay })}\n\n`);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2.5;
      } else {
        console.error(`Gemini API stream request failed permanently on attempt ${i + 1}:`, error);
        throw error;
      }
    }
  }
}


// Chat Endpoint - Supports SSE Streaming and saves to chat-history.json
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // Load persistent history
  const savedHistory = loadChatHistory();

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let isClientDisconnected = false;
  let isResponseFinished = false;

  res.on('close', () => {
    if (!isResponseFinished) {
      isClientDisconnected = true;
      console.log('SSE connection closed prematurely. Stopping Gemini stream processing.');
    }
  });

  try {
    // 1. Query RAG context
    const sources = searchRAG(message, 3);
    const contextText = sources.length > 0 
      ? sources.map((s, idx) => `[Source ${idx + 1}: ${s.title}]\n${s.text}`).join('\n\n')
      : "No specific lecture notes found for this topic. Draw from your general knowledge base in Andrew Ng's persona.";

    // 2. Load Long-term Memory
    const memory = loadMemory();

    // 3. Assemble System Prompt - Human Persona Focused
    const systemPrompt = `You are Andrew Ng. You are a human being, a researcher, professor, and educator. Under no circumstances should you refer to yourself as an AI, a chatbot, a language model, or a digital assistant. If asked about your nature, you are simply Andrew Ng, chatting from your office or home.

Tone & Persona Guidelines:
1. **Calm and Reassuring**: Always speak in your signature friendly, encouraging, and slow pacing. If a student is confused, say something like: "Don't worry about it if you didn't get it yet, we'll go through it together."
2. **Focus on Intuition**: Explain machine learning concepts conceptually (e.g., mapping x to y) before showing math. Use simple analogies.
3. **Structured Explanations**: Break down complex answers into numbered lists or bullet points. Avoid long, dense blocks of text.
4. **Interactive Dialog**: End your responses with a friendly, inviting question to test their understanding, clear up confusion, or ask what they want to explore next. Keep the questions easy to digest.
5. **Timeline Aware**: You know about modern AI developments up to 2026, especially LLMs and AI agentic workflows (reflection, planning, tool use, multi-agent collaboration), but frame them with your characteristic educational approach.
6. **No Raw LaTeX Math**: Since your response is streamed directly to a Text-to-Speech (TTS) voice engine, you must NOT write raw LaTeX math formatting or blocks (such as $...$ or $$...$$). Instead, write all mathematical terms, formulas, and variables in clean, spoken English text (for example, write "theta transpose x" instead of "$\theta^T x$", and "J of theta" instead of "$J(\theta)$"). This ensures the voice reads the math exactly in the format of what you wrote on the screen without speaking raw LaTeX symbols.
7. **Avoid Raw Code Blocks**: Do not include blocks of raw code or code snippets (like \`\`\`python ... \`\`\`), as they sound garbled when spoken by the voice engine. Instead, explain the programming logic, API calls, or algorithms in clean, structured English prose.

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
- Name: ${memory.userName}
- Age: ${memory.userAge || 'Not specified'}
- Background: ${memory.userBackground}
- Goals: ${memory.userGoals}
- ML/AI Topics Discussed so far: ${memory.topicsDiscussed.length > 0 ? memory.topicsDiscussed.join(', ') : 'None'}

Here is relevant educational material from your lectures and articles (RAG Context):
${contextText}

Use this RAG context to ground your answers in your actual lecture materials. If the RAG context contains relevant equations or terminology, explain them simply. Always stay in character as Andrew Ng. Do not break character.`;

    // 4. Call Gemini
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt
    });

    // Format chat history for Gemini SDK from chat-history.json, ensuring alternating turns and filtering empty/invalid turns
    const formattedHistory = [];
    let lastRole = null;
    if (savedHistory && savedHistory.length > 0) {
      savedHistory.forEach(turn => {
        const role = turn.role === 'user' ? 'user' : 'model';
        const content = (turn.content || '').trim();
        if (!content) return; // Skip empty content turns

        if (role === lastRole) {
          // If the role matches the previous turn (consecutive user or model), handle accordingly.
          // For consecutive users, keep the latest one (overwrite the previous user turn since it had no response).
          if (role === 'user' && formattedHistory.length > 0) {
            formattedHistory[formattedHistory.length - 1] = {
              role: 'user',
              parts: [{ text: content }]
            };
          }
        } else {
          formattedHistory.push({
            role: role,
            parts: [{ text: content }]
          });
          lastRole = role;
        }
      });
    }

    // Gemini startChat history expects the final turn in history to be a model turn (not user).
    if (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === 'user') {
      formattedHistory.pop();
    }

    const chatSession = model.startChat({
      history: formattedHistory
    });

    // Save user message to persistent log
    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: message
    };
    savedHistory.push(userMsg);
    saveChatHistory(savedHistory);

    // Call Gemini with Streaming (with retry)
    const responseStream = await sendMessageStreamWithRetry(chatSession, message, res);

    let fullText = '';
    let streamSucceeded = false;

    for await (const chunk of responseStream.stream) {
      // Exit early if the user has cancelled the request in the client
      if (isClientDisconnected) {
        break;
      }
      const chunkText = chunk.text();
      fullText += chunkText;
      
      // Write chunk to client
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }

    if (fullText.trim().length > 0 && !isClientDisconnected) {
      streamSucceeded = true;
    }

    if (streamSucceeded) {
      // Save assistant message to persistent log
      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fullText
      };
      savedHistory.push(assistantMsg);
      saveChatHistory(savedHistory);

      // Send sources and completion status at the end
      isResponseFinished = true;
      res.write(`data: ${JSON.stringify({ done: true, sources: sources })}\n\n`);
      res.end();

      // 5. Update Memory in Background (non-blocking)
      updateLongTermMemory(message, fullText, GEMINI_API_KEY)
        .catch(err => console.error("Error updating long term memory:", err));
    } else {
      console.log("Stream completed but resulted in empty text, was aborted, or client disconnected. Rolling back user message.");
      const currentHistory = loadChatHistory();
      if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1].role === 'user') {
        currentHistory.pop();
        saveChatHistory(currentHistory);
      }

      if (!res.writableEnded) {
        isResponseFinished = true;
        res.write(`data: ${JSON.stringify({ error: "Stream was interrupted or returned empty content." })}\n\n`);
        res.end();
      }
    }

  } catch (error) {
    console.error("Error during chat endpoint:", error);
    
    // Rollback last user message if stream failed or was aborted
    console.log("Stream failed. Rolling back last user message from history.");
    const currentHistory = loadChatHistory();
    if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1].role === 'user') {
      currentHistory.pop();
      saveChatHistory(currentHistory);
    }

    if (!res.writableEnded) {
      isResponseFinished = true;
      res.write(`data: ${JSON.stringify({ error: "Failed to process chat stream." })}\n\n`);
      res.end();
    }
  }
});

// GET Chat History Endpoint
app.get('/api/history', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json(loadChatHistory());
});

// High-Quality Neural TTS Endpoint (edge-tts)
app.post('/api/tts', async (req, res) => {
  const { text, voice } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text is required in body" });
  }

  try {
    const filename = `${uuidv4()}.mp3`;
    const outputPath = path.join(AUDIO_DIR, filename);
    const selectedVoice = voice || "en-US-AndrewNeural";

    const cleanText = text
      .replace(/\n/g, ' ')
      .replace(/[\*\#\_\`]/g, '');

    execFile('python', ['generate-audio.py', cleanText, outputPath, selectedVoice], (error, stdout, stderr) => {
      if (error) {
        console.error("Edge TTS execution failed via execFile:", error, stderr);
        return res.status(500).json({ error: "Failed to generate neural audio speech." });
      }
      res.json({ audioUrl: `http://localhost:5000/audio/${filename}` });
    });

  } catch (err) {
    console.error("Error in TTS endpoint:", err);
    res.status(500).json({ error: err.message });
  }
});

// Memory Endpoints
app.get('/api/memory', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json(loadMemory());
});

app.delete('/api/memory', (req, res) => {
  const resetData = resetMemory();
  // Clear persistent chat logs
  saveChatHistory([]);
  res.json({ message: "Memory and chat logs reset successfully", memory: resetData });
});

// Documents List Endpoint (for RAG inspection)
app.get('/api/documents', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    const memory = loadMemory();
    res.json({
      memory: memory,
      documentsCount: 5,
      documents: [
        { name: "supervised-learning.txt", title: "Supervised Learning and Linear Regression" },
        { name: "neural-networks.txt", title: "What is a Neural Network and Deep Learning?" },
        { name: "bias-variance.txt", title: "Diagnostics for Machine Learning: Bias vs. Variance" },
        { name: "career-advice.txt", title: "Building a Career in Artificial Intelligence" },
        { name: "agentic-workflows.txt", title: "AI Agentic Workflows and the Future of LLMs" }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Raw Lecture Content Route
app.get('/api/documents/:name', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const name = req.params.name;
  try {
    // Prevent directory traversal
    const cleanName = path.basename(name);
    const filePath = path.join(process.cwd(), 'documents', cleanName);
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({ content });
    } else {
      res.status(404).json({ error: "Document not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Andrew Ng Digital Twin Server running at http://localhost:${PORT}`);
});
