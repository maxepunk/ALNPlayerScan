#!/usr/bin/env python3
"""
Simple bidirectional sync for ALN Memory Scanner
Syncs token changes from/to shared repository and regenerates QR codes
"""

import subprocess
import json
import os
import sys
import qrcode
from pathlib import Path
from datetime import datetime

def run_command(cmd, description, capture=False):
    """Run a shell command and return output if requested"""
    print(f"📌 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode != 0 and "nothing to commit" not in result.stdout:
            print(f"  ⚠️  {result.stderr.strip() or result.stdout.strip()}")
            return result.stdout if capture else False
        return result.stdout if capture else True
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return "" if capture else False

def sync_submodule():
    """Bidirectional sync with the shared token repository"""
    if not os.path.exists('data/.git'):
        print("⚠️  No git submodule found, initializing...")
        run_command("git submodule init", "Initializing submodule")
        run_command("git submodule update", "Getting initial data")
        return
    
    # Save current directory
    original_dir = os.getcwd()
    
    try:
        os.chdir('data')
        
        # Check if we have local changes
        status = run_command("git status --porcelain", "Checking for local changes", capture=True)
        has_local_changes = bool(status.strip())
        
        if has_local_changes:
            print("  📝 Found local changes to tokens")
            # Commit local changes
            run_command("git add tokens.json", "Staging token changes")
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
            run_command(f'git commit -m "Update tokens - {timestamp}"', "Committing changes")
            
            # Push to shared repo
            push_result = run_command("git push origin HEAD:main", "Pushing to shared repository")
            if push_result:
                print("  ✅ Pushed local changes to shared repo")
            else:
                print("  ⚠️  Could not push (may need to pull first)")
        
        # Pull latest changes
        run_command("git pull origin main --rebase", "Pulling latest from shared repo")
        
    finally:
        os.chdir(original_dir)
    
    # Update the parent repo's reference to the submodule
    run_command("git add data", "Updating submodule reference")
    run_command('git commit -m "Update submodule reference"', "Committing submodule update")

def load_tokens():
    """Load tokens from submodule or fallback location"""
    paths = ['data/tokens.json', 'tokens.json']
    
    for path in paths:
        if os.path.exists(path):
            print(f"📄 Loading tokens from {path}")
            with open(path, 'r') as f:
                return json.load(f), path
    
    print("❌ No tokens.json found!")
    return None, None

def generate_qr_codes(tokens):
    """Generate QR codes for all tokens"""
    qr_dir = Path('qr-codes')
    qr_dir.mkdir(exist_ok=True)
    
    # Check existing QR codes
    existing = set(f.stem for f in qr_dir.glob('*.png'))
    needed = set(tokens.keys())
    
    new_tokens = needed - existing
    removed_tokens = existing - needed
    updated = 0
    
    # Clean up removed tokens
    for token_id in removed_tokens:
        qr_file = qr_dir / f"{token_id}.png"
        qr_file.unlink()
        print(f"  🗑️  Removed {token_id}.png")
    
    # Generate QR codes
    for token_id in tokens.keys():
        qr_file = qr_dir / f"{token_id}.png"
        
        # Create QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(token_id)
        qr.make(fit=True)
        
        # Save (overwrites existing)
        img = qr.make_image(fill_color="black", back_color="white")
        img.save(qr_file)
        
        if token_id in new_tokens:
            print(f"  ✨ Created {token_id}.png")
            updated += 1
        # Silent update for existing tokens
    
    if updated == 0 and len(removed_tokens) == 0:
        print("  ✅ QR codes are up to date")
    else:
        print(f"  ✅ Updated {updated} QR codes, removed {len(removed_tokens)}")

def deploy_to_github_pages():
    """Commit and push all changes to deploy via GitHub Pages"""
    print("🚀 Deploying to GitHub Pages...")
    
    # Check for changes
    status = run_command("git status --porcelain", "Checking for changes to deploy", capture=True)
    if not status.strip():
        print("  ✅ No changes to deploy")
        return True
    
    # Stage all changes
    run_command("git add -A", "Staging all changes")
    
    # Commit
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    commit_msg = f"🔄 Sync tokens and QR codes - {timestamp}"
    run_command(f'git commit -m "{commit_msg}"', "Committing changes")
    
    # Push to GitHub
    if run_command("git push origin main", "Pushing to GitHub Pages"):
        print("  ✅ Deployed successfully!")
        print("  🌐 Changes will be live in ~1-2 minutes")
        
        # Try to detect GitHub Pages URL
        remote_url = run_command("git remote get-url origin", "Getting repo URL", capture=True)
        if "github.com" in remote_url:
            # Extract username and repo from URL
            import re
            match = re.search(r'github\.com[:/]([^/]+)/([^/.]+)', remote_url)
            if match:
                user, repo = match.groups()
                print(f"  📱 Live at: https://{user}.github.io/{repo}/")
        return True
    else:
        print("  ⚠️  Could not push to GitHub")
        print("  Run 'git push' manually when ready")
        return False

def main():
    """Main sync process"""
    print("=" * 50)
    print("🔄 ALN Memory Scanner - Sync & Deploy")
    print("=" * 50)
    print()
    
    # Parse arguments
    deploy = '--deploy' in sys.argv
    local_only = '--local' in sys.argv
    
    if local_only:
        print("📍 LOCAL MODE - Will not push to GitHub")
        print()
    
    # Step 1: Sync with shared repository
    print("🔄 Syncing with shared token repository...")
    sync_submodule()
    print()
    
    # Step 2: Load tokens
    tokens, source = load_tokens()
    if not tokens:
        print("❌ Cannot proceed without tokens")
        return 1
    
    print(f"📊 Found {len(tokens)} tokens")
    
    # Step 3: Generate/update QR codes
    print("🎯 Updating QR codes...")
    generate_qr_codes(tokens)
    print()
    
    # Step 4: Deploy to GitHub Pages (if requested)
    if deploy and not local_only:
        deploy_to_github_pages()
        print()
    elif not local_only:
        print("💡 Tip: Use 'python3 sync.py --deploy' to push to GitHub Pages")
        print()
    
    print("=" * 50)
    print("✨ Sync complete!")
    print("=" * 50)
    
    return 0

if __name__ == "__main__":
    # Show usage if --help
    if '--help' in sys.argv:
        print("""
ALN Memory Scanner - Sync Tool

Usage:
  python3 sync.py           # Sync tokens and regenerate QR codes
  python3 sync.py --deploy  # Sync and deploy to GitHub Pages
  python3 sync.py --local   # Sync locally only (no GitHub push)
  
After running with --deploy, your changes will be live at your GitHub Pages URL.
        """)
        sys.exit(0)
    
    sys.exit(main())