# Install Dependencies

## The Problem

Vitest is not installed. You need to install dependencies first.

## The Fix

### Step 1: Fix npm permissions (if needed)

If you get permission errors, run:

```bash
sudo chown -R $(whoami) "/Users/albinondreu/.npm"
```

### Step 2: Install dependencies

```bash
cd backend
npm install
```

This will install:
- `vitest` - Testing framework
- `@vitest/ui` - Test UI

### Step 3: Run tests

```bash
npm test
```

## Alternative: Use npx

If you don't want to install globally, you can use npx:

```bash
npx vitest run
```

## Quick Fix Command

```bash
cd backend && npm install && npm test
```
