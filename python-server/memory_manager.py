import os
import json
import re
from datetime import datetime

MEMORY_FILE = os.path.join(os.getcwd(), 'memory.json')

# Default memory template for a new student
DEFAULT_MEMORY = {
    "userName": "Learner",
    "userAge": "Not specified",
    "userBackground": "Beginner starting their AI journey",
    "topicsDiscussed": [],
    "userGoals": "To learn artificial intelligence and machine learning in an interactive way",
    "lastInteracted": datetime.utcnow().isoformat() + "Z"
}

def load_memory():
    """
    Loads student profile memory from memory.json file.
    Creates and returns DEFAULT_MEMORY if the file doesn't exist.
    """
    try:
        if not os.path.exists(MEMORY_FILE):
            save_memory(DEFAULT_MEMORY)
            return DEFAULT_MEMORY
        
        with open(MEMORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading memory: {e}")
        return DEFAULT_MEMORY

def save_memory(memory_data):
    """
    Saves the student profile memory dict back to memory.json.
    """
    try:
        with open(MEMORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(memory_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving memory: {e}")

def reset_memory():
    """
    Resets the memory file to the default student profile.
    """
    save_memory(DEFAULT_MEMORY)
    return DEFAULT_MEMORY

async def update_long_term_memory(user_message: str, assistant_message: str, api_key: str = None):
    """
    Runs a lightweight parsing routine over the conversation turn to extract
    the student's name, age, background, learning goals, and topics discussed.
    Saves updates back to memory.json.
    """
    try:
        current_memory = load_memory()
        user_lower = user_message.lower().strip()
        assistant_lower = assistant_message.lower().strip()

        # 1. Extract Name (e.g. "my name is Vaibhav", "i am Alex")
        name_match = re.search(r'(?:my name is|i am|call me)\s+([a-zA-Z]+)', user_message, re.IGNORECASE)
        if name_match:
            name_candidate = name_match.group(1).strip()
            blacklisted_names = {"a", "the", "not", "learning", "trying", "very", "strictly", "here", "ready", "student", "beginner"}
            if name_candidate.lower() not in blacklisted_names:
                current_memory["userName"] = name_candidate.capitalize()

        # 2. Extract Age (e.g. "i am 20 years old", "i'm 22", "age is 25")
        age_match = (
            re.search(r'(?:i am|i\'m|my age is)\s+(\d{1,2})(?:\s*years?\s*old|\s*years?\s*of\s*age)?', user_message, re.IGNORECASE)
            or re.search(r'(\d{1,2})\s*(?:years?\s*old|yo)', user_message, re.IGNORECASE)
        )
        if age_match:
            current_memory["userAge"] = f"{age_match.group(1)} years old"

        # 3. Extract Background Level (e.g. "i am a beginner", "i'm a developer")
        background_match = re.search(r'(?:i am a|i\'m a|i am|i\'m)\s+(beginner|student|engineer|programmer|developer|expert|novice|researcher)', user_message, re.IGNORECASE)
        if background_match:
            current_memory["userBackground"] = f"Identified as a {background_match.group(1).lower()}"

        # 4. Extract Goals (e.g. "i want to learn linear regression", "teach me about neural networks")
        goal_match = re.search(r'(?:i want to learn|i\'m trying to learn|my goal is to|i want to understand|teach me about)\s+([^.!?]+)', user_message, re.IGNORECASE)
        if goal_match:
            current_memory["userGoals"] = f"To understand and master {goal_match.group(1).strip()}"

        # 5. Extract Topics Discussed using keyword matches
        topics_map = [
            { "term": "Supervised Learning", "keywords": ["supervised learning", "classification", "regression"] },
            { "term": "Linear Regression", "keywords": ["linear regression", "hypothesis function", "cost function", "gradient descent"] },
            { "term": "Neural Networks", "keywords": ["neural network", "neuron", "layers", "relu", "backpropagation", "activation"] },
            { "term": "Bias & Variance", "keywords": ["bias", "variance", "overfitting", "underfitting", "regularization"] },
            { "term": "Agentic Workflows", "keywords": ["agentic", "reflection", "multi-agent", "planning", "tool use"] }
        ]

        if "topicsDiscussed" not in current_memory:
            current_memory["topicsDiscussed"] = []

        for item in topics_map:
            # Check if any keyword matches user input or AI reply
            has_keyword = any(kw in user_lower or kw in assistant_lower for kw in item["keywords"])
            if has_keyword and item["term"] not in current_memory["topicsDiscussed"]:
                current_memory["topicsDiscussed"].append(item["term"])

        current_memory["lastInteracted"] = datetime.utcnow().isoformat() + "Z"
        
        save_memory(current_memory)
        print("Long-term memory updated locally in memory.json:", current_memory)
    except Exception as e:
        print(f"Failed to update memory in background: {e}")
