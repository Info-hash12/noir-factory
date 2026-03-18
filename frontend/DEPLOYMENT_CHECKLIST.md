# Noir Factory Frontend - Deployment Checklist

## Pre-Deployment

- [ ] All TypeScript types are correct (no `any` types except necessary)
- [ ] Environment variables are set (`.env.local` with Supabase key)
- [ ] Backend API is running and accessible
- [ ] Build completes without errors: `npm run build`
- [ ] No console warnings in production build
- [ ] All pages are tested on mobile device
- [ ] Swipe gestures work smoothly on touch devices

## Build & Static Files

- [ ] Run `npm run build` from `/frontend` directory
- [ ] Check `/public` directory has:
  - [ ] `index.html` (SPA entry point)
  - [ ] `manifest.json` (PWA manifest)
  - [ ] `sw.js` (Service worker)
  - [ ] `assets/` directory with JS and CSS files
- [ ] Total bundle size is reasonable (~160 kB gzipped for JS)
- [ ] No broken image references in output

## Express Server Configuration

- [ ] Express server serves `/public` directory as static files
- [ ] SPA fallback configured: non-/api routes serve `index.html`
- [ ] CORS configured to allow frontend origin
- [ ] `/api` routes proxy to backend endpoints
- [ ] Gzip compression enabled for assets
- [ ] Cache headers configured (cache-busting for versioned assets)

## Authentication (Supabase)

- [ ] Supabase project created with Google OAuth provider
- [ ] Google OAuth credentials configured in Supabase
- [ ] Allowed redirect URLs include:
  - [ ] `http://localhost:5173/` (dev)
  - [ ] `https://your-production-domain.com/` (production)
- [ ] Anon key is available and non-sensitive (public API key)
- [ ] RLS policies configured on tables (auth.uid() checks)

## API Integration

- [ ] All `/api/*` endpoints return correct data structure
- [ ] Authorization header is validated on backend
- [ ] X-Company-ID header is required and validated
- [ ] 401 responses properly handled (redirect to login)
- [ ] Error responses include descriptive messages
- [ ] CORS preflight requests (OPTIONS) are handled

## PWA Configuration

- [ ] `manifest.json` has correct app name and colors
- [ ] Icons are available (currently SVG, upgrade to PNG if needed)
- [ ] Service worker caching strategy is appropriate
- [ ] Add to homescreen works on iOS and Android
- [ ] Offline shell (HTML/CSS) loads without API
- [ ] Web app shortcut targets correct URL

## Mobile Testing

Test on actual devices or emulators:
- [ ] iOS Safari 14+ (iPhone)
- [ ] Chrome Android 90+ (Android phone)
- [ ] iPad (landscape and portrait)
- [ ] Android tablet

### UI/UX Tests
- [ ] Header layout fits within viewport
- [ ] Bottom navigation doesn't overlap content
- [ ] Safe area (notch) properly handled
- [ ] Touch targets are at least 44x44px
- [ ] Forms are keyboard accessible
- [ ] Scrolling is smooth on mobile
- [ ] No horizontal scroll on mobile
- [ ] Dark theme looks good on all screens

### Feature Tests
- [ ] Login with Google works
- [ ] Company switcher loads and switches
- [ ] Swipe cards respond to touch gestures
- [ ] Cards swipe left for reject, right for approve
- [ ] Pull-to-refresh works on iOS
- [ ] Bottom sheet appears on approve
- [ ] Back button works (on Android)
- [ ] Offline mode gracefully handles API errors

## Performance Checklist

- [ ] First Contentful Paint < 2s (on 4G)
- [ ] Largest Contentful Paint < 3s (on 4G)
- [ ] Cumulative Layout Shift < 0.1
- [ ] Time to Interactive < 3s (on 4G)
- [ ] Service worker caches assets correctly
- [ ] No console errors or warnings
- [ ] Memory usage is stable (no leaks)
- [ ] Battery usage is minimal (no excessive polling)

### Lighthouse Audit
Run in Chrome DevTools > Lighthouse:
- [ ] Performance: > 90
- [ ] Accessibility: > 90
- [ ] Best Practices: > 90
- [ ] SEO: > 90
- [ ] PWA: All checks pass

## Security Checklist

- [ ] Supabase anon key is public (safe to commit)
- [ ] No API keys in frontend code
- [ ] No sensitive data in localStorage (except auth token)
- [ ] HTTPS enforced in production
- [ ] CSP headers configured
- [ ] XSS protection enabled
- [ ] CSRF tokens used for state-changing operations
- [ ] Input sanitization on user-generated content
- [ ] No credentials stored in localStorage

## Browser Compatibility

Test on:
- [ ] Chrome 90+
- [ ] Firefox 88+
- [ ] Safari 14+ (macOS)
- [ ] Safari 14+ (iOS)
- [ ] Edge 90+
- [ ] Chrome Android 90+
- [ ] Samsung Internet 14+

## Monitoring & Analytics

- [ ] Error logging configured (e.g., Sentry)
- [ ] Analytics tracking setup (e.g., GA4)
- [ ] Custom events for key user actions
- [ ] Performance monitoring enabled
- [ ] Alert thresholds configured for errors

## Documentation

- [ ] README.md completed with setup instructions
- [ ] FRONTEND_SETUP.md written with architecture
- [ ] API endpoints documented
- [ ] Environment variables documented
- [ ] Deployment instructions written
- [ ] Troubleshooting guide provided

## Launch Readiness

- [ ] Product owner approval on UI/UX
- [ ] QA testing completed and signed off
- [ ] Security review completed
- [ ] Performance benchmarks met
- [ ] Stakeholders notified of launch
- [ ] Rollback plan documented
- [ ] Monitoring dashboards set up
- [ ] Support team trained on new system

## Post-Deployment

- [ ] Monitor error logs for first 24 hours
- [ ] Check analytics for user traffic
- [ ] Verify all API integrations working
- [ ] Monitor performance metrics
- [ ] Collect user feedback
- [ ] Schedule post-launch review meeting
- [ ] Plan next features/improvements

## Rollback Plan

If issues occur:
1. Revert to previous `/public` directory (backup original)
2. Clear browser caches and service worker
3. Communicate status to users
4. Post-mortem on what went wrong
5. Fix issues on develop branch
6. Re-deploy after testing

## Success Criteria

- [ ] All planned features working
- [ ] No critical bugs reported
- [ ] Performance meets targets
- [ ] Users can navigate without issues
- [ ] Mobile experience is smooth
- [ ] Offline mode gracefully degrades
- [ ] Error handling is user-friendly
- [ ] System is stable for 48 hours

---

**Deployment Date**: ___________
**Deployed By**: ___________
**Version**: ___________
**Status**: [ ] Pending [ ] In Progress [ ] Complete [ ] Rolled Back
