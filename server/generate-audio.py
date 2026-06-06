import sys
import asyncio
import edge_tts

async def generate_speech(text, output_file, voice):
    # Andrew Ng has a slower, deliberate pacing, so we slow the rate down by -10%
    communicate = edge_tts.Communicate(text, voice, rate="-10%")
    await communicate.save(output_file)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate-audio.py <text> <output_file> [voice]")
        sys.exit(1)
        
    text = sys.argv[1]
    output_file = sys.argv[2]
    # Default to en-US-AndrewNeural if no voice parameter is provided
    voice = sys.argv[3] if len(sys.argv) > 3 else "en-US-AndrewNeural"
    
    asyncio.run(generate_speech(text, output_file, voice))
