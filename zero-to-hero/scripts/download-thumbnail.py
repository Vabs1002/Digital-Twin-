import urllib.request
import ssl

def download_image():
    url = "https://s3-alpha.figma.com/thumbnails/81b5b84e-6d09-4206-9b11-c47b2b075e32?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQ4GOSFWCSEJVQQGV%2F20260531%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260531T120000Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=e3e6086b6f2a292dc9cf2bd9c01f8487ffb680ccb934d9f42aef7040921529aa"
    output_path = "c:\\Users\\vabsd\\Desktop\\AIMSUMMER1\\figma-thumbnail.png"
    
    print("Downloading Figma thumbnail...")
    try:
        # Ignore SSL certification checks if needed
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ctx) as response, open(output_path, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        print("Success! Image saved to:", output_path)
    except Exception as e:
        print("Error downloading thumbnail:", e)

if __name__ == "__main__":
    download_image()
