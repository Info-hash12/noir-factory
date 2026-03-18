# Noir Factory

Autonomous video content creation pipeline powered by AI. Monitors Reddit RSS feeds, generates scripts with Claude, creates voiceovers with Qwen3-TTS, generates videos with Wan2.2 + InfiniteTalk, and publishes to social media.

## 🎬 Features

- **RSS Monitoring**: Automatic Reddit post tracking
- **AI Script Generation**: Claude 3.5 Sonnet via OpenRouter
- **Voice Synthesis**: Qwen3-TTS with character profiles
- **Video Generation**: Wan2.2 (720p base videos) + InfiniteTalk (lip-sync)
- **Video Composition**: Native FFmpeg compositor with dual modes (split-screen, greenscreen)
- **Budget Controls**: Daily/monthly caps, GPU tracking, cost estimation
- **Analytics Dashboard**: Cost per draft, GPU utilization, failure heatmap
- **Telegram Bot**: Remote monitoring and control
- **Cloud-Native**: Deployed on Google Cloud Run + RunPod serverless GPUs

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Google Cloud Run                         │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Main Application (Node.js)                        │    │
│  │  ├─ Express API Server                             │    │
│  │  ├─ RSS Monitor (15min intervals)                  │    │
│  │  ├─ Pipeline Orchestrator (V1 + V2)                │    │
│  │  ├─ Budget Controls & Analytics                    │    │
│  │  └─ Telegram Bot                                   │    │
│  └────────────────────────────────────────────────────┘    │
│                          ↓                                   │
│         ┌────────────────┬────────────────┐                │
│         ↓                ↓                ↓                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │  Supabase    │ │  RunPod GPU  │ │ Google Drive │       │
│  │  PostgreSQL  │ │  Workers     │ │              │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Prerequisites

- Node.js 18+
- Docker (for local development & deployment)
- Google Cloud Project
- Supabase Project
- RunPod Account
- API Keys:
  - ScreenshotOne
  - OpenRouter
  - Telegram (optional)

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/your-repo/noir-factory.git
cd noir-factory
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

### 4. Setup Database

```bash
# Run Supabase migrations
cd supabase/migrations
# Apply migrations in order:
# 001_create_tables.sql
# 002_add_columns.sql
# 003_budget_controls.sql
# 004_pipeline_v2_columns.sql
```

### 5. Run Locally

```bash
npm start
# Server starts on http://localhost:3000
```

### 6. Test API

```bash
# Health check
curl http://localhost:3000/api/health

# Trigger RSS check
curl -X POST http://localhost:3000/api/trigger
```

## 🌐 Deployment

### Deploy Main Application to Cloud Run

#### Option 1: Using Cloud Build (Recommended)

```bash
# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Create secrets in Secret Manager
echo -n "your_value" | gcloud secrets create SUPABASE_URL --data-file=-
echo -n "your_value" | gcloud secrets create SUPABASE_KEY --data-file=-
# ... create all required secrets

# Deploy with Cloud Build
gcloud builds submit --config cloudbuild.yaml

# Get service URL
gcloud run services describe noir-factory \
  --region us-central1 \
  --format 'value(status.url)'
```

#### Option 2: Manual Docker Build

```bash
# Build image
docker build -t gcr.io/YOUR_PROJECT_ID/noir-factory .

# Push to Container Registry
docker push gcr.io/YOUR_PROJECT_ID/noir-factory

# Deploy to Cloud Run
gcloud run deploy noir-factory \
  --image gcr.io/YOUR_PROJECT_ID/noir-factory \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --set-env-vars NODE_ENV=production,PORT=8080 \
  --set-secrets SUPABASE_URL=SUPABASE_URL:latest,...
```

### Deploy RunPod GPU Worker

See [workers/runpod-worker/README.md](workers/runpod-worker/README.md) for detailed instructions.

**Quick Summary:**

```bash
cd workers/runpod-worker

# Build worker image
docker build -t noir-factory-worker .

# Push to your registry
docker push your-registry.io/noir-factory-worker

# Deploy via RunPod Dashboard
# Get endpoint URL and add to main app's .env
```

### Configure Cloud Scheduler

See [docs/CLOUD_SCHEDULER_SETUP.md](docs/CLOUD_SCHEDULER_SETUP.md)

```bash
# Create Pub/Sub topics
gcloud pubsub topics create process-jobs daily-report

# Create scheduler jobs
gcloud scheduler jobs create pubsub process-jobs \
  --schedule="*/15 * * * *" \
  --topic=process-jobs \
  --message-body='{"action":"process"}'

# Create push subscriptions
gcloud pubsub subscriptions create process-jobs-sub \
  --topic=process-jobs \
  --push-endpoint="YOUR_CLOUD_RUN_URL/pubsub/process-jobs"
```

## 🤖 Telegram Bot Setup

1. **Create Bot with BotFather:**
   ```
   /newbot
   # Follow prompts to get token
   ```

2. **Configure Environment:**
   ```env
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   API_BASE_URL=https://your-cloud-run-url.run.app
   ```

3. **Start Bot:**
   - Bot starts automatically when server starts
   - Find your bot on Telegram and send `/start`

4. **Available Commands:**
   - `/cost` - View budget and spending
   - `/queue` - Monitor job queue
   - `/settings` - View configuration
   - `/run_oneoff <url>` - Create high-priority job
   - `/analytics` - View 7-day metrics

## 📊 API Endpoints

### Core API

```
GET  /api/health           - Health check
GET  /api/posts            - List processed posts
GET  /api/posts/:id        - Get specific post
POST /api/trigger          - Manually trigger RSS check
```

### Dashboard API

```
GET  /api/dashboard/settings              - Get configuration
PUT  /api/dashboard/settings              - Update settings
GET  /api/dashboard/queue                 - View job queue
GET  /api/dashboard/metrics               - Get metrics
POST /api/jobs/run-one-off                - Create one-off job
GET  /api/dashboard/analytics/cost-per-draft  - Cost analytics
GET  /api/dashboard/analytics/gpu-utilization - GPU metrics
GET  /api/dashboard/analytics/token-usage     - Token usage
```

### Review API

```
GET  /review/pending       - Get pending jobs
POST /review/:id/approve   - Approve job
POST /review/:id/reject    - Reject job
```

### RunPod GPU Worker API

```
POST /api/runpod/jobs              - Submit video generation job
GET  /api/runpod/jobs/:id          - Check job status
GET  /api/runpod/health            - Check worker health
POST /api/runpod/test              - Test worker connectivity
```

## 🔧 Configuration

### Budget Controls

Update via dashboard API or app_config table:

```sql
-- Set daily cap
UPDATE app_config SET value = '25'::jsonb WHERE key = 'daily_cap';

-- Set model preset
UPDATE app_config SET value = '"Balanced"'::jsonb WHERE key = 'model_preset';

-- Set overlay mode
UPDATE app_config SET value = '"split_screen_bottom_content"'::jsonb 
WHERE key = 'default_overlay_mode';
```

### Model Presets

- **Fast**: 80 frames, medium quality, fast preset
- **Balanced**: 120 frames, high quality, medium preset (default)
- **Quality**: 180 frames, ultra quality, slow preset

### Overlay Modes

- **split_screen_bottom_content**: Avatar side-by-side with content
- **greenscreen_overlay**: Transparent avatar overlaid on content

## 📈 Monitoring

### View Logs

```bash
# Cloud Run logs
gcloud run services logs read noir-factory --region us-central1 --limit 100

# Real-time logs
gcloud run services logs tail noir-factory --region us-central1
```

### Metrics Dashboard

Access at: https://your-cloud-run-url.run.app/api/dashboard/metrics

**Available Metrics:**
- Cost per successful draft (7-day rolling)
- GPU utilization (hours per day)
- Token usage (OpenRouter)
- Failure heatmap (by pipeline stage)
- Success rate trends

### Alerts

```bash
# Create alert for high error rate
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Noir Factory Error Rate" \
  --condition-threshold-value=0.05
```

## 🧪 Testing

```bash
# Run tests
npm test

# Test specific service
node test-screenshot.js
node test-script.js

# Test RunPod worker
curl -X POST $RUNPOD_WORKER_URL/runsync \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -d '{"input":{"task_type":"generate_base",...}}'
```

## 🔐 Security

- All secrets stored in Google Secret Manager
- API endpoints protected with CRON_SECRET_TOKEN
- Pub/Sub push authentication
- HTTPS enforced (Cloud Run)
- Service account credentials for Google Drive
- Budget hard-stop limits

## 💰 Cost Estimation

**Typical Cost Per Video (V2 Pipeline):**

| Component | Time | Cost | Notes |
|-----------|------|------|-------|
| Script Gen (OpenRouter) | 2s | $0.0010 | Claude 3.5 Sonnet |
| TTS (Qwen3) | 5s | $0.0000 | Self-hosted |
| Wan2.2 (RunPod) | 45s | $0.0063 | RTX 3090 |
| InfiniteTalk (RunPod) | 120s | $0.0167 | RTX 3090 |
| FFmpeg Compositing | 10s | $0.0000 | Cloud Run |
| **Total** | **~3min** | **~$0.024** | Per video |

**Monthly Estimate (500 videos):**
- Videos: 500 × $0.024 = $12.00
- Cloud Run: ~$5.00 (always-on instance)
- Storage: ~$2.00 (Google Drive)
- **Total: ~$19/month**

## 📚 Documentation

- [Cloud Scheduler Setup](docs/CLOUD_SCHEDULER_SETUP.md)
- [Full Deployment Guide](docs/DEPLOYMENT.md)
- [RunPod Worker Guide](workers/runpod-worker/README.md)
- [Qwen3-TTS Migration](MIGRATION_QWEN3TTS.md)

## 🛠️ Development

### Project Structure

```
noir-factory/
├── src/
│   ├── models/           # Data models
│   ├── services/         # Business logic
│   │   ├── compositor/   # Video compositor
│   │   ├── tts/         # TTS service
│   │   └── video/       # RunPod integration
│   ├── routes/          # API routes
│   ├── middleware/      # Budget controls
│   └── utils/           # Helpers
├── workers/
│   └── runpod-worker/   # GPU worker
├── supabase/
│   └── migrations/      # Database schema
├── config/              # Configuration
├── docs/                # Documentation
└── temp/                # Temporary files
```

### V2 Pipeline Stages

1. **TTS**: Generate audio with Qwen3-TTS
2. **Video Gen**: Create 720p base video (Wan2.2)
3. **InfiniteTalk**: Add lip-synced audio
4. **Layer Prep**: FFmpeg compositor (chroma key or positioning)
5. **Shotstack**: Cloud rendering (optional)
6. **Metricool**: Create publishable draft

## 🐛 Troubleshooting

### Common Issues

**Worker timeout:**
```env
# Increase timeouts
VIDEO_GEN_TIMEOUT=600000
INFINITETALK_TIMEOUT=900000
```

**Budget exceeded:**
```bash
# Check current spend
curl https://your-url.run.app/api/dashboard/settings

# Adjust caps
curl -X PUT https://your-url.run.app/api/dashboard/settings \
  -d '{"key":"daily_cap","value":"50"}'
```

**GPU out of memory:**
```
# Reduce frames or use different GPU
--num_frames 80
--gpu RTX-4090
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Wan2.2 team for video generation model
- InfiniteTalk team for lip-sync technology
- Alibaba/Qwen team for Qwen3-TTS
- RunPod for serverless GPU infrastructure
- Anthropic for Claude AI

## 📞 Support

- GitHub Issues: [Create an issue](https://github.com/your-repo/noir-factory/issues)
- Telegram Bot: `/help` command
- Email: support@example.com

---

**Built with ❤️ using AI**
