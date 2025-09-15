#!/usr/bin/env python3
"""
Arduino to Web Asset Converter
Converts Arduino project assets (BMP, WAV) to web-friendly formats (JPG, MP3)
"""

import os
import json
import shutil
from pathlib import Path
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

# Mapping between Arduino files and token IDs
# You can customize this mapping based on your Arduino project
ARDUINO_MAPPING = {
    # Arduino filename (without extension) -> token_id
    "SCHOOL": "memory_001",
    "SERVER": "memory_002",
    "LAUNCH": "memory_003",
    "VICTORY": "memory_004",
    "SECRET": "memory_005",
    # Add more mappings as needed
}

print()
print("🖼️ Converting Images...")
print("-" * 40)

converted_images = 0
missing_images = []

# Process images
for arduino_name, token_id in ARDUINO_MAPPING.items():
    if token_id not in tokens:
        continue
    
    # Look for BMP file
    bmp_paths = [
        f"{ARDUINO_PROJECT}/images/{arduino_name}.BMP",
        f"{ARDUINO_PROJECT}/{arduino_name}.BMP",
        f"{ARDUINO_PROJECT}/SD_Card/{arduino_name}.BMP",
        f"{ARDUINO_PROJECT}/{arduino_name}.bmp",
    ]
    
    source_found = False
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
                print(f"  ✓ {arduino_name}.BMP → {token_id}.jpg ({size_kb:.1f}KB)")
                converted_images += 1
                
            except Exception as e:
                print(f"  ✗ Error converting {arduino_name}.BMP: {e}")
            
            break
    
    if not source_found:
        missing_images.append((arduino_name, token_id))

# Create placeholders for missing images
if missing_images:
    print()
    print("📸 Creating placeholders for missing images...")
    
    colors = {
        'Personal': (79, 189, 186),
        'Technical': (126, 200, 227),
        'Business': (231, 76, 60),
        'Military': (149, 165, 166),
        'Intelligence': (44, 62, 80)
    }
    
    for arduino_name, token_id in missing_images:
        if token_id not in tokens:
            continue
        
        output_path = f"assets/images/{token_id}.jpg"
        
        # Skip if already exists
        if os.path.exists(output_path):
            print(f"  ⚠ {token_id}.jpg already exists")
            continue
        
        # Create placeholder
        token_data = tokens[token_id]
        color = colors.get(token_data['type'], (136, 136, 136))
        
        img = Image.new('RGB', (800, 800), color=color)
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        
        # Add title text
        title = token_data['title']
        # Simple centered text
        draw.text((400, 380), title, fill='white', anchor='mm')
        draw.text((400, 420), f"({token_id})", fill='rgba(255,255,255,0.5)', anchor='mm')
        
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
    
    for arduino_name, token_id in ARDUINO_MAPPING.items():
        if token_id not in tokens:
            continue
        
        # Look for WAV file
        wav_paths = [
            f"{ARDUINO_PROJECT}/audio/{arduino_name}.WAV",
            f"{ARDUINO_PROJECT}/{arduino_name}.WAV",
            f"{ARDUINO_PROJECT}/SD_Card/{arduino_name}.WAV",
            f"{ARDUINO_PROJECT}/{arduino_name}.wav",
        ]
        
        for wav_path in wav_paths:
            if os.path.exists(wav_path):
                output_path = f"assets/audio/{token_id}.mp3"
                
                # Convert WAV to MP3 using ffmpeg
                cmd = f'ffmpeg -i "{wav_path}" -codec:a libmp3lame -b:a 128k "{output_path}" -y > /dev/null 2>&1'
                result = os.system(cmd)
                
                if result == 0:
                    size_kb = os.path.getsize(output_path) / 1024
                    print(f"  ✓ {arduino_name}.WAV → {token_id}.mp3 ({size_kb:.1f}KB)")
                    converted_audio += 1
                else:
                    print(f"  ✗ Error converting {arduino_name}.WAV")
                
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