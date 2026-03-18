# Noir Factory Frontend

A mobile-first React PWA for content creation and engagement automation.

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` with your Supabase credentials:
```bash
cp .env.example .env.local
```

Then edit `.env.local` and add your Supabase anon key:
```
VITE_SUPABASE_ANON_KEY=your_key_here
```

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173` and will proxy API calls to `http://localhost:8080/api`.

### Build

Build for production:
```bash
npm run build
```

The output will be in `../public/` directory, which is served by the Express backend.

### Preview

Preview the production build locally:
```bash
npm run preview
```

## Architecture

### Mobile-First Design
- Optimized for iOS and Android
- Touch-friendly tap targets (min 44px)
- Safe area support for notches
- PWA manifest for installability
- Service worker for offline shell caching

### Authentication
- Google SSO via Supabase Auth
- Protected routes for authenticated users
- Session persistence with localStorage
- Auto-logout on token expiry

### State Management
- Zustand stores for auth, company, and content
- Persistent localStorage for company selection

### Pages

#### Feed (Home)
The main swipe card interface where users:
- Review content items from RSS feeds
- Swipe left to reject, right to approve
- Filter by feed source
- Pull to refresh

#### Queue
Shows status of all content jobs:
- Queued, processing, ready, failed, published states
- Expandable details for each job
- Retry failed jobs
- Real-time status updates

#### Bot (Engagement)
Engagement automation settings:
- Toggle bot on/off
- Manage target hashtags
- Create comment templates
- View engagement activity feed
- Today's stats (likes, comments, follows)

#### Settings
Configuration page for:
- RSS feed management (add/remove)
- Company prompts and templates
- Integration status
- Account management
- Logout

## API Integration

The frontend communicates with the backend via `/api` endpoints. Key headers:
- `Authorization: Bearer {supabase_access_token}`
- `X-Company-ID: {company_id}`

All API calls are wrapped by the `apiCall` utility in `src/lib/api.ts`.

## Build Output

The Vite build outputs to `../public/`, replacing the old static files. The Express server serves this as the SPA root, with all non-/api routes falling back to `index.html`.

## Technologies

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Dark theme styling
- **Framer Motion** - Card swipe animations
- **Zustand** - Lightweight state management
- **Supabase Auth** - Google OAuth
- **React Router** - Client-side routing
- **Vite** - Fast build tool
- **PWA** - Progressive web app support

## Mobile Responsive Breakpoints

- Mobile: 320px - 480px (primary target)
- Tablet: 481px - 768px
- Desktop: 769px+

Cards and layouts adapt to viewport width with max-width constraints.
