import { useState, useEffect, useRef } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { MemoryDashboard } from './components/MemoryDashboard';
import { RAGViewer } from './components/RAGViewer';
import { VoiceSelector } from './components/VoiceSelector';
import { 
  FileText, MessageSquare, Brain, Sparkles, 
  HelpCircle, Eye, RefreshCw, X, HardDrive
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface RAGSource {
  text: string;
  source: string;
  title: string;
}

interface MemoryData {
  userName: string;
  userAge: string;
  userBackground: string;
  topicsDiscussed: string[];
  userGoals: string;
  lastInteracted: string;
}

interface DocumentItem {
  name: string;
  title: string;
}

const BACKEND_URL = 'http://localhost:5000';

function App() {
  const chatAbortControllerRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [sources, setSources] = useState<RAGSource[]>([]);
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Workspace files list
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocContent, setSelectedDocContent] = useState<string | null>(null);
  const [selectedDocTitle, setSelectedDocTitle] = useState<string>('');

  // Voice selection state
  const [selectedVoice, setSelectedVoice] = useState<string>(() => {
    return localStorage.getItem('andrew_selected_voice') || 'en-US-AndrewNeural';
  });

  const handleVoiceChange = (voiceId: string) => {
    setSelectedVoice(voiceId);
    localStorage.setItem('andrew_selected_voice', voiceId);
  };

  // Fetch initial profile
  const fetchMemory = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/memory?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        setMemory(data);
      }
    } catch (error) {
      console.error('Error fetching memory:', error);
    }
  };

  // Fetch chat history log
  const fetchHistory = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/history?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  // Fetch files indexed for RAG
  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/documents?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Error fetching documents list:', error);
    }
  };

  useEffect(() => {
    fetchMemory();
    fetchHistory();
    fetchDocuments();
  }, []);

  // Open a course document modal
  const handleOpenDoc = async (docName: string, docTitle: string) => {
    try {
      setSelectedDocTitle(docTitle);
      const response = await fetch(`${BACKEND_URL}/api/documents/${docName}?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedDocContent(data.content);
      } else {
        setSelectedDocContent("Failed to load lecture content.");
      }
    } catch (error) {
      console.error("Error opening document:", error);
      setSelectedDocContent("Failed to load lecture content due to network issues.");
    }
  };

  // Clear modal state
  const handleCloseDoc = () => {
    setSelectedDocContent(null);
    setSelectedDocTitle('');
  };

  // Stop active response stream
  const handleStopActiveResponse = () => {
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
    }
    setIsThinking(false);
    setIsStreaming(false);
  };

  // Streaming Send Message pipeline
  const handleSendMessage = async (text: string) => {
    // 1. Abort previous request in flight
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);
    setIsStreaming(true);

    // 2. Create new AbortController
    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

    try {
      const chatHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatHistory
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error('API server returned error');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error('ReadableStream not supported');
      }

      const assistantMsgId = (Date.now() + 1).toString();
      const initialAssistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: ''
      };

      setMessages(prev => [...prev, initialAssistantMsg]);
      setIsThinking(false);

      let assistantReply = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.substring(6));
              
              if (data.text) {
                // Clear any retry helper message on first content packet
                if (assistantReply.startsWith('*(Gemini is busy')) {
                  assistantReply = '';
                }
                assistantReply += data.text;
                setMessages(prev => 
                  prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantReply } : m)
                );
              } else if (data.retry) {
                const secs = (data.delay / 1000).toFixed(1);
                const retryText = `*(Gemini is busy. Retrying connection (attempt ${data.attempt}/3) in ${secs}s...)*`;
                assistantReply = retryText; // Store in local variable so we clear it on text arrival
                setMessages(prev => 
                  prev.map(m => m.id === assistantMsgId ? { ...m, content: retryText } : m)
                );
              } else if (data.sources) {
                setSources(data.sources);
              } else if (data.error) {
                throw new Error(data.error);
              }
            } catch (err) {}
          }
        }
      }

      if (buffer.trim().startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.trim().substring(6));
          if (data.text) {
            if (assistantReply.startsWith('*(Gemini is busy')) {
              assistantReply = '';
            }
            assistantReply += data.text;
            setMessages(prev => 
              prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantReply } : m)
            );
          }
        } catch (e) {}
      }

      // Sync memory dashboard
      setTimeout(fetchMemory, 300);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Previous chat request aborted by user interruption.');
        return; // Exit silently
      }
      console.error('Error during chat request:', error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I encountered a quota rate limit. Let's wait a few seconds and try again."
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsThinking(false);
      setIsStreaming(false);
      if (chatAbortControllerRef.current === controller) {
        chatAbortControllerRef.current = null;
      }
    }
  };

  // Reset Memory and chat log database
  const handleResetMemory = async () => {
    if (!window.confirm("Are you sure you want to clear Andrew's memory and reset the classroom?")) {
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/memory`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const data = await response.json();
        setMemory(data.memory);
        setMessages([]);
        setSources([]);
        alert("Andrew's memory and classroom logs have been reset.");
      }
    } catch (error) {
      console.error('Failed to reset memory:', error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Figma Header / Topbar */}
      <header className="figma-topbar">
        <div className="figma-logo-group">
          <div className="figma-icon">A</div>
          <span className="figma-filename">Andrew Ng - Digital Twin Workspace</span>
          <span className="figma-file-badge">Draft</span>
        </div>

        {/* Center tools */}
        <div className="figma-toolbar-center">
          <button className="toolbar-btn active">
            <MessageSquare size={14} />
            <span>Classroom Chat</span>
          </button>
          <button onClick={() => handleOpenDoc(documents[0]?.name || 'supervised-learning.txt', documents[0]?.title || 'Supervised Learning')} className="toolbar-btn" disabled={documents.length === 0}>
            <Eye size={14} />
            <span>Quick Inspect Syllabus</span>
          </button>
        </div>

        {/* Right tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="speaker-status-bar">
            <div className="status-dot pulsing"></div>
            <span>LIVE SERVER</span>
          </div>

          <button onClick={fetchMemory} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', display: 'flex', gap: '6px' }} title="Sync Workspace">
            <RefreshCw size={12} />
            <span>Sync</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <Sparkles size={12} style={{ color: 'var(--figma-purple)' }} />
            <span>Gemini 2.5 Flash</span>
          </div>
        </div>
      </header>

      {/* Figma 3-Column Workspace */}
      <div className="figma-workspace">
        
        {/* Left Column: Explorer */}
        <aside className="figma-sidebar">
          <div className="sidebar-header">
            <span>Layers / Syllabus</span>
            <HardDrive size={12} />
          </div>
          
          <div className="sidebar-content">
            {/* Lecture Syllabus Section */}
            <div>
              <div className="tree-section-title">Lecture Syllabus (RAG Index)</div>
              {documents.length === 0 ? (
                <div style={{ paddingLeft: '8px', fontSize: '0.75rem', color: 'var(--text-dark)' }}>No documents found.</div>
              ) : (
                documents.map((doc) => (
                  <div 
                    key={doc.name} 
                    className="tree-item"
                    onClick={() => handleOpenDoc(doc.name, doc.title)}
                  >
                    <FileText size={14} style={{ color: 'var(--figma-purple)' }} />
                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {doc.title}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Simulated Pages Section */}
            <div>
              <div className="tree-section-title">Active Pages</div>
              <div className="tree-item active">
                <MessageSquare size={14} />
                <span>AI Teacher (Dialogue Canvas)</span>
              </div>
              <div className="tree-item" onClick={handleResetMemory}>
                <Brain size={14} />
                <span>Reset Space / Retake Course</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center Column: Chat Canvas */}
        <main className="figma-canvas">
          <ChatWindow 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            isThinking={isThinking} 
            selectedVoice={selectedVoice}
            isStreaming={isStreaming}
            onStopActiveResponse={handleStopActiveResponse}
          />
        </main>

        {/* Right Column: Properties Inspector */}
        <aside className="figma-sidebar right">
          <div className="sidebar-header">
            <span>Properties Inspector</span>
            <HelpCircle size={12} />
          </div>
          
          <div className="sidebar-content" style={{ padding: 0 }}>
            {/* Voice Selection card */}
            <VoiceSelector 
              selectedVoice={selectedVoice} 
              onVoiceChange={handleVoiceChange} 
            />

            {/* Memory card values */}
            <MemoryDashboard 
              memory={memory} 
              onResetMemory={handleResetMemory} 
            />

            {/* RAG Source Matches card */}
            <RAGViewer 
              sources={sources} 
            />
          </div>
        </aside>
      </div>

      {/* Document Viewer Modal Overlay */}
      {selectedDocContent && (
        <div className="modal-overlay" onClick={handleCloseDoc}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📚 Studying Lecture: {selectedDocTitle}</h3>
              <button onClick={handleCloseDoc} className="modal-close-btn">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {selectedDocContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
