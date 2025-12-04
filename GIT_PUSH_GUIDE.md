# Git Workflow & Pull Request Guide

## Branching Strategy

### Environment Flow
```
Feature Branch → Develop → QA → Production (main)
```

- **Feature Branches**: Individual developer work
- **Develop**: Development environment (hosted on Dev server)
- **QA**: Quality Assurance environment (hosted on QA server)
- **Production (main)**: Production environment (hosted on Prod server)

### Branch Naming Convention

**Format**: `initials/type/branch-name`

**Examples**:
- `an/feature/profile-enhancements`
- `an/bug/fix-login-error`
- `an/refactor/auth-store`
- `js/feature/add-co2-calculator`
- `mk/bug/fix-navigation-issue`

**Types**:
- `feature/` - New features
- `bug/` or `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Adding tests
- `chore/` - Maintenance tasks

---

## Standard Workflow: Feature Branch → PR → Merge

### ⚠️ Important Rules

1. **NEVER push directly to `main` (production)**
2. **NEVER push directly to `develop`**
3. **Always create a feature branch**
4. **Always create a Pull Request**
5. **Get at least one approval before merging**
6. **Merge to `develop` first, then promote to QA, then to `main`**

---

## Step-by-Step Workflow

### Step 1: Create Feature Branch

#### Using GitHub Desktop:
1. Make sure you're on `develop` branch
2. Click **"Current branch"** dropdown
3. Click **"New branch"**
4. Name it: `your-initials/type/branch-name` (e.g., `an/feature/profile-enhancements`)
5. Click **"Create branch"**

#### Using Terminal:
```bash
# Make sure you're on develop and up to date
git checkout develop
git pull origin develop

# Create and switch to new branch
git checkout -b an/feature/profile-enhancements
```

---

### Step 2: Make Your Changes

1. Make code changes in your editor
2. Test your changes locally
3. Commit frequently with clear messages

#### Commit Messages Format:
```
type: brief description

Optional longer description explaining what and why
```

**Examples**:
```
feat: add profile tabs and decay timer settings

- Added Posts, Stories, and Shared tabs
- Implemented decay timer modal
- Added category management feature
```

```
fix: resolve navigation error in CategoryPickScreen

Fixed the 'REPLACE' action error by using CommonActions.reset()
```

---

### Step 3: Commit Changes

#### Using GitHub Desktop:
1. Stage files you want to commit
2. Write commit message
3. Click **"Commit to [branch-name]"**

#### Using Terminal:
```bash
# Stage changes
git add .

# Commit with message
git commit -m "feat: add profile tabs and decay timer settings"
```

---

### Step 4: Push Branch to GitHub

#### Using GitHub Desktop:
1. Click **"Push origin"** button
2. Your branch is now on GitHub

#### Using Terminal:
```bash
# Push branch (first time)
git push -u origin an/feature/profile-enhancements

# Subsequent pushes
git push
```

---

### Step 5: Create Pull Request

#### Using GitHub Desktop:
1. After pushing, you'll see: **"Create Pull Request"** button
2. Click it → Opens GitHub in browser
3. Fill out PR details (see PR Template below)
4. Make sure base branch is `develop` (not `main`)
5. Click **"Create Pull Request"**

#### Using GitHub Website:
1. Go to your repository on GitHub
2. You'll see a banner: **"Compare & pull request"**
3. Click it
4. **Important**: Change base branch from `main` to `develop`
5. Fill out PR details
6. Click **"Create Pull Request"**

---

### Step 6: Get Code Review & Approval

1. **Request Reviewers**: Add team members as reviewers
2. **Wait for Approval**: At least one approval required
3. **Address Feedback**: Make changes if requested
4. **Update PR**: Push new commits to your branch (PR updates automatically)

#### After Getting Approval:
- ✅ PR is approved
- ✅ All checks pass (if CI/CD is set up)
- ✅ Ready to merge

---

### Step 7: Merge to Develop

#### Using GitHub Website:
1. Click **"Merge pull request"** button
2. Select merge type:
   - **Create a merge commit** (recommended) - preserves branch history
   - **Squash and merge** - combines all commits into one
   - **Rebase and merge** - linear history
3. Click **"Confirm merge"**
4. Delete branch (optional but recommended)

**Result**: Your changes are now in `develop` branch → **Deployed to Dev environment**

---

### Step 8: Promote to QA

Once changes are tested in Dev:

1. Create PR from `develop` → `qa` branch
2. Get approval
3. Merge to `qa`
4. **Deployed to QA environment** for testing

---

### Step 9: Promote to Production

After QA testing passes:

1. Create PR from `qa` → `main` branch
2. Get approval (may require additional reviewers)
3. Merge to `main`
4. **Deployed to Production environment**

---

## Pull Request Template

Use this template when creating PRs:

```markdown
## Description
Brief description of what this PR does and why.

## Type of Change
- [ ] Feature (new functionality)
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] Refactor (code restructuring)
- [ ] Documentation update
- [ ] Other (please describe)

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
- [ ] Tested locally on iOS
- [ ] Tested locally on Android
- [ ] Tested locally on Web
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated

## Screenshots/Videos (if applicable)
Add screenshots or screen recordings here

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated (if needed)
- [ ] No new warnings generated
- [ ] Tests pass locally
- [ ] Branch is up to date with `develop`

## Related Issues
Closes #123
Related to #456

## Deployment Notes
Any special deployment considerations or environment variable changes
```

---

## Quick Reference: Branch Workflow

```
┌─────────────────┐
│  Feature Branch │  (your-initials/type/branch-name)
│   (Your Work)   │
└────────┬────────┘
         │
         │ PR + Approval
         ▼
┌─────────────────┐
│    Develop      │  → Deployed to Dev
└────────┬────────┘
         │
         │ PR + Approval
         ▼
┌─────────────────┐
│      QA         │  → Deployed to QA
└────────┬────────┘
         │
         │ PR + Approval
         ▼
┌─────────────────┐
│   Main (Prod)   │  → Deployed to Production
└─────────────────┘
```

---

## Common Git Commands

### Daily Workflow
```bash
# Check status
git status

# See changes
git diff

# Stage all changes
git add .

# Stage specific files
git add path/to/file.tsx

# Commit
git commit -m "type: description"

# Push branch
git push -u origin branch-name
```

### Branch Management
```bash
# Update develop
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b initials/type/branch-name

# Switch branches
git checkout branch-name

# List branches
git branch

# Delete local branch
git branch -d branch-name

# Delete remote branch
git push origin --delete branch-name
```

### Updating Your Branch
```bash
# If develop has new changes while you're working
git checkout your-branch
git pull origin develop  # or merge develop into your branch
git push
```

### Viewing History
```bash
# Commit history
git log --oneline

# See changes in commit
git show <commit-hash>

# See what changed between branches
git diff develop..your-branch
```

---

## Troubleshooting

### "Your branch is behind"
```bash
# Update your branch with latest develop
git checkout your-branch
git pull origin develop
# Resolve conflicts if any
git push
```

### "Merge conflicts"
```bash
# Pull latest develop
git pull origin develop

# Resolve conflicts in your editor
# Then:
git add .
git commit -m "fix: resolve merge conflicts"
git push
```

### Wrong base branch in PR
1. Edit PR on GitHub
2. Change base branch to `develop`
3. Save

### Need to update PR after review
```bash
# Make changes
git add .
git commit -m "fix: address review comments"
git push
# PR updates automatically
```

### Undo last commit (not pushed)
```bash
# Keep changes
git reset --soft HEAD~1

# Discard changes (careful!)
git reset --hard HEAD~1
```

---

## Best Practices

### ✅ Do:
- Create feature branches for all work
- Use descriptive branch names following convention
- Write clear commit messages
- Keep branches focused (one feature per branch)
- Update your branch regularly with `develop`
- Request reviews early (draft PRs are fine)
- Test locally before pushing
- Keep PRs small and focused
- Delete merged branches

### ❌ Don't:
- Push directly to `main` or `develop`
- Use vague branch names like `fix` or `update`
- Commit directly to shared branches
- Force push to shared branches
- Merge your own PRs without approval
- Leave branches unmerged for too long
- Commit sensitive data (passwords, API keys, tokens)
- Skip code review

---

## Environment-Specific Notes

### Development Environment
- Auto-deploys from `develop` branch
- Use for active development and testing
- Can be unstable

### QA Environment
- Deploys from `qa` branch
- Used for quality assurance testing
- Should be stable, production-like

### Production Environment
- Deploys from `main` branch
- Live, customer-facing
- Must be stable and tested
- Requires additional approvals

---

## Quick Reference Table

| Action | GitHub Desktop | Terminal |
|--------|---------------|----------|
| Create branch | "New branch" | `git checkout -b initials/type/name` |
| Stage files | Check boxes | `git add .` |
| Commit | Write message + "Commit" | `git commit -m "msg"` |
| Push | "Push origin" | `git push -u origin branch-name` |
| Create PR | "Create Pull Request" | Via GitHub website |
| Update branch | "Pull origin" | `git pull origin develop` |
| Switch branch | "Current branch" dropdown | `git checkout branch-name` |

---

## Authentication Setup

### Using GitHub Desktop (Recommended)
1. Open GitHub Desktop
2. Go to **GitHub Desktop** → **Preferences** → **Accounts**
3. Make sure you're logged in with your GitHub account
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

## Verify Your Setup

```bash
# Check your git config
git config user.name
git config user.email

# Check current branch
git branch

# Check remote
git remote -v

# Check status
git status
```

---

## Summary: The Golden Rules

1. 🔀 **Always work on feature branches** - Never on `main` or `develop`
2. 📝 **Follow branch naming**: `initials/type/branch-name`
3. 🔍 **Create PRs for all changes** - No direct merges
4. ✅ **Get approval before merging** - At least one reviewer
5. 🚀 **Merge to `develop` first** - Then promote through environments
6. 🧪 **Test in Dev → QA → Prod** - Follow the environment flow
7. 📋 **Use PR template** - Provide clear context
8. 🗑️ **Delete merged branches** - Keep repo clean
