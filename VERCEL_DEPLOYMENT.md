# Deploying Growl App to Vercel

This guide covers deploying the Growl React Native app to Vercel for web hosting.

## 📋 Prerequisites

- **Vercel account** (sign up at [vercel.com](https://vercel.com))
- **Vercel CLI** installed globally: `npm i -g vercel`
- **Git repository** pushed to GitHub/GitLab/Bitbucket
- **Backend deployed** to Cloudflare Workers (already done)

## 🚀 Deployment Steps

### Step 1: Prepare the Project

Ensure your project is ready for deployment:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Build for web (test locally first)
npm run web
```

### Step 2: Configure for Vercel

Create a `vercel.json` file in the `frontend` directory:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "web-build"
      }
    }
  ],
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

**Note:** Environment variables should be set in Vercel Dashboard, not in vercel.json.

### Step 3: Install Web Dependencies

Install required web dependencies:

```bash
cd frontend
npx expo install react-dom react-native-web
```

Or add them manually to `package.json`:

```json
{
  "dependencies": {
    "react-dom": "19.1.0",
    "react-native-web": "^0.21.0"
  }
}
```

### Step 4: Update package.json Scripts

Add build script to `frontend/package.json`:

```json
{
  "scripts": {
    "build": "expo export:web",
    "vercel-build": "expo export:web"
  }
}
```

**Note:** 
- Metro bundler is the default and recommended for Expo SDK 54 (set in app.json: `"bundler": "metro"`)
- Use `expo export --platform web --output-dir web-build` with Metro bundler
- The `--output-dir web-build` ensures output matches Vercel's expected directory
- Metro is the standard bundler for Expo and handles all modern JavaScript features

### Step 4: Push to Git Repository

```bash
# Make sure all changes are committed
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### Step 6: Deploy via Vercel Dashboard

1. **Go to [vercel.com](https://vercel.com)**
2. **Click "New Project"**
3. **Import your Git repository**
4. **Configure the project**:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Other
   - **Build Command**: `npm run build` or `expo export:web`
   - **Output Directory**: `web-build`
5. **Add Environment Variables**:
   - `EXPO_PUBLIC_API_BASE_URL`: `https://growl-backend.albino-ndreu.workers.dev/api/v1`
   - `NODE_ENV`: `production`
6. **Click "Deploy"**

### Step 7: Deploy via Vercel CLI (Alternative)

```bash
# Navigate to frontend directory
cd frontend

# Login to Vercel (first time only)
vercel login

# Deploy
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? (select your account)
# - Link to existing project? No
# - Project name? growl-app (or your choice)
# - Directory? ./
# - Override settings? No

# For production deployment
vercel --prod
```

## 🔧 Configuration Files

### vercel.json (in frontend directory)

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "web-build"
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

### Environment Variables in Vercel

Set these in Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `EXPO_PUBLIC_API_BASE_URL` | `https://growl-backend.albino-ndreu.workers.dev/api/v1` |
| `NODE_ENV` | `production` |

## 📝 Update app.config.ts for Production

Ensure `frontend/app.config.ts` uses environment variables:

```typescript
import type { ExpoConfig } from '@expo/config';

const defineConfig = (): ExpoConfig => ({
  name: 'Growl',
  slug: 'growl',
  version: '0.4.0',
  extra: {
    API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://growl-backend.albino-ndreu.workers.dev/api/v1',
    ENV: process.env.NODE_ENV || 'development',
  },
});

export default defineConfig;
```

## 🔄 Continuous Deployment

Vercel automatically deploys on every push to your main branch:

1. **Push to GitHub**:
   ```bash
   git push origin main
   ```

2. **Vercel automatically**:
   - Detects the push
   - Runs the build
   - Deploys to production

3. **Preview deployments** are created for pull requests automatically

## 🌐 Custom Domain

### Add Custom Domain in Vercel

1. Go to **Project Settings** → **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `growl.app`)
4. Follow DNS configuration instructions
5. Vercel will automatically configure SSL

### DNS Configuration

Add these DNS records to your domain provider:

- **Type**: CNAME
- **Name**: `@` or `www`
- **Value**: `cname.vercel-dns.com`

## 🐛 Troubleshooting

### Build Fails

**Problem**: Build command fails
```bash
# Test build locally first
cd frontend
npm run build

# Check for errors and fix them
```

**Problem**: Missing dependencies
```bash
# Ensure all dependencies are in package.json
npm install --save <missing-package>
```

### Deployment Issues

**Problem**: 404 errors on routes
- Ensure `vercel.json` has proper routing configuration
- Check that `web-build` directory exists after build

**Problem**: API calls fail
- Verify `EXPO_PUBLIC_API_BASE_URL` is set correctly
- Check CORS settings in backend
- Verify backend is accessible

### Performance Issues

**Problem**: Slow loading
- Enable Vercel's Edge Network
- Optimize images (use `expo-image`)
- Enable compression in Vercel settings

## 📊 Monitoring

### Vercel Analytics

1. Go to **Project Settings** → **Analytics**
2. Enable **Web Analytics**
3. View metrics in dashboard

### Logs

View deployment logs:
```bash
vercel logs
```

Or in Vercel Dashboard → **Deployments** → Click on deployment → **View Logs**

## 🔄 Updating Deployment

### Manual Update

```bash
cd frontend
vercel --prod
```

### Automatic Update

Just push to your main branch:
```bash
git push origin main
```

## 📱 Mobile App Deployment

For mobile app deployment (iOS/Android), use:

### iOS (App Store)
```bash
cd frontend
eas build --platform ios
eas submit --platform ios
```

### Android (Google Play)
```bash
cd frontend
eas build --platform android
eas submit --platform android
```

See [Expo EAS documentation](https://docs.expo.dev/build/introduction/) for details.

## ✅ Post-Deployment Checklist

- [ ] Verify site is accessible
- [ ] Test authentication flow
- [ ] Test API connections
- [ ] Check mobile responsiveness
- [ ] Verify images load correctly
- [ ] Test all major features
- [ ] Set up custom domain (if needed)
- [ ] Enable analytics
- [ ] Set up error monitoring (optional)

## 🔗 Useful Links

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Vercel Documentation**: https://vercel.com/docs
- **Expo Web Documentation**: https://docs.expo.dev/workflow/web/
- **Backend API**: https://growl-backend.albino-ndreu.workers.dev/api/v1

## 📞 Support

If you encounter issues:
1. Check Vercel deployment logs
2. Review build errors in dashboard
3. Test locally first: `npm run web`
4. Check backend health: `curl https://growl-backend.albino-ndreu.workers.dev/api/v1/health`
