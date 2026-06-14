import asyncio
import edge_tts
import os

async def generate_sample(text, voice, filename):
    output_dir = "public/audio"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, filename)
    print(f"Generating sample for {voice} -> {output_path}")
    
    # Andrew Ng speaks slow and calm, so slow down rate by -10%
    communicate = edge_tts.Communicate(text, voice, rate="-10%")
    await communicate.save(output_path)

async def main():
    sample_text = (
        "Hello Vaibhav, this is Andrew Ng. It is wonderful to study machine learning with you today. "
        "Don't worry if you don't get the math yet, we will go through it together step by step."
    )
    
    voices = [
        {"name": "en-US-AndrewNeural", "file": "sample-us-andrew.mp3"},
        {"name": "en-HK-SamNeural", "file": "sample-hk-sam.mp3"},
        {"name": "en-SG-WayneNeural", "file": "sample-sg-wayne.mp3"},
        {"name": "en-GB-ThomasNeural", "file": "sample-gb-thomas.mp3"}
    ]
    
    for v in voices:
        await generate_sample(sample_text, v["name"], v["file"])
    print("All samples generated successfully!")

if __name__ == "__main__":
    asyncio.run(main())
