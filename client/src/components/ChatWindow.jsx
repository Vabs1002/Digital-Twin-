import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Volume2, VolumeX, Sparkles } from 'lucide-react';

export const ChatWindow = ({ messages, onSendMessage, isThinking, selectedVoice, isStreaming, onStopActiveResponse }) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const textareaRef = useRef(null);

  // Keep latest onSendMessage reference inside a ref to prevent stale closures in STT hook
  const onSendMessageRef = useRef(onSendMessage);
  useEffect(() => {
    onSendMessageRef.current = onSendMessage;
  }, [onSendMessage]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Handle auto-resize of textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputText]);

  // Set up Speech-to-Text (Speech Recognition)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const speechToText = event.results[0][0].transcript;
        if (speechToText && speechToText.trim() !== '') {
          // Force stop the microphone immediately before submitting to avoid listening to the response
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
          onSendMessageRef.current(speechToText.trim());
          setInputText('');
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Listen for Enter key to submit, Shift+Enter to newline
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const toggleMic = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please try Google Chrome or Edge.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      // Immediately stop, clear, and reset the audio queue
      resetAudioQueue();
      
      // Stop the previous Gemini response stream if it is still printing
      onStopActiveResponse();
      
      recognitionRef.current.start();
    }
  };

  const sentencesSentCountRef = useRef(0);
  const audioSessionIdRef = useRef(0);
  const audioQueue = useRef([]);
  const isPlayingQueue = useRef(false);

  // Cleans formatting, markdown, and LaTeX syntax before sending to speech synthesis
  const cleanTextForTTS = (text) => {
    return text
      // Remove leading bullet symbols like "-", "*", "+", "•" followed by space
      .replace(/^\s*[-+*•]\s+/, '')
      // Remove LaTeX math formatting and commands (like \theta, \beta, etc)
      .replace(/\\\w+/g, '')
      // Remove double asterisks (bold), single asterisks, hashtags, underscores, and backticks
      .replace(/[\*\#\_\`]/g, '')
      // Replace LaTeX formatting structures (like subscripts/superscripts) and parenthetical math
      .replace(/[\{\}\[\]\(\)\$]/g, ' ')
      // Normalize any excessive spaces
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Robustly tokenizes dialogue into completed sentences
  const splitIntoSentences = (text) => {
    const sentences = [];
    let currentSentence = '';
    
    // Split by whitespace but keep the whitespace tokens to avoid joining words
    const tokens = text.split(/(\s+)/);
    // Common abbreviations that end in a period but do not signify sentence boundaries
    const abbreviations = ['mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'vs.', 'e.g.', 'i.e.', 'etc.', 'al.', 'approx.', 'fig.'];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Split sentence immediately on newlines / paragraph breaks
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
      
      // Check if this token ends with ending punctuation
      const hasPunctuation = /[.!?]$/.test(trimmed);
      
      if (hasPunctuation) {
        // Strip out brackets/quotes to analyze the raw word
        const cleanWord = trimmed.replace(/[()\[\]{}"']/g, '').toLowerCase();
        
        // Skip splitting if it is a common abbreviation or list item index (e.g., '1.', '2.')
        const isAbbreviation = abbreviations.includes(cleanWord) || abbreviations.includes(cleanWord + '.');
        const isListNumber = /^\d+\.$/.test(trimmed);
        
        // Removed lookahead checking for lowercase nextWord (isContinuation) to prevent stream-instability / queue-freezing bugs
        if (!isAbbreviation && !isListNumber) {
          sentences.push(currentSentence.trim());
          currentSentence = '';
        }
      }
    }
    
    return sentences;
  };

  // Play next audio file in the sentence queue
  const playNextInQueue = () => {
    if (audioQueue.current.length === 0) {
      isPlayingQueue.current = false;
      setIsPlayingAudio(false);
      return;
    }

    isPlayingQueue.current = true;
    setIsPlayingAudio(true);
    const nextAudioUrl = audioQueue.current.shift();
    
    const audio = new Audio(nextAudioUrl);
    audioRef.current = audio;

    audio.onended = () => {
      playNextInQueue();
    };

    audio.onerror = () => {
      console.warn("Audio queue track failed to load, skipping to next.");
      playNextInQueue();
    };

    audio.play().catch(err => {
      console.error("Queue playback error:", err);
      playNextInQueue();
    });
  };

  // Queue an audio URL and trigger player if idle
  const queueAudio = (url) => {
    audioQueue.current.push(url);
    if (!isPlayingQueue.current) {
      playNextInQueue();
    }
  };

  // Stop, clear, and reset the audio queue
  const resetAudioQueue = () => {
    // Increment session ID to immediately discard any in-flight requests
    audioSessionIdRef.current += 1;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    audioQueue.current = [];
    isPlayingQueue.current = false;
    setIsPlayingAudio(false);
    sentencesSentCountRef.current = 0;
  };

  // Generate audio for a single sentence and append it to queue
  const generateAndQueueSentence = async (text) => {
    const cleanedText = cleanTextForTTS(text);
    if (isMuted || !cleanedText) return;
    const sessionId = audioSessionIdRef.current;

    try {
      const response = await fetch(`http://localhost:5000/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanedText, voice: selectedVoice })
      });
      if (!response.ok) {
        throw new Error("Failed to fetch sentence audio file");
      }
      
      const data = await response.json();
      
      // Only queue and play if this request belongs to the active audio session
      if (sessionId === audioSessionIdRef.current && data.audioUrl) {
        queueAudio(data.audioUrl);
      }
    } catch (err) {
      console.error("Error generating speech for sentence:", text, err);
    }
  };

  // Split and queue an entire message (used for manual play click)
  const speakFullMessage = (text) => {
    resetAudioQueue();
    const sentences = splitIntoSentences(text);
    
    if (sentences.length === 0) {
      generateAndQueueSentence(text);
    } else {
      sentences.forEach(sentence => {
        generateAndQueueSentence(sentence);
      });
    }
  };

  // Extract and process any completed sentences during active streaming
  const processNewSentences = (text) => {
    if (isMuted || !text) return;

    // Do not speak temporary/system retry status messages
    if (text.startsWith('*(')) return;

    const sentences = splitIntoSentences(text);
    const sentCount = sentencesSentCountRef.current;
    
    if (sentences.length > sentCount) {
      for (let i = sentCount; i < sentences.length; i++) {
        const sentenceToSpeak = sentences[i];
        sentencesSentCountRef.current = i + 1; // Increment immediately to prevent duplicate requests
        generateAndQueueSentence(sentenceToSpeak);
      }
    }
  };

  // Extract completed sentences and clear any leftover text when streaming ends
  const handleStreamEnd = (text) => {
    if (!text) return;
    
    // Do not speak temporary/system retry status messages
    if (text.startsWith('*(')) return;

    const sentences = splitIntoSentences(text);
    const sentCount = sentencesSentCountRef.current;
    
    if (sentences.length > sentCount) {
      for (let i = sentCount; i < sentences.length; i++) {
        generateAndQueueSentence(sentences[i]);
      }
      sentencesSentCountRef.current = sentences.length;
    }
    
    // Process leftover text at the end of the stream (e.g. final text without trailing punctuation)
    const processedText = sentences.join(' ');
    // Handle leftover text by stripping any leading characters matching processedText
    const leftover = text.trim().substring(processedText.trim().length).trim();
    if (leftover.length > 0) {
      generateAndQueueSentence(leftover);
    }
  };

  // Listen for streaming updates to process sentences in real-time
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        if (isStreaming) {
          processNewSentences(lastMessage.content);
        } else {
          // When streaming finishes, process any leftovers
          handleStreamEnd(lastMessage.content);
        }
      }
    }
  }, [messages, isStreaming]);

  // Clean the queue when starting a new stream
  useEffect(() => {
    if (isStreaming) {
      resetAudioQueue();
    }
  }, [isStreaming]);

  // Pause audio immediately if muted by user
  useEffect(() => {
    if (isMuted) {
      resetAudioQueue();
    }
  }, [isMuted]);

  const formatText = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} style={{ color: '#fff', fontWeight: 650 }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index}>{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  return (
    <div className="figma-canvas">
      {/* Visual Header bar with photo and name */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(255, 255, 255, 0.02)',
        backdropFilter: 'blur(8px)',
        borderTopLeftRadius: 'var(--radius-lg)',
        borderTopRightRadius: 'var(--radius-lg)',
        flexShrink: 0
      }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', border: '1.5px solid var(--figma-purple)' }}>
          <img src="/andrew-ng.jpg" alt="Andrew Ng Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 650, color: 'white', letterSpacing: '0.2px' }}>Andrew Ng</span>
          <span style={{ fontSize: '0.62rem', color: 'var(--figma-purple)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="status-dot pulsing" style={{ backgroundColor: 'var(--figma-purple)', width: '6px', height: '6px' }}></span>
            Online • Virtual Twin
          </span>
        </div>
      </div>

      {/* Scrollable Chat Area */}
      <div className="canvas-chat-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', marginBottom: '12px', border: '2px solid var(--figma-purple)' }}>
              <img src="/andrew-ng.jpg" alt="Andrew Ng Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <h3>Andrew Ng Digital Twin</h3>
            <p style={{ maxWidth: '380px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Welcome Vaibhav! Type a query or click syllabus files on the left to start studying AI.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`figma-bubble-wrapper ${msg.role}`}>
              <div className="figma-avatar" style={{ overflow: 'hidden' }}>
                {msg.role === 'user' ? (
                  'U'
                ) : (
                  <img src="/andrew-ng.jpg" alt="Andrew Ng Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className="figma-bubble">
                  {msg.content.split('\n').map((line, i) => (
                    <p key={i} style={{ marginBottom: line.trim() === '' ? '12px' : '4px' }}>
                      {formatText(line)}
                    </p>
                  ))}
                </div>
                {msg.role === 'assistant' && (
                  <button 
                    onClick={() => speakFullMessage(msg.content)} 
                    className="figma-audio-btn"
                    title="Speak text"
                  >
                    <Volume2 size={11} />
                    <span>Listen (Neural Voice)</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {isThinking && (
          <div className="figma-bubble-wrapper assistant">
            <div className="figma-avatar" style={{ overflow: 'hidden' }}>
              <img src="/andrew-ng.jpg" alt="Andrew Ng Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div className="figma-bubble">
              <div className="typing-indicator" style={{ padding: '4px' }}>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar / Canvas Footer */}
      <form onSubmit={handleSend} className="canvas-input-area">
        <button
          type="button"
          onClick={() => setIsMuted(!isMuted)}
          className="btn-icon"
          title={isMuted ? "Unmute Audio" : "Mute Audio"}
          style={{ borderRadius: 'var(--radius-md)', width: '38px', height: '38px' }}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {isPlayingAudio && (
          <div style={{ fontSize: '0.7rem', color: 'var(--figma-blue)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <div className="status-dot pulsing" style={{ backgroundColor: 'var(--figma-blue)' }}></div>
            <span>Andrew speaking...</span>
          </div>
        )}

        <div className="figma-input-wrapper">
          <textarea
            ref={textareaRef}
            rows={1}
            className="figma-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question (Press Enter to send, Shift+Enter for newline)..."
            disabled={isThinking}
            style={{ overflowY: 'auto' }}
          />
          <button
            type="button"
            onClick={toggleMic}
            className={`figma-mic-btn ${isListening ? 'active' : ''}`}
            title="Speech to Text"
          >
            <Mic size={16} />
          </button>
        </div>

        <button 
          type="submit" 
          className="figma-send-btn" 
          disabled={isThinking || !inputText.trim()}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};
