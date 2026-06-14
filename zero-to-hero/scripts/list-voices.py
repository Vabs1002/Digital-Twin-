import asyncio
from edge_tts import VoicesManager

async def main():
    voices = await VoicesManager.create()
    # Filter by English language and Male gender if possible
    english_voices = voices.find(Language="en", Gender="Male")
    for v in english_voices:
        print(f"Name: {v['Name']}, ShortName: {v['ShortName']}, Gender: {v['Gender']}")

if __name__ == "__main__":
    asyncio.run(main())
