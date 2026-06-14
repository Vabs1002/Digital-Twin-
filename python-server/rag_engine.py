import os
from rapidfuzz import fuzz

# Directory where Stanford lecture notes are located
DOCUMENTS_DIR = os.path.join(os.getcwd(), 'documents')

# In-memory list to hold all text paragraphs
all_chunks = []

def initialize_rag():
    """
    Reads the text files in the documents directory, parses their titles,
    splits them into paragraphs, and loads them into memory for search.
    """
    global all_chunks
    if not os.path.exists(DOCUMENTS_DIR):
        print(f"Warning: Documents directory not found at {DOCUMENTS_DIR}. Creating it...")
        os.makedirs(DOCUMENTS_DIR, exist_ok=True)
        return

    files = [f for f in os.listdir(DOCUMENTS_DIR) if f.endswith('.txt')]
    all_chunks = []

    for file in files:
        file_path = os.path.join(DOCUMENTS_DIR, file)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            lines = content.split('\n')
            title = file.replace('.txt', '')
            clean_content = content

            # Check if the first line defines a custom Title header
            if lines and lines[0].startswith('Title:'):
                title = lines[0].replace('Title:', '').strip()
                clean_content = '\n'.join(lines[1:])

            # Split content by double newlines to isolate paragraphs
            paragraphs = [p.strip() for p in clean_content.split('\n\n') if p.strip()]
            
            # Filter out chunks that are too short (less than 30 characters) to avoid empty lines
            valid_paragraphs = [p for p in paragraphs if len(p) > 30]

            for idx, p in enumerate(valid_paragraphs):
                all_chunks.append({
                    "id": f"{file}-chunk-{idx}",
                    "text": p,
                    "source": file,
                    "title": title
                })
        except Exception as e:
            print(f"Error loading document {file}: {e}")

    print(f"RAG Engine successfully loaded {len(all_chunks)} chunks from {len(files)} documents.")

def search_rag(query: str, limit: int = 3):
    """
    Runs a fuzzy match search across all paragraphs in memory.
    Ranks them using rapidfuzz token similarity matching.
    """
    global all_chunks
    if not all_chunks:
        initialize_rag()

    if not all_chunks:
        return []

    results = []
    for chunk in all_chunks:
        # Score the relevance against both the text and the title
        # token_set_ratio handles multi-word query keywords matching out of order
        text_score = fuzz.token_set_ratio(query, chunk["text"])
        title_score = fuzz.token_set_ratio(query, chunk["title"])
        
        # Take the best score
        score = max(text_score, title_score)
        
        # We only accept reasonable matches (similarity score above 35 out of 100)
        if score > 35:
            results.append({
                "text": chunk["text"],
                "source": chunk["source"],
                "title": chunk["title"],
                "score": score
            })

    # Sort results by score in descending order (highest score first)
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]
