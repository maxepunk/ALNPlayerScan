#!/usr/bin/env python3
"""
Create placeholder images for all tokens
Works with new SF_ schema fields
"""

from PIL import Image, ImageDraw, ImageFont
import json
import os

# Create output directory
os.makedirs('assets/images', exist_ok=True)

# Color scheme by SF_MemoryType (RGB tuples)
colors = {
    'Personal': (79, 189, 186),      # Teal
    'Technical': (126, 200, 227),    # Light blue
    'Business': (231, 76, 60),       # Red
    'Military': (149, 165, 166),     # Gray
    'Intelligence': (44, 62, 80),    # Dark blue
    'Test': (136, 136, 136),         # Gray
    'Classified': (20, 20, 40)       # Very dark blue
}

# Load tokens - try submodule path first, then root
tokens = None
try:
    with open('data/tokens.json', 'r') as f:
        tokens = json.load(f)
    print(f"Loaded {len(tokens)} tokens from data/tokens.json")
except FileNotFoundError:
    try:
        with open('tokens.json', 'r') as f:
            tokens = json.load(f)
        print(f"Loaded {len(tokens)} tokens from tokens.json")
    except FileNotFoundError:
        print("ERROR: tokens.json not found!")
        print("Please make sure tokens.json exists in data/ or current directory")
        exit(1)

print("\nCreating placeholder images...")
print("-" * 40)

created_count = 0
skipped_count = 0

for token_id, token_data in tokens.items():
    output_path = f'assets/images/{token_id}.jpg'
    
    # Skip if file already exists
    if os.path.exists(output_path):
        print(f'  ⚠ {token_id}.jpg already exists, skipping')
        skipped_count += 1
        continue
    
    try:
        # Get color for this token's SF_MemoryType
        memory_type = token_data.get('SF_MemoryType', 'Unknown')
        color = colors.get(memory_type, (136, 136, 136))  # Default gray
        
        # Create image with RGB color tuple
        img = Image.new('RGB', (800, 800), color=color)
        draw = ImageDraw.Draw(img)
        
        # For player scanner, we don't show title - just use token ID
        title = token_id
        
        # Try to use a system font, fallback to default
        try:
            # Try different font options
            font_large = ImageFont.truetype("arial.ttf", 60)
            font_small = ImageFont.truetype("arial.ttf", 30)
        except:
            try:
                # Try other common font paths
                font_large = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 60)
                font_small = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 30)
            except:
                # Use default font
                font_large = ImageFont.load_default()
                font_small = ImageFont.load_default()
        
        # Split title into words for wrapping
        words = title.split()
        lines = []
        current_line = []
        
        for word in words:
            current_line.append(word)
            test_line = ' '.join(current_line)
            # Check if line is too long (approximate)
            if len(test_line) > 20:  # Simple character count check
                if len(current_line) > 1:
                    current_line.pop()
                    lines.append(' '.join(current_line))
                    current_line = [word]
                else:
                    lines.append(test_line)
                    current_line = []
        
        if current_line:
            lines.append(' '.join(current_line))
        
        # Draw title lines
        y_offset = 350
        for line in lines:
            try:
                # Try to get text size for centering
                bbox = draw.textbbox((0, 0), line, font=font_large)
                text_width = bbox[2] - bbox[0]
                x = (800 - text_width) // 2
            except:
                # Fallback to simple centering
                x = 400
                
            draw.text((x, y_offset), line, fill=(255, 255, 255), font=font_large, anchor=None)
            y_offset += 70
        
        # Add token ID at bottom
        try:
            bbox = draw.textbbox((0, 0), token_id, font=font_small)
            text_width = bbox[2] - bbox[0]
            x = (800 - text_width) // 2
        except:
            x = 400
            
        draw.text((x, 700), f"ID: {token_id}", fill=(255, 255, 255, 180), font=font_small)
        
        # Add memory type badge (for debugging, but subtle)
        type_text = f"[{memory_type}]"
        try:
            bbox = draw.textbbox((0, 0), type_text, font=font_small)
            text_width = bbox[2] - bbox[0]
            x = (800 - text_width) // 2
        except:
            x = 400
            
        draw.text((x, 100), type_text, fill=(255, 255, 255, 200), font=font_small)
        
        # Save image
        img.save(output_path, 'JPEG', quality=85)
        print(f'  ✓ Created {token_id}.jpg ({memory_type})')
        created_count += 1
        
    except Exception as e:
        print(f'  ✗ Error generating {token_id}: {e}')

# Create a generic placeholder image
placeholder_path = 'assets/images/placeholder.jpg'
if not os.path.exists(placeholder_path):
    try:
        # Create a gray placeholder
        img = Image.new('RGB', (800, 800), color=(100, 100, 100))
        draw = ImageDraw.Draw(img)
        
        # Add question mark or text
        try:
            font = ImageFont.truetype("arial.ttf", 120)
        except:
            font = ImageFont.load_default()
        
        draw.text((400, 400), "?", fill=(255, 255, 255))
        draw.text((400, 500), "Image Not Found", fill=(255, 255, 255, 180))
        
        img.save(placeholder_path, 'JPEG', quality=85)
        print(f'  ✓ Created placeholder.jpg')
        
    except Exception as e:
        print(f'  ✗ Error creating placeholder: {e}')

print("\n" + "=" * 40)
print(f"✅ Created: {created_count} images")
if skipped_count > 0:
    print(f"⚠️  Skipped: {skipped_count} (already exist)")
print("=" * 40)

print("\n📁 Images created in: assets/images/")
print("🎯 Next step: Generate QR codes with scripts/generate_qr.py")