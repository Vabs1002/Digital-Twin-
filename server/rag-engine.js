import fs from 'fs';
import path from 'path';
import Fuse from 'fuse.js';

const DOCUMENTS_DIR = path.join(process.cwd(), 'documents');
let fuseInstance = null;
let allChunks = [];

// Load and index documents
export function initializeRAG() {
  try {
    if (!fs.existsSync(DOCUMENTS_DIR)) {
      console.warn(`Documents directory not found at ${DOCUMENTS_DIR}. Creating it...`);
      fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
      return;
    }

    const files = fs.readdirSync(DOCUMENTS_DIR).filter(file => file.endsWith('.txt'));
    allChunks = [];

    files.forEach(file => {
      const filePath = path.join(DOCUMENTS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Parse Title
      const lines = content.split('\n');
      let title = file.replace('.txt', '');
      let cleanContent = content;

      if (lines[0] && lines[0].startsWith('Title:')) {
        title = lines[0].replace('Title:', '').trim();
        cleanContent = lines.slice(1).join('\n');
      }

      // Split into paragraphs (chunks)
      const paragraphs = cleanContent
        .split('\n\n')
        .map(p => p.trim())
        .filter(p => p.length > 30); // skip empty or too short lines

      paragraphs.forEach((p, idx) => {
        allChunks.push({
          id: `${file}-chunk-${idx}`,
          text: p,
          source: file,
          title: title
        });
      });
    });

    // Initialize Fuse.js for lightweight, local fuzzy search
    fuseInstance = new Fuse(allChunks, {
      keys: ['text', 'title'],
      threshold: 0.4, // lower threshold = stricter match
      minMatchCharLength: 3,
      includeScore: true
    });

    console.log(`RAG Engine initialized successfully. Loaded ${allChunks.length} chunks from ${files.length} documents.`);
  } catch (error) {
    console.error('Failed to initialize RAG Engine:', error);
  }
}

// Search for relevant document chunks based on a query
export function searchRAG(query, limit = 3) {
  if (!fuseInstance) {
    initializeRAG();
  }

  if (!fuseInstance || allChunks.length === 0) {
    return [];
  }

  const results = fuseInstance.search(query);
  return results.slice(0, limit).map(result => ({
    text: result.item.text,
    source: result.item.source,
    title: result.item.title,
    score: result.score
  }));
}
