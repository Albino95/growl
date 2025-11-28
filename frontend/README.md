# Growl Frontend

React Native mobile application built with Expo, TypeScript, and Tailwind CSS.

## Structure

```
frontend/
├── src/
│   ├── app/          # Navigation setup
│   ├── components/   # Reusable UI components
│   ├── screens/      # Screen components
│   ├── services/     # API and storage services
│   ├── state/        # State management (Zustand)
│   ├── store/        # Redux store
│   ├── data/         # Static data
│   └── lib/          # Utilities
├── App.tsx           # Root component
└── package.json      # Dependencies
```

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Run on specific platform:
```bash
npm run ios
npm run android
npm run web
```

## Features

- Authentication (Email/Password, SSO)
- Feed with personalized content
- Reels (vertical video feed)
- Messages/Stories
- Journal entries
- Marketplace
- Instructor dashboard
- Business dashboard
- Profile management

## Tech Stack

- React Native
- Expo SDK 54
- TypeScript
- Tailwind CSS (via twrnc)
- React Navigation
- Zustand (State management)
- Redux Toolkit
