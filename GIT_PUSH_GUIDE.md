# Git Push & Pull Request Guide - Personal GitHub

## Current Configuration

✅ **Local Git Config** (for this repo only):
- User: `Albino95`
- Email: `albino.ndreu@gmail.com`

✅ **Global Git Config** (unchanged for work):
- User: `c3-albinondreu-c`
- Email: `albino.ndreu-c@c3.ai`

✅ **Remote Repository**:
- URL: `https://github.com/Albino95/growl.git` (HTTPS)
- Type: HTTPS (uses Personal Access Token or GitHub Desktop)

---

## Standard Workflow: Push & Pull Requests

### Method 1: Using GitHub Desktop (Easiest)

#### **Step 1: Make Changes**
1. Make your code changes in your editor
2. GitHub Desktop will automatically detect changes

#### **Step 2: Commit Changes**
1. Open GitHub Desktop
2. You'll see all changed files in the left panel
3. **Stage files**: Check the boxes next to files you want to commit
   - Or click "Select all" to stage everything
4. **Write commit message** at the bottom:
   ```
   Add profile enhancements and sustainability features
   ```
5. Click **"Commit to main"** (or your branch name)

#### **Step 3: Push to GitHub**
1. After committing, click **"Push origin"** button at the top
2. Changes are now on GitHub!

#### **Step 4: Create Pull Request (if working on a branch)**
1. If you're on a branch (not `main`), GitHub Desktop will show:
   - "Create Pull Request" button
2. Click it → Opens GitHub in browser
3. Fill out PR details:
   - **Title**: Brief description
   - **Description**: What changed and why
4. Click **"Create Pull Request"**

---

### Method 2: Using Terminal

#### **Step 1: Check Status**
```bash
cd /Users/albinondreu/Desktop/growl_rn_ts_twrnc_sdk54_v5
git status
```

#### **Step 2: Stage Changes**
```bash
# Stage all changes
git add .

# Or stage specific files
git add frontend/src/screens/Profile/ProfileScreen.tsx
```

#### **Step 3: Commit**
```bash
git commit -m "Add profile enhancements and sustainability features"
```

#### **Step 4: Push**
```bash
# Push to main branch
git push origin main

# Or push to a feature branch
git push origin feature-branch-name
```

#### **Step 5: Create Pull Request**
1. Go to your GitHub repository: `https://github.com/Albino95/growl`
2. You'll see a banner: **"Compare & pull request"**
3. Click it
4. Fill out PR details and click **"Create Pull Request"**

---

## Creating a Feature Branch (Best Practice)

### Using GitHub Desktop:
1. Click **"Current branch"** dropdown at the top
2. Click **"New branch"**
3. Name it: `feature/profile-enhancements` or `fix/bug-name`
4. Make your changes
5. Commit and push
6. Create PR from the branch

### Using Terminal:
```bash
# Create and switch to new branch
git checkout -b feature/profile-enhancements

# Make changes, then:
git add .
git commit -m "Add profile enhancements"
git push origin feature/profile-enhancements

# Then create PR on GitHub
```

---

## Pull Request Template

When creating a PR, use this structure:

**Title:**
```
[Feature] Add profile enhancements and sustainability features
```

**Description:**
```markdown
## Description
Brief description of what this PR does.

## Changes
- Added profile tabs (Posts, Stories, Shared)
- Implemented decay timer settings
- Added Sustainability category with CO2 calculator
- Enhanced category management

## Testing
- [ ] Tested on iOS
- [ ] Tested on Android
- [ ] Tested on Web

## Screenshots (if applicable)
Add screenshots here

## Related Issues
Closes #123
```

---

## Standard Git Commands Reference

### Daily Workflow
```bash
# Check what changed
git status

# See changes in files
git diff

# Stage all changes
git add .

# Commit with message
git commit -m "Your commit message"

# Push to GitHub
git push origin main
```

### Branch Management
```bash
# Create new branch
git checkout -b feature/your-feature-name

# Switch branches
git checkout main
git checkout feature/your-feature-name

# List all branches
git branch

# Delete local branch
git branch -d feature/your-feature-name

# Delete remote branch
git push origin --delete feature/your-feature-name
```

### Viewing History
```bash
# See commit history
git log --oneline

# See changes in a commit
git show <commit-hash>
```

### Updating from Remote
```bash
# Fetch latest changes
git fetch origin

# Pull latest changes
git pull origin main

# Or in GitHub Desktop: Click "Fetch origin" then "Pull origin"
```

---

## Authentication Setup

### Using GitHub Desktop (Recommended)
1. Open GitHub Desktop
2. Go to **GitHub Desktop** → **Preferences** → **Accounts**
3. Make sure you're logged in with `albino.ndreu@gmail.com`
4. That's it! No tokens needed.

### Using Terminal with HTTPS
1. Get Personal Access Token:
   - Go to https://github.com/settings/tokens
   - Generate new token (classic)
   - Select `repo` scope
   - Copy token
2. When pushing, use token as password
3. Optional: Save credentials:
   ```bash
   git config --local credential.helper osxkeychain
   ```

---

## Troubleshooting

### "Permission denied" error
- **GitHub Desktop**: Make sure you're logged in with correct account
- **Terminal**: Use Personal Access Token, not password

### "Branch is behind" error
```bash
# Pull latest changes first
git pull origin main

# Then push again
git push origin main
```

### Wrong commit author
```bash
# Fix last commit
git commit --amend --author="Albino95 <albino.ndreu@gmail.com>"
git push --force origin main  # Only if you haven't pushed yet!
```

### Undo last commit (not pushed)
```bash
git reset --soft HEAD~1  # Keeps changes
git reset --hard HEAD~1  # Discards changes (careful!)
```

---

## Best Practices

✅ **Do:**
- Create feature branches for new work
- Write clear commit messages
- Push frequently
- Create PRs for review before merging to main
- Keep commits focused (one feature per commit)

❌ **Don't:**
- Commit directly to `main` for big features
- Use vague commit messages like "fix" or "update"
- Force push to shared branches
- Commit sensitive data (passwords, API keys)

---

## Quick Reference

| Action | GitHub Desktop | Terminal |
|--------|---------------|----------|
| Stage files | Check boxes | `git add .` |
| Commit | Write message + "Commit" | `git commit -m "msg"` |
| Push | "Push origin" button | `git push origin main` |
| Create branch | "New branch" | `git checkout -b branch-name` |
| Create PR | "Create Pull Request" | Via GitHub website |
| Pull changes | "Pull origin" | `git pull origin main` |

---

## Verify Configuration

```bash
# Check local config (should show personal)
git config --local user.name
git config --local user.email

# Check global config (should show work - DON'T CHANGE)
git config --global user.name
git config --global user.email

# Check remote
git remote -v
```

**Important**: Never change global config - it's for your work account!

