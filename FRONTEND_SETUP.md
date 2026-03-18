# Noir Factory Frontend Setup Guide

## Overview

A complete, production-ready mobile-first React PWA for content creation automation. Built with Vite, TypeScript, Tailwind CSS, and Framer Motion for smooth swipe gestures.

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation & Development

```bash
cd frontend
npm install
npm run dev
```

The frontend will start at `http://localhost:5173` with automatic API proxying to the backend at `http://localhost:8080`.

### Build for Production

```bash
npm run build
```

Output is generated in `../public/` directory, served by the Express backend.

## Architecture

### File Structure
```
frontend/
├── index.html                 # HTML entry point with PWA manifest
├── package.json              # Dependencies and scripts
├── vite.config.ts            # Vite build configuration
├── tsconfig.json             # TypeScript configuration
├── tailwind.config.js        # Dark theme configuration
├── postcss.config.js         # PostCSS plugins
├── .env.local                # Environment variables (Supabase key)
├── .env.example              # Template for .env.local
├── public/
│   ├── manifest.json         # PWA manifest
│   └── sw.js                 # Service worker for offline support
└── src/
    ├── main.tsx              # React entry point
    ├── App.tsx               # Router and main layout
    ├── index.css             # Tailwind imports and dark theme
    ├── types/
    │   └── index.ts          # TypeScript interfaces
    ├── lib/
    │   ├── supabase.ts       # Supabase client
    │   └── api.ts            # API wrapper with auth headers
    ├── store/
    │   ├── authStore.ts      # Auth state (Zustand)
    │   ├── companyStore.ts   # Company selection (Zustand)
    │   └── contentStore.ts   # Content & jobs (Zustand)
    ├── components/
    │   ├── Layout.tsx        # Main layout with header & nav
    │   ├── ProtectedRoute.tsx # Auth guard
    │   ├── CompanySwitcher.tsx # Company dropdown
    │   ├── BottomNav.tsx     # Mobile bottom navigation
    │   └── SwipeCard.tsx     # Swipe gesture card (Framer Motion)
    └── pages/
        ├── LoginPage.tsx     # Google OAuth login
        ├── FeedPage.tsx      # Swipe cards feed
        ├── QueuePage.tsx     # Content job queue
        ├── BotPage.tsx       # Engagement automation
        └── SettingsPage.tsx  # Feed & prompt settings
```

## Key Features

### 1. Authentication
- **Google SSO** via Supabase Auth UI
- Protected routes redirect unauthenticated users to login
- Session persisted in localStorage
- Auto-refresh on token expiry
- One-click logout with company selection reset

### 2. Company Management
- Dropdown switcher in header
- Company stored in localStorage
- All API calls include `X-Company-ID` header
- Persists across sessions

### 3. Swipe Card Interface (Main Feature)
Located in `FeedPage.tsx` and `SwipeCard.tsx`:
- **Swipe LEFT** = Reject (red X overlay)
- **Swipe RIGHT** = Approve (green check overlay)
- Drag threshold: 100px minimum swipe
- Elastic revert animation if threshold not met
- Bottom buttons for quick approve/reject
- Counter showing current/total items
- Filter by feed source dropdown

### 4. Content Job Queue
Real-time job status display:
- **Queued** (blue) - Waiting to process
- **Processing** (yellow) - In progress
- **Ready** (green) - Ready for publishing
- **Failed** (red) - Processing error with details
- **Published** (purple) - Successfully published

Expandable cards show full details including:
- Job ID, type, target platforms
- First comment text
- Creation timestamp
- Error messages with retry button

### 5. Engagement Bot
Settings for automation:
- Toggle on/off
- Today's stats (likes, comments, follows)
- Hashtag manager with add/remove
- Comment template library
- Real-time activity feed
- Platform-specific actions

### 6. Settings Page
Comprehensive configuration:
- **RSS Feed Management**: Add/remove feeds with type selection
- **Company Prompts**: Edit generation, hook, hashtag, caption, and first_comment templates
- **Account**: User info and logout
- **About**: Version info

## API Integration

### Authentication
All API calls automatically include:
- `Authorization: Bearer {supabase_access_token}`
- `X-Company-ID: {company_id}`

### Key Endpoints
```
GET    /api/content-items             # Fetch content items
POST   /api/content-items/{id}/reject # Reject content
GET    /api/content-jobs              # List content jobs
POST   /api/content-jobs              # Create new job
PATCH  /api/content-jobs/{id}         # Update job
POST   /api/content-jobs/{id}/retry   # Retry failed job
GET    /api/feeds                     # List RSS feeds
POST   /api/feeds                     # Add feed
DELETE /api/feeds/{id}                # Delete feed
GET    /api/companies                 # List accessible companies
GET    /api/companies/{id}/prompts    # Get company templates
PUT    /api/companies/{id}/prompts    # Update templates
GET    /api/engagement/status         # Bot status
PUT    /api/engagement/status         # Toggle bot
GET    /api/engagement/hashtags       # Get hashtags
PUT    /api/engagement/hashtags       # Update hashtags
GET    /api/engagement/templates      # Get templates
POST   /api/engagement/templates      # Add template
DELETE /api/engagement/templates/{id} # Delete template
GET    /api/engagement/activities     # Activity feed
```

## Styling & Theming

### Dark Theme Configuration
- Background: `#0a0a0a` (gray-950)
- Cards: `#111111` (gray-900)
- Accent: `#3b82f6` (blue-500)
- Success: `#10b981` (green-500)
- Error: `#ef4444` (red-500)

### Mobile Responsive Design
- **Primary target**: 320px - 480px width
- **Max card width**: 480px
- **Touch targets**: Minimum 44px x 44px
- **Safe area support**: Notch and home indicator safe zones
- **Bottom nav**: Fixed bottom with safe area inset

### Typography
- System fonts: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto
- Font smoothing enabled for native app feel
- Responsive text sizes (base -> lg -> xl)

## State Management (Zustand)

### Auth Store
```typescript
useAuthStore.getState()
  .user              // Current user object
  .loading           // Loading state
  .initialized       // Auth init complete
  .initialize()      // Initialize auth
  .logout()          // Sign out
```

### Company Store
```typescript
useCompanyStore.getState()
  .companies         // All accessible companies
  .currentCompany    // Selected company
  .fetchCompanies()  // Load companies
  .setCurrentCompany(company)  // Select company
  .initializeCompany()         // Load from localStorage
```

### Content Store
```typescript
useContentStore.getState()
  // Content Items
  .contentItems           // Current items
  .currentItemIndex       // Position in feed
  .fetchContentItems()    // Load items
  .nextContentItem()      // Move to next
  .rejectCurrentItem()    // Reject and remove

  // Jobs
  .jobs                   // All jobs
  .fetchContentJobs()     // Load jobs
  .createContentJob()     // Create new job

  // Feeds
  .feeds                  // RSS feeds list
  .fetchFeeds()           // Load feeds
  .addFeed()              // Add feed
  .removeFeed()           // Delete feed

  // Filter
  .selectedFeedId         // Current filter
  .setSelectedFeedId()    // Change filter
```

## Environment Configuration

Create `.env.local` in the frontend directory:

```
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

The Supabase URL is hardcoded to: `https://ghzvppbkuudkpzlcidlx.supabase.co`

## PWA Features

### Manifest
- App name: "Noir Factory"
- Short name: "Noir"
- Display: "standalone" (full-screen app)
- Icons: SVG logos (can upgrade to actual PNG files)
- Theme color: `#0a0a0a`

### Service Worker
- Caches shell HTML/CSS/JS for offline
- Network-first for API calls
- Returns offline error for /api endpoints when offline
- Auto-updates on page reload

## Development Workflow

### Hot Module Reloading
Vite enables instant HMR for:
- React component changes
- CSS/Tailwind modifications
- Store updates
- Type definitions

### TypeScript Strict Mode
- Strict null checks
- No implicit any
- Function return types required
- Property initialization required

### Linting & Type Checking
```bash
npm run build  # Type check + build
```

## Performance Optimizations

### Code Splitting
- React Router lazy loads pages automatically
- Framer Motion loaded only on swipe card
- Supabase Auth UI loaded on login page only

### Bundle Size
- Tailwind CSS: ~15.4 kB gzipped
- React + Router + Zustand: ~160 kB gzipped (total ~524 kB uncompressed)
- Consider dynamic imports for large features

### Image Optimization
- RSS feed images loaded with error handling
- Avatar images lazy-loaded with fallback
- SVG icons for native feel

## Deployment

The built frontend is served from `../public/` by the Express server.

### Build for Deployment
```bash
cd frontend
npm run build
```

This generates:
- `../public/index.html` - SPA entry point
- `../public/manifest.json` - PWA manifest
- `../public/sw.js` - Service worker
- `../public/assets/*.js` - Minified JavaScript
- `../public/assets/*.css` - Minified CSS

The Express server must:
1. Serve `../public/` as static files
2. Fallback all non-/api routes to `index.html` for SPA routing

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- iOS Safari 14+
- Chrome Android 90+

## Known Limitations

- Chunk size warning for large JavaScript bundle
- Can optimize further with route-based code splitting
- Service worker caching limited to shell (no asset versioning)
- Supabase client library included in bundle (consider alternative)

## Troubleshooting

### Build Fails with "node_modules/@esbuild/... not permitted"
- Clear node_modules: `rm -rf node_modules`
- Reinstall: `npm install`

### Vite dev server shows 404 on /api routes
- Ensure backend is running on localhost:8080
- Check vite.config.ts proxy configuration

### Service worker not registering
- Check browser DevTools > Application > Service Workers
- Clear site data if stuck in old version
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

### Supabase auth not working
- Verify VITE_SUPABASE_ANON_KEY in .env.local
- Check Google OAuth credentials in Supabase
- Enable localhost in Supabase allowed redirect URLs

## Next Steps

1. Deploy to staging/production environment
2. Configure actual App Store icons (192x192, 512x512 PNG)
3. Add error boundary for graceful error handling
4. Implement analytics
5. Add push notifications
6. Optimize with route-based code splitting
