# Noir Factory Frontend - Quick Start Guide

## TL;DR - Get Started in 2 Minutes

```bash
# 1. Install dependencies
cd frontend
npm install

# 2. Set environment variable (already done in .env.local)
# Verify: cat .env.local | grep VITE_SUPABASE_ANON_KEY

# 3. Start development server
npm run dev

# 4. Open browser
# http://localhost:5173
```

Done! The app will auto-proxy API calls to your backend at `localhost:8080`.

## Development Commands

```bash
# Start dev server with HMR
npm run dev

# Build for production (outputs to ../public/)
npm run build

# Preview production build locally
npm run preview
```

## What You Get

A complete mobile-first React PWA with:

- **Swipe Card Interface** - Tinder-style content review
- **Job Queue** - Real-time status tracking
- **Engagement Bot** - Automated social media interactions
- **Settings** - Feed management and templates
- **Google OAuth** - Supabase authentication
- **PWA Support** - Installable on mobile

## Key Files & What They Do

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main router with protected routes |
| `src/pages/FeedPage.tsx` | Swipe cards (main feature) |
| `src/pages/QueuePage.tsx` | Job status tracking |
| `src/pages/BotPage.tsx` | Engagement automation |
| `src/pages/SettingsPage.tsx` | Configuration |
| `src/components/SwipeCard.tsx` | Framer Motion swipe gestures |
| `src/store/` | Zustand state management |
| `src/lib/api.ts` | API calls with auth headers |
| `vite.config.ts` | Build config with /api proxy |
| `tailwind.config.js` | Dark theme styling |

## Feature Highlights

### Swipe Card Interface
- Drag left to reject (red overlay)
- Drag right to approve (green overlay)
- Minimum 100px swipe threshold
- Elastic revert if threshold not met
- Quick action buttons below

### Real-Time Queue
- Queued → Processing → Ready → Published
- Auto-refresh every 5 seconds
- Expandable cards with full details
- Retry failed jobs

### Engagement Bot
- Toggle on/off
- Track today's stats
- Manage hashtags and templates
- View activity feed

### Settings
- Add/remove RSS feeds
- Edit 5 company prompt templates
- Account & logout

## API Integration

All API calls automatically include:
```
Authorization: Bearer {supabase_access_token}
X-Company-ID: {selected_company_id}
```

Backend must return JSON with proper error handling.

## Authentication Flow

1. User visits `/login`
2. Clicks "Sign in with Google"
3. Supabase handles OAuth
4. User redirected to `/`
5. Protected routes check `useAuthStore.user`
6. Company auto-selected from localStorage
7. All subsequent API calls authenticated

## Styling

- **Dark theme**: bg-gray-950, cards bg-gray-900
- **Colors**: Blue accent (#3b82f6), Green success (#10b981), Red error (#ef4444)
- **Mobile**: Max 480px wide cards, 44px min tap targets
- **Safe areas**: Notch-aware padding

## Building for Production

```bash
npm run build

# Output: ../public/
#   ├── index.html
#   ├── manifest.json
#   ├── sw.js
#   └── assets/
#       ├── index-*.js
#       └── index-*.css
```

Express server should:
1. Serve `../public` as static
2. Fallback non-/api routes to `index.html`
3. Proxy `/api/*` to backend
4. Enable gzip compression

## Browser DevTools Tips

### React DevTools
- Install React Developer Tools extension
- Inspect components in `Components` tab
- View props and state

### Network Tab
- Check API calls to `/api/*`
- Verify `Authorization` header present
- Check `X-Company-ID` header

### Storage
- `localStorage.noir_company_id` = selected company

### Service Worker
- `Application` → `Service Workers`
- Check registration and caching

## Common Issues & Fixes

| Problem | Solution |
|---------|----------|
| API 401 errors | Supabase token expired, refresh page |
| Swipe not working | Check touch device (desktop needs mouse drag) |
| Blank page | Check console errors (F12) |
| API proxy not working | Verify backend running on :8080 |
| PWA not installing | Check manifest.json and https (in production) |

## Environment Setup

### Required
```
VITE_SUPABASE_ANON_KEY=your_key_here
```

Already set in `.env.local`. Get key from Supabase dashboard.

### Optional (for production)
- Set different Supabase URL in `src/lib/supabase.ts`
- Update manifest.json icons
- Configure service worker caching strategy

## Next Steps

1. **Test swipe gestures** on a mobile device or emulator
2. **Verify API integration** by checking network tab
3. **Try PWA install** on mobile (Add to homescreen)
4. **Test offline** by disabling network (API returns error)
5. **Check performance** with Lighthouse audit

## Documentation

- **README.md** - Setup and architecture
- **FRONTEND_SETUP.md** - Detailed guide with all details
- **DEPLOYMENT_CHECKLIST.md** - Pre-launch verification

## Support

If issues occur:
1. Check browser console (F12 → Console)
2. Check network requests (F12 → Network)
3. Verify backend is running and reachable
4. Check Supabase credentials in .env.local
5. Clear browser cache and reload

---

**You're ready to build!** 🚀
