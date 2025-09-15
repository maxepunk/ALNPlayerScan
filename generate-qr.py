#!/usr/bin/env python3
"""
QR Code Generator for ALN Memory Scanner
Generates QR codes for all tokens in tokens.json
"""

import qrcode
import json
import os
from PIL import Image, ImageDraw, ImageFont

def generate_simple_qr():
    """Generate simple black and white QR codes"""
    # Create output directory
    os.makedirs('qr-codes', exist_ok=True)
    
    # Load tokens
    try:
        with open('tokens.json', 'r') as f:
            tokens = json.load(f)
    except FileNotFoundError:
        print("❌ tokens.json not found!")
        print("Please create tokens.json first")
        return
    
    print("Generating QR codes...")
    generated = 0
    
    for token_id in tokens.keys():
        try:
            # Create QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            
            # Add token ID as data
            qr.add_data(token_id)
            qr.make(fit=True)
            
            # Create image - use simple black and white
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Save QR code
            output_path = f'qr-codes/{token_id}.png'
            img.save(output_path)
            print(f'  ✓ Generated {token_id}.png')
            generated += 1
            
        except Exception as e:
            print(f'  ✗ Error generating {token_id}: {e}')
    
    print(f"\n✅ Generated {generated} QR codes in qr-codes/ directory")
    return generated

def generate_labeled_qr():
    """Generate QR codes with labels for easier identification"""
    os.makedirs('qr-codes', exist_ok=True)
    
    try:
        with open('tokens.json', 'r') as f:
            tokens = json.load(f)
    except FileNotFoundError:
        print("❌ tokens.json not found!")
        return
    
    print("\nGenerating labeled QR codes...")
    generated = 0
    
    for token_id, token_data in tokens.items():
        try:
            # Create QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            
            qr.add_data(token_id)
            qr.make(fit=True)
            
            # Create QR image
            qr_img = qr.make_image(fill_color="black", back_color="white")
            
            # Create a larger image with label space
            width, height = qr_img.size
            labeled_img = Image.new('RGB', (width, height + 60), 'white')
            
            # Paste QR code
            labeled_img.paste(qr_img, (0, 0))
            
            # Add label
            draw = ImageDraw.Draw(labeled_img)
            
            # Try to use a font (fallback to default if not available)
            try:
                font = ImageFont.truetype("arial.ttf", 16)
            except:
                font = ImageFont.load_default()
            
            # Add token ID
            text = f"{token_id}"
            draw.text((10, height + 5), text, fill='black', font=font)
            
            # Add title (truncated if too long)
            title = token_data.get('title', 'Unknown')[:30]
            draw.text((10, height + 25), title, fill='gray', font=font)
            
            # Add rating stars
            rating = '⭐' * token_data.get('rating', 0)
            draw.text((10, height + 45), rating, fill='black', font=font)
            
            # Save labeled version
            output_path = f'qr-codes/{token_id}_labeled.png'
            labeled_img.save(output_path)
            print(f'  ✓ Generated {token_id}_labeled.png')
            generated += 1
            
        except Exception as e:
            print(f'  ✗ Error generating labeled {token_id}: {e}')
    
    print(f"✅ Generated {generated} labeled QR codes")
    return generated

def generate_color_qr():
    """Generate QR codes with colors based on token type"""
    os.makedirs('qr-codes', exist_ok=True)
    
    try:
        with open('tokens.json', 'r') as f:
            tokens = json.load(f)
    except FileNotFoundError:
        print("❌ tokens.json not found!")
        return
    
    # Color scheme using RGB tuples (not hex strings!)
    colors = {
        'Personal': (79, 189, 186),      # Teal
        'Technical': (126, 200, 227),    # Light blue
        'Business': (231, 76, 60),       # Red
        'Military': (149, 165, 166),     # Gray
        'Intelligence': (44, 62, 80),    # Dark blue
        'Test': (136, 136, 136)          # Gray
    }
    
    print("\nGenerating colored QR codes...")
    generated = 0
    
    for token_id, token_data in tokens.items():
        try:
            # Get color for this token type
            token_type = token_data.get('type', 'Test')
            color = colors.get(token_type, (0, 0, 0))  # Default to black
            
            # Create QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            
            qr.add_data(token_id)
            qr.make(fit=True)
            
            # Create image with color
            img = qr.make_image(fill_color=color, back_color="white")
            
            # Save colored version
            output_path = f'qr-codes/{token_id}_color.png'
            img.save(output_path)
            print(f'  ✓ Generated {token_id}_color.png ({token_type})')
            generated += 1
            
        except Exception as e:
            print(f'  ✗ Error generating colored {token_id}: {e}')
    
    print(f"✅ Generated {generated} colored QR codes")
    return generated

def main():
    """Main function"""
    print("=" * 60)
    print("🎯 ALN Memory Scanner - QR Code Generator")
    print("=" * 60)
    print()
    
    # Check if tokens.json exists
    if not os.path.exists('tokens.json'):
        print("❌ Error: tokens.json not found!")
        print("Please ensure tokens.json is in the current directory")
        return
    
    # Generate simple QR codes (these are required)
    count = generate_simple_qr()
    
    if count > 0:
        print()
        print("Optional: Generate enhanced versions?")
        print("1. Labeled QR codes (with title and rating)")
        print("2. Colored QR codes (by token type)")
        print("3. Both")
        print("4. Skip")
        
        try:
            choice = input("\nChoice (1-4, default=4): ").strip() or "4"
            
            if choice == "1":
                generate_labeled_qr()
            elif choice == "2":
                generate_color_qr()
            elif choice == "3":
                generate_labeled_qr()
                generate_color_qr()
        except KeyboardInterrupt:
            print("\nSkipping optional versions")
    
    print()
    print("=" * 60)
    print("📋 Next Steps:")
    print("1. Print QR codes from qr-codes/ folder")
    print("2. Regular: Use [token_id].png files")
    print("3. Labeled: Use [token_id]_labeled.png for easier sorting")
    print("4. Colored: Use [token_id]_color.png for visual distinction")
    print()
    print("🖨️ Printing Tips:")
    print("- Minimum size: 1 inch x 1 inch")
    print("- Use white paper for best scanning")
    print("- Consider laminating for durability")
    print("=" * 60)

if __name__ == "__main__":
    main()