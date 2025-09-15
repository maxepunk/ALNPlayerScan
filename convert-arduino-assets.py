#!/usr/bin/env python3
"""
Arduino to Web Asset Converter
Converts Arduino project assets (BMP, WAV) to web-friendly formats (JPG, MP3)
Works with any token ID in tokens.json
"""

import os
import json
from PIL import Image

print("=" * 60)
print("🔄 Arduino to Web Asset Converter")
print("=" * 60)
print()

# Configuration
ARDUINO_PROJECT = input("Path to Arduino project folder (or press Enter to skip): ").strip()
if not ARDUINO_PROJECT:
    ARDUINO_PROJECT = "./arduino-project"

WEB_PROJECT = "./"  # Current directory
TOKENS_FILE = "tokens.json"

# Create output directories
os.makedirs("assets/images", exist_ok=True)
os.makedirs("assets/audio", exist_ok=True)

# Load tokens database
try:
    with open(TOKENS_FILE, 'r') as f:
        tokens = json.load(f)
    print(f"✅ Loaded {len(tokens)} tokens from {TOKENS_FILE}")
except FileNotFoundError:
    print(f"❌ {TOKENS_FILE} not found!")
    print("Please create tokens.json first")
    exit(1)

print()
print("🖼️ Converting Images...")
print("-" * 40)

converted_images = 0
missing_images = []

# Process images for ALL tokens
for token_id in tokens.keys():
    # Try multiple possible filenames for this token
    # Including uppercase ID, lowercase, and with underscores/colons
    possible_names = [
        token_id,
        token_id.upper(),
        token_id.lower(),
        token_id.replace('_', ''),
        token_id.replace(':', ''),
        token_id.replace(':', '_'),
    ]
    
    source_found = False
    for name in possible_names:
        # Look for BMP file in various locations
        # First check in current project's assets folder
        bmp_paths = [
            f"assets/images/{name}.BMP",
            f"assets/images/{name}.bmp",
            f"{ARDUINO_PROJECT}/images/{name}.BMP",
            f"{ARDUINO_PROJECT}/images/{name}.bmp",
            f"{ARDUINO_PROJECT}/{name}.BMP",
            f"{ARDUINO_PROJECT}/{name}.bmp",
            f"{ARDUINO_PROJECT}/SD_Card/{name}.BMP",
            f"{ARDUINO_PROJECT}/SD_Card/{name}.bmp",
        ]
        
        for bmp_path in bmp_paths:
            if os.path.exists(bmp_path):
                source_found = True
                output_path = f"assets/images/{token_id}.jpg"
                
                try:
                    # Open BMP
                    img = Image.open(bmp_path)
                    
                    # Convert to RGB if needed
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    
                    # Resize to web-friendly size (max 800x800)
                    img.thumbnail((800, 800), Image.Resampling.LANCZOS)
                    
                    # Save as JPG
                    img.save(output_path, 'JPEG', quality=85, optimize=True)
                    
                    # Get file size
                    size_kb = os.path.getsize(output_path) / 1024
                    print(f"  ✓ {name}.BMP → {token_id}.jpg ({size_kb:.1f}KB)")
                    converted_images += 1
                    
                except Exception as e:
                    print(f"  ✗ Error converting {name}.BMP: {e}")
                
                break
        
        if source_found:
            break
    
    if not source_found:
        missing_images.append(token_id)

# Create placeholders for missing images
if missing_images:
    print()
    print("📸 Creating placeholders for missing images...")
    
    # Map memory types to colors
    colors = {
        'Personal': (79, 189, 186),
        'Technical': (126, 200, 227),
        'Business': (231, 76, 60),
        'Military': (149, 165, 166),
        'Intelligence': (44, 62, 80),
        'Test': (100, 100, 100)
    }
    
    for token_id in missing_images:
        if token_id not in tokens:
            continue
        
        output_path = f"assets/images/{token_id}.jpg"
        
        # Skip if already exists
        if os.path.exists(output_path):
            print(f"  ⚠ {token_id}.jpg already exists")
            continue
        
        # Create placeholder based on SF_MemoryType
        token_data = tokens[token_id]
        memory_type = token_data.get('SF_MemoryType', 'Unknown')
        color = colors.get(memory_type, (136, 136, 136))
        
        img = Image.new('RGB', (800, 800), color=color)
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        
        # Add token ID text (no title since it's not in player-visible fields)
        # Simple centered text with token ID
        draw.text((400, 400), token_id, fill='white', anchor='mm')
        
        img.save(output_path, 'JPEG', quality=85)
        print(f"  ✓ Created placeholder for {token_id}")

print()
print("🎵 Converting Audio...")
print("-" * 40)

# Check if ffmpeg is available for audio conversion
ffmpeg_available = os.system("which ffmpeg > /dev/null 2>&1") == 0

if not ffmpeg_available:
    print("  ⚠ ffmpeg not found - skipping audio conversion")
    print("  Install ffmpeg to convert WAV files to MP3:")
    print("  Ubuntu/Debian: sudo apt install ffmpeg")
    print("  macOS: brew install ffmpeg")
else:
    converted_audio = 0
    
    # Process audio for ALL tokens
    for token_id in tokens.keys():
        # Try multiple possible filenames for this token
        possible_names = [
            token_id,
            token_id.upper(),
            token_id.lower(),
            token_id.replace('_', ''),
            token_id.replace(':', ''),
            token_id.replace(':', '_'),
        ]
        
        source_found = False
        for name in possible_names:
            # Look for WAV file in various locations
            # First check in current project's assets folder
            wav_paths = [
                f"assets/audio/{name}.WAV",
                f"assets/audio/{name}.wav",
                f"{ARDUINO_PROJECT}/audio/{name}.WAV",
                f"{ARDUINO_PROJECT}/audio/{name}.wav",
                f"{ARDUINO_PROJECT}/{name}.WAV",
                f"{ARDUINO_PROJECT}/{name}.wav",
                f"{ARDUINO_PROJECT}/SD_Card/{name}.WAV",
                f"{ARDUINO_PROJECT}/SD_Card/{name}.wav",
            ]
            
            for wav_path in wav_paths:
                if os.path.exists(wav_path):
                    output_path = f"assets/audio/{token_id}.mp3"
                    
                    # Convert WAV to MP3 using ffmpeg
                    cmd = f'ffmpeg -i "{wav_path}" -codec:a libmp3lame -b:a 128k "{output_path}" -y > /dev/null 2>&1'
                    result = os.system(cmd)
                    
                    if result == 0:
                        size_kb = os.path.getsize(output_path) / 1024
                        print(f"  ✓ {name}.WAV → {token_id}.mp3 ({size_kb:.1f}KB)")
                        converted_audio += 1
                    else:
                        print(f"  ✗ Error converting {name}.WAV")
                    
                    source_found = True
                    break
            
            if source_found:
                break

print()
print("=" * 60)
print("📊 Conversion Summary")
print("=" * 60)
print(f"✅ Images converted: {converted_images}")
print(f"📸 Placeholders created: {len(missing_images)}")
if ffmpeg_available:
    print(f"🎵 Audio files converted: {converted_audio}")
print()

# Update tokens.json with actual file paths
print("📝 Updating tokens.json...")
for token_id, token_data in tokens.items():
    # Check if image exists
    image_path = f"assets/images/{token_id}.jpg"
    if os.path.exists(image_path):
        token_data['image'] = image_path
    else:
        print(f"  ⚠ Missing image for {token_id}")
    
    # Check if audio exists
    audio_path = f"assets/audio/{token_id}.mp3"
    if os.path.exists(audio_path):
        token_data['audio'] = audio_path
    else:
        # Set to null if no audio
        token_data['audio'] = None

# Save updated tokens.json
with open(TOKENS_FILE, 'w') as f:
    json.dump(tokens, f, indent=2)
print("✅ tokens.json updated")

print()
print("🎯 Next Steps:")
print("1. Review converted images in assets/images/")
print("2. Review converted audio in assets/audio/")
print("3. Generate QR codes: python3 generate_qr.py")
print("4. Push to GitHub: git add . && git commit -m 'Added assets' && git push")
print()
print("✨ Conversion complete!")