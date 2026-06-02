import fs from 'fs';
import path from 'path';

const MEMORY_FILE = path.join(process.cwd(), 'memory.json');

// Initialize empty memory template
const DEFAULT_MEMORY = {
  userName: "Learner",
  userAge: "Not specified",
  userBackground: "Beginner starting their AI journey",
  topicsDiscussed: [],
  userGoals: "To learn artificial intelligence and machine learning in an interactive way",
  lastInteracted: new Date().toISOString()
};

// Load memory from local JSON file
export function loadMemory() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      saveMemory(DEFAULT_MEMORY);
      return DEFAULT_MEMORY;
    }
    const data = fs.readFileSync(MEMORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load memory:', error);
    return DEFAULT_MEMORY;
  }
}

// Save memory to local JSON file
export function saveMemory(memoryData) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save memory:', error);
  }
}

// Reset memory
export function resetMemory() {
  saveMemory(DEFAULT_MEMORY);
  return DEFAULT_MEMORY;
}

// Local, high-performance information extraction rules
export async function updateLongTermMemory(userMessage, assistantMessage, apiKey) {
  try {
    const currentMemory = loadMemory();
    const userLower = userMessage.toLowerCase().trim();
    const assistantLower = assistantMessage.toLowerCase().trim();

    // 1. Extract Name (Case Insensitive + Auto-capitalization)
    // Matches "my name is vaibhav", "i am vaibhav", "call me vaibhav"
    const nameMatch = userMessage.match(/(?:my name is|i am|call me)\s+([a-zA-Z]+)/i);
    if (nameMatch && nameMatch[1]) {
      const nameCandidate = nameMatch[1].trim();
      const blacklistedNames = ["a", "the", "not", "learning", "trying", "very", "strictly", "here", "ready", "student", "beginner"];
      if (!blacklistedNames.includes(nameCandidate.toLowerCase())) {
        // Capitalize first letter (e.g. "vaibhav" -> "Vaibhav")
        currentMemory.userName = nameCandidate.charAt(0).toUpperCase() + nameCandidate.slice(1).toLowerCase();
      }
    }

    // 1.5. Extract Age (matches "i am 20 years old", "i'm 25", "my age is 30", "18 years old")
    const ageMatch = userMessage.match(/(?:i am|i'm|my age is)\s+(\d{1,2})(?:\s*years?\s*old|\s*years?\s*of\s*age)?/i) || userMessage.match(/(\d{1,2})\s*(?:years?\s*old|yo)/i);
    if (ageMatch && ageMatch[1]) {
      currentMemory.userAge = `${ageMatch[1]} years old`;
    }

    // 2. Extract Background / Skill level
    const backgroundMatch = userMessage.match(/(?:i am a|i'm a|i am|i'm)\s+(beginner|student|engineer|programmer|developer|expert|novice|researcher)/i);
    if (backgroundMatch && backgroundMatch[1]) {
      currentMemory.userBackground = `Identified as a ${backgroundMatch[1].toLowerCase()}`;
    }

    // 3. Extract Goals
    // Matches "i want to learn linear regression" or "teach me about neural networks"
    const goalMatch = userMessage.match(/(?:i want to learn|i'm trying to learn|my goal is to|i want to understand|teach me about)\s+([^.!?]+)/i);
    if (goalMatch && goalMatch[1]) {
      currentMemory.userGoals = `To understand and master ${goalMatch[1].trim()}`;
    }

    // 4. Extract Topics Discussed based on keywords in dialogue
    const topicsMap = [
      { term: "Supervised Learning", keywords: ["supervised learning", "classification", "regression"] },
      { term: "Linear Regression", keywords: ["linear regression", "hypothesis function", "cost function", "gradient descent"] },
      { term: "Neural Networks", keywords: ["neural network", "neuron", "layers", "relu", "backpropagation", "activation"] },
      { term: "Bias & Variance", keywords: ["bias", "variance", "overfitting", "underfitting", "regularization"] },
      { term: "Agentic Workflows", keywords: ["agentic", "reflection", "multi-agent", "planning", "tool use"] }
    ];

    topicsMap.forEach(item => {
      const matchesKeyword = item.keywords.some(kw => userLower.includes(kw) || assistantLower.includes(kw));
      if (matchesKeyword && !currentMemory.topicsDiscussed.includes(item.term)) {
        currentMemory.topicsDiscussed.push(item.term);
      }
    });

    currentMemory.lastInteracted = new Date().toISOString();
    
    saveMemory(currentMemory);
    console.log('Long-term memory updated locally:', currentMemory);
  } catch (error) {
    console.error('Failed to update long-term memory locally:', error);
  }
}
