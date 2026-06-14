import re

def search_text():
    file_path = "C:\\Users\\vabsd\\.gemini\\antigravity\\brain\\61c87642-b10b-4788-a725-e9a14ef000bb\\.system_generated\\steps\\303\\content.md"
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        print("File size:", len(content))
        
        # Look for any JSON-like strings that represent frames, layers, or page titles
        # Let's search for "name" fields or words related to the design
        matches = re.findall(r'"name":"([^"]+)"', content)
        unique_matches = set(matches)
        
        print("\nFound unique names/words in HTML:")
        keywords = ["frame", "page", "rect", "vector", "text", "card", "dashboard", "chat", "panel", "sidebar", "button", "avatar", "profile"]
        for m in unique_matches:
            if any(k in m.lower() for k in keywords) or len(m) > 10:
                print("  -", m)
                
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    search_text()
