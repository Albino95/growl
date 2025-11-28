# Hosting & Deployment Guide

## Options for Building and Hosting the App

### 1. **Expo Application Services (EAS) - Recommended**

**Best for**: Production mobile apps, easy deployment

**Steps**:
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Submit to app stores
eas submit --platform ios
eas submit --platform android
```

**Pros**:
- Free tier available
- Easy app store submission
- Over-the-air updates
- No need for Mac for iOS builds

**Cost**: Free tier + paid plans for more builds

---

### 2. **Expo Go (Development/Testing)**

**Best for**: Quick testing and sharing with others

**Steps**:
```bash
# Start development server
npm start

# Share QR code with others
# They scan with Expo Go app
```

**Pros**:
- Instant sharing
- No build required
- Great for demos

**Cons**:
- Limited to Expo Go app
- Not for production

---

### 3. **Web Deployment (Expo Web)**

**Best for**: Web version, easy sharing

**Steps**:
```bash
# Build web version
npm run web

# Deploy to hosting
# Option A: Vercel
npm install -g vercel
vercel

# Option B: Netlify
npm install -g netlify-cli
netlify deploy --prod

# Option C: GitHub Pages
# Add to package.json:
"homepage": "https://yourusername.github.io/growl-app",
"scripts": {
  "deploy": "gh-pages -d web-build"
}
```

**Hosting Options**:
- **Vercel**: Free, automatic deployments from GitHub
- **Netlify**: Free, easy setup
- **GitHub Pages**: Free, simple static hosting
- **Cloudflare Pages**: Free, fast CDN

---

### 4. **TestFlight (iOS) / Internal Testing (Android)**

**Best for**: Beta testing with specific users

**iOS TestFlight**:
```bash
eas build --platform ios --profile preview
eas submit --platform ios
# Share TestFlight link
```

**Android Internal Testing**:
```bash
eas build --platform android --profile preview
# Upload to Google Play Console
# Share internal testing link
```

---

### 5. **Appetize.io (Web-based Simulator)**

**Best for**: Demo in browser without app installation

**Steps**:
1. Build app with EAS
2. Upload to Appetize.io
3. Get embeddable link
4. Share link - users can test in browser

**Cost**: Free tier (limited minutes), paid plans available

---

## Recommended Approach

### For Quick Demo/Sharing:
1. Use **Expo Go** - Share QR code
2. Or deploy **web version** to Vercel/Netlify

### For Production:
1. Use **EAS Build** for app store builds
2. Deploy **web version** for browser access
3. Use **EAS Update** for over-the-air updates

---

## Quick Start: Web Deployment

```bash
cd frontend

# Install dependencies
npm install

# Build web version
npm run web

# Deploy to Vercel (easiest)
npm install -g vercel
vercel --prod
```

This will give you a public URL like: `https://growl-app.vercel.app`

---

## Environment Setup

Create `.env` file in `frontend/`:
```
EXPO_PUBLIC_API_URL=https://your-api-url.com
```

---

## Notes

- Web version works great for demos
- Mobile apps need EAS for production
- TestFlight/Internal Testing for beta users
- Expo Go for quick testing

