import os
import google.generativeai as genai
import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Google Generative AI for Embeddings
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

DOCUMENTS_DIR = os.path.join(os.getcwd(), 'documents')
CHROMA_DIR = os.path.join(os.getcwd(), 'chroma_db')

# Initialize local, persistent ChromaDB client
chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)

# Get or create collection with Cosine similarity space
collection = chroma_client.get_or_create_collection(
    name="stanford_lectures",
    metadata={"hnsw:space": "cosine"}
)

def get_embedding(text: str, is_query: bool = False) -> list:
    """
    Generates a dense vector embedding using Google's text-embedding-004 model.
    Uses 'retrieval_document' for document paragraphs and 'retrieval_query' for queries.
    """
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured in .env file.")
        
    task_type = "retrieval_query" if is_query else "retrieval_document"
    response = genai.embed_content(
        model="models/text-embedding-004",
        content=text,
        task_type=task_type
    )
    return response['embedding']

def initialize_rag():
    """
    Scans the documents directory, splits text into paragraphs, 
    computes embeddings, and indexes them in ChromaDB.
    Skips re-indexing if ChromaDB already has records to conserve API quota.
    """
    if not os.path.exists(DOCUMENTS_DIR):
        print(f"Warning: Documents directory not found at {DOCUMENTS_DIR}. Creating it...")
        os.makedirs(DOCUMENTS_DIR, exist_ok=True)
        return

    # Check if we already have documents indexed in ChromaDB
    total_docs = collection.count()
    if total_docs > 0:
        print(f"RAG Engine: Already found {total_docs} paragraphs in ChromaDB. Skipping re-indexing.")
        return

    files = [f for f in os.listdir(DOCUMENTS_DIR) if f.endswith('.txt')]
    if not files:
        print("RAG Engine: No lecture note txt files found in documents/ folder.")
        return

    print("RAG Engine: ChromaDB is empty. Starting semantic indexing...")
    
    documents_list = []
    embeddings_list = []
    metadatas_list = []
    ids_list = []

    for file in files:
        file_path = os.path.join(DOCUMENTS_DIR, file)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            lines = content.split('\n')
            title = file.replace('.txt', '')
            clean_content = content

            if lines and lines[0].startswith('Title:'):
                title = lines[0].replace('Title:', '').strip()
                clean_content = '\n'.join(lines[1:])

            paragraphs = [p.strip() for p in clean_content.split('\n\n') if p.strip()]
            valid_paragraphs = [p for p in paragraphs if len(p) > 30]

            for idx, p in enumerate(valid_paragraphs):
                # Generate embedding for the paragraph
                print(f"Embedding chunk {idx} of {file}...")
                embedding = get_embedding(p, is_query=False)
                
                chunk_id = f"{file}-chunk-{idx}"
                documents_list.append(p)
                embeddings_list.append(embedding)
                metadatas_list.append({
                    "source": file,
                    "title": title
                })
                ids_list.append(chunk_id)

        except Exception as e:
            print(f"Error indexing document {file}: {e}")

    # Add all records in bulk to ChromaDB
    if documents_list:
        try:
            collection.add(
                documents=documents_list,
                embeddings=embeddings_list,
                metadatas=metadatas_list,
                ids=ids_list
            )
            print(f"RAG Engine: Successfully indexed {collection.count()} paragraphs in ChromaDB.")
        except Exception as e:
            print(f"Error saving embeddings to ChromaDB: {e}")

def search_rag(query: str, limit: int = 3):
    """
    Computes query vector embedding and runs a cosine distance search
    across ChromaDB collection. Returns the top relevant passages.
    """
    total_docs = collection.count()
    if total_docs == 0:
        initialize_rag()

    if collection.count() == 0:
        return []

    try:
        # Generate embedding for search query
        query_embedding = get_embedding(query, is_query=True)

        # Query ChromaDB using vector similarity
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=limit
        )

        formatted_results = []
        if results and results["documents"]:
            # ChromaDB query response lists: documents[0][i], metadatas[0][i], distances[0][i]
            docs = results["documents"][0]
            metas = results["metadatas"][0]
            dists = results["distances"][0]

            for i in range(len(docs)):
                formatted_results.append({
                    "text": docs[i],
                    "source": metas[i]["source"],
                    "title": metas[i]["title"],
                    "score": dists[i]  # Cosine distance (0.0 is perfect, 1.0 is orthogonal)
                })

        return formatted_results
    except Exception as e:
        print(f"Semantic search failed: {e}")
        return []
