#!/bin/bash

# ALN Memory Scanner - GitHub Pages Setup Script
# This script sets up everything for GitHub Pages deployment

set -e  # Exit on error

echo "================================================"
echo "🧠 ALN Memory Scanner - GitHub Pages Setup"
echo "================================================"
echo ""

# Check requirements
echo "📋 Checking requirements..."

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required. Please install Python 3."
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo "❌ Git is required. Please install Git."
    exit 1
fi

echo "✅ Requirements met"
echo ""

# Get GitHub username
read -p "Enter your GitHub username: " GITHUB_USERNAME
read -p "Enter repository name (default: aln-memory-scanner): " REPO_NAME
REPO_NAME=${REPO_NAME:-aln-memory-scanner}

echo ""
echo "📁 Creating project structure..."

# Create all directories
mkdir -p assets/images
mkdir -p assets/audio  
mkdir -p qr-codes
mkdir -p scripts

echo "✅ Directories created"
echo ""

# Create tokens.json if it doesn't exist
if [ ! -f "tokens.json" ]; then
    echo "📝 Creating tokens.json..."
    cat > tokens.json << 'EOF'
{
  "memory_001": {
    "id": "memory_001",
    "title": "First Day of School",
    "type": "Personal",
    "rating": 4,
    "group": "Childhood Memories (x3)",
    "description": "Walking through those big doors for the first time",
    "image": "assets/images/memory_001.jpg",
    "audio": "assets/audio/memory_001.mp3"
  },
  "memory_002": {
    "id": "memory_002",
    "title": "Server Room Crisis",
    "type": "Technical",
    "rating": 5,
    "group": "Work Experience (x5)",
    "description": "The night everything went down",
    "image": "assets/images/memory_002.jpg",
    "audio": "assets/audio/memory_002.mp3"
  },
  "memory_003": {
    "id": "memory_003",
    "title": "Project Launch",
    "type": "Business",
    "rating": 3,
    "group": "Milestones (x2)",
    "description": "When months of work finally paid off",
    "image": "assets/images/memory_003.jpg",
    "audio": null
  },
  "memory_004": {
    "id": "memory_004",
    "title": "Team Victory",
    "type": "Personal",
    "rating": 5,
    "group": "Achievements (x4)",
    "description": "Against all odds, we did it",
    "image": "assets/images/memory_004.jpg",
    "audio": "assets/audio/victory.mp3"
  },
  "memory_005": {
    "id": "memory_005",
    "title": "Secret Project",
    "type": "Intelligence",
    "rating": 4,
    "group": "Classified (x10)",
    "description": "[REDACTED]",
    "image": "assets/images/memory_005.jpg",
    "audio": null
  }
}
EOF
    echo "✅ tokens.json created"
fi

# Create manifest.json
echo "📝 Creating manifest.json..."
cat > manifest.json << EOF
{
  "name": "ALN Memory Scanner",
  "short_name": "ALN Scanner",
  "description": "Collect memory tokens by scanning QR codes",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#4fbdba",
  "orientation": "portrait",
  "icons": [
    {
      "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect fill='%234fbdba' width='512' height='512' rx='100'/%3E%3Ctext x='50%25' y='50%25' font-size='320' fill='white' text-anchor='middle' dominant-baseline='middle'%3E🧠%3C/text%3E%3C/svg%3E",
      "sizes": "512x512",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
EOF
echo "✅ manifest.json created"

# Create placeholder image
echo "🖼️ Creating placeholder image..."
cat > scripts/create_placeholder.py << 'EOF'
from PIL import Image, ImageDraw
import os

os.makedirs('assets/images', exist_ok=True)

# Create placeholder
img = Image.new('RGB', (800, 800), color='#888888')
draw = ImageDraw.Draw(img)

# Add text
text = "Image\nNot Found"
draw.multiline_text((400, 400), text, fill='white', anchor='mm')

# Save
img.save('assets/images/placeholder.jpg', 'JPEG', quality=85)
print("✓ Created placeholder.jpg")
EOF

python3 -c "
try:
    from PIL import Image, ImageDraw
    import os
    os.makedirs('assets/images', exist_ok=True)
    img = Image.new('RGB', (800, 800), color='#888888')
    draw = ImageDraw.Draw(img)
    draw.text((400, 400), '?', fill='white', anchor='mm')
    img.save('assets/images/placeholder.jpg', 'JPEG', quality=85)
    print('✓ Created placeholder image')
except ImportError:
    print('⚠ Pillow not installed, skipping placeholder image')
"

# Install Python dependencies
echo ""
echo "📦 Installing Python dependencies..."
pip3 install --user qrcode[pil] pillow 2>/dev/null || pip3 install qrcode[pil] pillow

# Generate QR codes
echo ""
echo "🎯 Generating QR codes..."
python3 << 'EOF'
import qrcode
import json
import os

os.makedirs('qr-codes', exist_ok=True)

with open('tokens.json', 'r') as f:
    tokens = json.load(f)

for token_id in tokens.keys():
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(token_id)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(f'qr-codes/{token_id}.png')
    print(f'  ✓ Generated {token_id}.png')

print(f"\n✅ Generated {len(tokens)} QR codes")
EOF

# Create placeholder images for all tokens
echo ""
echo "🖼️ Creating placeholder images for tokens..."
python3 << 'EOF'
from PIL import Image, ImageDraw, ImageFont
import json
import os

os.makedirs('assets/images', exist_ok=True)

colors = {
    'Personal': (79, 189, 186),
    'Technical': (126, 200, 227),
    'Business': (231, 76, 60),
    'Military': (149, 165, 166),
    'Intelligence': (44, 62, 80)
}

with open('tokens.json', 'r') as f:
    tokens = json.load(f)

for token_id, token_data in tokens.items():
    output_path = f'assets/images/{token_id}.jpg'
    
    if os.path.exists(output_path):
        print(f'  ⚠ {token_id}.jpg exists, skipping')
        continue
    
    # Create colored background
    color = colors.get(token_data['type'], (136, 136, 136))
    img = Image.new('RGB', (800, 800), color=color)
    draw = ImageDraw.Draw(img)
    
    # Add title
    title = token_data['title']
    
    # Simple text rendering
    try:
        # Try to get text size
        bbox = draw.textbbox((0, 0), title)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = (800 - text_width) // 2
        y = (800 - text_height) // 2
    except:
        x, y = 400, 400
    
    draw.text((x, y), title, fill='white', anchor='mm')
    
    # Save
    img.save(output_path, 'JPEG', quality=85)
    print(f'  ✓ Created {token_id}.jpg')

print("\n✅ Placeholder images created")
EOF

# Create README.md
echo ""
echo "📄 Creating README.md..."
cat > README.md << EOF
# ALN Memory Scanner

A Progressive Web App for collecting memory tokens via QR code scanning.

## 🌐 Live Demo

[https://${GITHUB_USERNAME}.github.io/${REPO_NAME}/](https://${GITHUB_USERNAME}.github.io/${REPO_NAME}/)

## 🎮 How to Play

1. Visit the URL above on your phone
2. Tap "Add to Home Screen" for app experience
3. Print QR codes from \`qr-codes/\` folder
4. Scan QR codes to collect memories
5. Build your collection!

## 📁 Project Structure

\`\`\`
${REPO_NAME}/
├── index.html          # Main application
├── manifest.json       # PWA configuration
├── sw.js              # Service worker
├── tokens.json        # Token database
├── assets/
│   ├── images/        # Memory images
│   └── audio/         # Audio files
└── qr-codes/          # Printable QR codes
\`\`\`

## 🛠️ Setup

1. Clone this repository
2. Run \`python3 scripts/generate_qr.py\` to generate QR codes
3. Deploy to GitHub Pages

## 📝 Adding New Tokens

1. Edit \`tokens.json\`
2. Add images to \`assets/images/\`
3. Regenerate QR codes
4. Push to GitHub

## 🚀 Technologies

- Progressive Web App (PWA)
- QR Code Scanning
- Web NFC (Android)
- Service Worker for offline
- GitHub Pages hosting

## 📄 License

MIT
EOF
echo "✅ README.md created"

# Initialize git repository
if [ ! -d ".git" ]; then
    echo ""
    echo "🔧 Initializing Git repository..."
    git init
    git branch -M main
    echo "✅ Git initialized"
fi

# Create .gitignore
echo ""
echo "📝 Creating .gitignore..."
cat > .gitignore << 'EOF'
# OS files
.DS_Store
Thumbs.db

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/

# IDE
.vscode/
.idea/
*.swp
*.swo

# Temporary files
*.tmp
*.bak
~*

# Raw assets (if you have them)
raw_images/
raw_audio/
EOF
echo "✅ .gitignore created"

# Final summary
echo ""
echo "================================================"
echo "✅ Setup Complete!"
echo "================================================"
echo ""
echo "📁 Project structure created"
echo "📝 Configuration files created"
echo "🎯 ${ls qr-codes/*.png 2>/dev/null | wc -l} QR codes generated"
echo "🖼️ Placeholder images created"
echo ""
echo "🚀 Next Steps:"
echo ""
echo "1. Copy index.html from the provided file"
echo "2. Copy sw.js from the provided file"
echo ""
echo "3. Add to GitHub:"
echo "   git add ."
echo "   git commit -m \"Initial deployment\""
echo "   git remote add origin https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"
echo "   git push -u origin main"
echo ""
echo "4. Enable GitHub Pages:"
echo "   - Go to: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}/settings/pages"
echo "   - Source: Deploy from branch"
echo "   - Branch: main / (root)"
echo "   - Save"
echo ""
echo "5. Your app will be live at:"
echo "   https://${GITHUB_USERNAME}.github.io/${REPO_NAME}/"
echo ""
echo "📱 Ready for testing!"
echo "================================================"