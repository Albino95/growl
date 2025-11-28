# Git Push Guide - Personal GitHub

## Current Configuration

✅ **Local Git Config** (for this repo only):
- User: `Albino95`
- Email: `albino.ndreu@gmail.com`

✅ **Global Git Config** (unchanged for work):
- User: `c3-albinondreu-c`
- Email: `albino.ndreu-c@c3.ai`

✅ **Remote Repository**:
- URL: `https://github.com/Albino95/growl.git` (HTTPS)
- Type: HTTPS (uses Personal Access Token)

## How to Push to Personal GitHub

### Using HTTPS with Personal Access Token (Current Setup)

**Step 1: Get a Personal Access Token**

1. Go to GitHub.com → Click your profile → **Settings**
2. Scroll down to **Developer settings** (left sidebar)
3. Click **Personal access tokens** → **Tokens (classic)**
4. Click **Generate new token** → **Generate new token (classic)**
5. Give it a name: `Growl App Development`
6. Select scopes:
   - ✅ `repo` (Full control of private repositories)
7. Click **Generate token**
8. **COPY THE TOKEN** (you won't see it again!)

**Step 2: Push to GitHub**

```bash
cd /Users/albinondreu/Desktop/growl_rn_ts_twrnc_sdk54_v5

# Check status
git status

# Add files
git add .

# Commit
git commit -m "Your commit message"

# Push (will prompt for credentials)
git push origin main
```

**When prompted:**
- **Username**: `Albino95` (or your GitHub username)
- **Password**: Paste your Personal Access Token (NOT your GitHub password)

### Option 2: Using GitHub Desktop

1. Open GitHub Desktop
2. The app should detect your local repository
3. Make sure it shows your personal account (albino.ndreu@gmail.com)
4. Commit changes
5. Push to origin

### Option 3: Store Credentials (Optional)

To avoid entering token every time:

```bash
# Store credentials in macOS Keychain
git config --local credential.helper osxkeychain

# Then push normally - it will ask once and save
git push origin main
```

## Verify Configuration

```bash
# Check local config (should show personal)
git config --local user.name
git config --local user.email

# Check global config (should show work - DON'T CHANGE)
git config --global user.name
git config --global user.email

# Check remote (should be HTTPS now)
git remote -v
```

## Important Notes

⚠️ **Never run these commands** (they would change global config):
```bash
# DON'T RUN THESE:
git config --global user.name "Albino95"
git config --global user.email "albino.ndreu@gmail.com"
```

✅ **Safe commands** (only affect this repo):
```bash
# These are safe - only change local config
git config --local user.name "Albino95"
git config --local user.email "albino.ndreu@gmail.com"
```

## Troubleshooting

### If push fails with "Authentication failed":
1. Make sure you're using the Personal Access Token (not password)
2. Check the token has `repo` permissions
3. Try generating a new token

### If commits show wrong email:
```bash
# Fix last commit
git commit --amend --author="Albino95 <albino.ndreu@gmail.com>"
```

### If you accidentally changed global config:
```bash
# Restore work config
git config --global user.name "c3-albinondreu-c"
git config --global user.email "albino.ndreu-c@c3.ai"
```

### If you want to switch back to SSH (after setting up SSH key):
```bash
git remote set-url origin git@github.com:Albino95/growl.git
```

## Setting Up SSH (Optional - for future)

If you want to use SSH instead:

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "albino.ndreu@gmail.com"

# Start SSH agent
eval "$(ssh-agent -s)"

# Add key to agent
ssh-add ~/.ssh/id_ed25519

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Add to GitHub: Settings → SSH and GPG keys → New SSH key
# Then switch remote back:
git remote set-url origin git@github.com:Albino95/growl.git
```
