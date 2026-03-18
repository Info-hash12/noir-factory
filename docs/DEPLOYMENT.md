# Deployment Guide - Noir Factory

Complete guide for deploying the Noir Factory application to Google Cloud Run and RunPod.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [RunPod Worker Setup](#runpod-worker-setup)
3. [Cloud Run Deployment](#cloud-run-deployment)
4. [Environment Variables](#environment-variables)
5. [Cloud Scheduler Setup](#cloud-scheduler-setup)
6. [Monitoring & Logs](#monitoring--logs)

---

## Prerequisites

### Required Tools

```bash
# Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Install Docker
# https://docs.docker.com/get-docker/

# Login to GCP
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### Required Services

- Google Cloud Project
- Supabase Project
- RunPod Account
- Google Drive Service Account
- API Keys (ScreenshotOne, OpenRouter, SendGrid, etc.)

---

## RunPod Worker Setup

### 1. Build Worker Image

```bash
cd workers/runpod-worker

# Build the Docker image
docker build -t noir-factory-worker:latest .

# Tag for RunPod registry
docker tag noir-factory-worker:latest \
  YOUR_RUNPOD_REGISTRY/noir-factory-worker:latest

# Push to RunPod
docker push YOUR_RUNPOD_REGISTRY/noir-factory-worker:latest
```

### 2. Deploy to RunPod

1. Go to RunPod Dashboard: https://runpod.io
2. Navigate to "Serverless" → "Endpoints"
3. Click "New Endpoint"
4. Configure:
   - **Name**: `noir-factory-worker`
   - **Docker Image**: `YOUR_RUNPOD_REGISTRY/noir-factory-worker:latest`
   - **GPU Type**: Select appropriate GPU (RTX 3090 recommended)
   - **Idle Timeout**: 60 seconds
   - **Workers**: Min: 0, Max: 5
   - **Environment Variables**:
     ```
     GOOGLE_CREDENTIALS_PATH=/credentials.json
     ```
5. Upload Google Drive credentials as secret
6. Click "Deploy"

### 3. Get Endpoint URL

```bash
# Your RunPod endpoint URL will be:
https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync

# Add to your .env file:
RUNPOD_WORKER_URL=https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync
RUNPOD_API_KEY=your_runpod_api_key
```

### 4. Test Worker

```bash
curl -X POST https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync \
  -H "Authorization: Bearer YOUR_RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "task_type": "generate_base",
      "image_url": "https://example.com/image.jpg",
      "prompt": "person speaking naturally"
    }
  }'
```

---

## Cloud Run Deployment

### 1. Build Application Image

```bash
# Build the Docker image
docker build -t gcr.io/YOUR_PROJECT_ID/noir-factory:latest .

# Push to Google Container Registry
docker push gcr.io/YOUR_PROJECT_ID/noir-factory:latest

# Or use Cloud Build
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/noir-factory:latest
```

### 2. Create Secrets in Secret Manager

```bash
# Create secrets for sensitive data
echo -n "your_supabase_url" | gcloud secrets create SUPABASE_URL --data-file=-
echo -n "your_supabase_key" | gcloud secrets create SUPABASE_KEY --data-file=-
echo -n "your_openrouter_key" | gcloud secrets create OPENROUTER_API_KEY --data-file=-
echo -n "your_screenshotone_key" | gcloud secrets create SCREENSHOTONE_API_KEY --data-file=-
echo -n "your_runpod_key" | gcloud secrets create RUNPOD_API_KEY --data-file=-
echo -n "$(openssl rand -hex 32)" | gcloud secrets create CRON_SECRET_TOKEN --data-file=-

# Optional: Notification secrets
echo -n "your_slack_webhook" | gcloud secrets create SLACK_WEBHOOK_URL --data-file=-
echo -n "your_telegram_token" | gcloud secrets create TELEGRAM_BOT_TOKEN --data-file=-
echo -n "your_sendgrid_key" | gcloud secrets create SENDGRID_API_KEY --data-file=-
```

### 3. Deploy to Cloud Run

```bash
gcloud run deploy noir-factory \
  --image gcr.io/YOUR_PROJECT_ID/noir-factory:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 3600 \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars="NODE_ENV=production,PORT=8080" \
  --set-secrets="SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_KEY=SUPABASE_KEY:latest,OPENROUTER_API_KEY=OPENROUTER_API_KEY:latest,SCREENSHOTONE_API_KEY=SCREENSHOTONE_API_KEY:latest,RUNPOD_API_KEY=RUNPOD_API_KEY:latest,CRON_SECRET_TOKEN=CRON_SECRET_TOKEN:latest,SLACK_WEBHOOK_URL=SLACK_WEBHOOK_URL:latest"
```

### 4. Get Service URL

```bash
# Get the deployed URL
gcloud run services describe noir-factory \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)'

# Example output:
# https://noir-factory-abc123-uc.a.run.app
```

### 5. Test Deployment

```bash
# Test health endpoint
curl https://your-service-url.run.app/api/health

# Expected response:
# {"success":true,"message":"Noir Factory is running"}
```

---

## Environment Variables

### Required Variables

```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key

# AI Services
OPENROUTER_API_KEY=sk-or-v1-...
SCREENSHOTONE_API_KEY=your_key

# RunPod
RUNPOD_WORKER_URL=https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync
RUNPOD_API_KEY=your_runpod_api_key

# Google Drive
GOOGLE_DRIVE_CREDENTIALS={"type":"service_account",...}
GOOGLE_DRIVE_FOLDER_ID=your_folder_id

# RSS Feed
RSS_FEED_URL=https://www.reddit.com/r/YourSubreddit/.rss

# Cron Security
CRON_SECRET_TOKEN=your_random_secret_token
```

### Optional Variables

```env
# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=123456789
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=reports@domain.com
SENDGRID_TO_EMAIL=you@domain.com

# TTS Service
TTS_SERVICE_URL=http://localhost:5000

# Configuration
LOG_LEVEL=info
NODE_ENV=production
PORT=8080
```

---

## Cloud Scheduler Setup

### 1. Enable Required APIs

```bash
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable pubsub.googleapis.com
```

### 2. Create Pub/Sub Topics

```bash
# Create topics for scheduled tasks
gcloud pubsub topics create process-jobs
gcloud pubsub topics create daily-report
```

### 3. Create Scheduler Jobs

#### Process Jobs (Every 15 minutes)

```bash
gcloud scheduler jobs create pubsub process-jobs \
  --schedule="*/15 * * * *" \
  --topic=process-jobs \
  --message-body='{"action":"process"}' \
  --time-zone="America/Chicago" \
  --description="Process approved jobs every 15 minutes"
```

#### Daily Report (10:00 AM CST)

```bash
gcloud scheduler jobs create pubsub daily-report \
  --schedule="0 10 * * *" \
  --topic=daily-report \
  --message-body='{"action":"report"}' \
  --time-zone="America/Chicago" \
  --description="Send daily analytics report at 10:00 AM CST"
```

### 4. Configure Pub/Sub Push Subscriptions

```bash
# Get Cloud Run service URL
SERVICE_URL=$(gcloud run services describe noir-factory \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)')

# Create push subscription for process-jobs
gcloud pubsub subscriptions create process-jobs-sub \
  --topic=process-jobs \
  --push-endpoint="${SERVICE_URL}/pubsub/process-jobs" \
  --ack-deadline=600

# Create push subscription for daily-report
gcloud pubsub subscriptions create daily-report-sub \
  --topic=daily-report \
  --push-endpoint="${SERVICE_URL}/pubsub/daily-report" \
  --ack-deadline=300
```

### 5. Test Schedulers

```bash
# Trigger process-jobs manually
gcloud scheduler jobs run process-jobs

# Trigger daily-report manually
gcloud scheduler jobs run daily-report

# View logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50
```

---

## Monitoring & Logs

### View Cloud Run Logs

```bash
# Real-time logs
gcloud run services logs read noir-factory \
  --platform managed \
  --region us-central1 \
  --limit=100 \
  --follow

# Filter logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=noir-factory" \
  --limit=50 \
  --format=json
```

### View Scheduler Logs

```bash
# Scheduler execution logs
gcloud logging read "resource.type=cloud_scheduler_job" --limit=20

# Pub/Sub delivery logs
gcloud logging read "resource.type=pubsub_subscription" --limit=20
```

### Metrics Dashboard

1. Go to Google Cloud Console
2. Navigate to "Cloud Run" → "noir-factory"
3. Click "METRICS" tab
4. View:
   - Request count
   - Request latency
   - Container instances
   - CPU/Memory utilization

### Set Up Alerts

```bash
# Create alert policy for errors
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Noir Factory Error Rate" \
  --condition-display-name="High error rate" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s
```

---

## Scaling Configuration

### Autoscaling

```bash
# Update Cloud Run with autoscaling settings
gcloud run services update noir-factory \
  --platform managed \
  --region us-central1 \
  --min-instances=1 \
  --max-instances=20 \
  --concurrency=100 \
  --cpu-throttling \
  --memory=2Gi
```

### RunPod Autoscaling

Configure in RunPod dashboard:
- **Min Workers**: 0 (cost-effective)
- **Max Workers**: 5-10 (based on load)
- **Scale Down Delay**: 60s
- **Request Timeout**: 300s (Wan2.2) / 600s (InfiniteTalk)

---

## Cost Optimization

### Cloud Run

- Use **min-instances=0** for dev/staging
- Use **min-instances=1** for production (faster cold starts)
- Set appropriate **--memory** and **--cpu** limits
- Use **--cpu-throttling** to reduce costs when idle

### RunPod

- Use **Serverless** (pay per second)
- Set **idle timeout** to 60s
- Use **spot instances** for non-critical workloads
- Monitor GPU utilization in dashboard

### Supabase

- Use **free tier** for development
- Upgrade to **Pro** for production
- Enable **connection pooling**
- Use **read replicas** for high traffic

---

## Troubleshooting

### Cloud Run Issues

```bash
# Check service status
gcloud run services describe noir-factory

# View recent errors
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=50

# Test locally
docker run -p 8080:8080 --env-file .env gcr.io/YOUR_PROJECT_ID/noir-factory:latest
```

### RunPod Issues

```bash
# Check worker health
curl -X POST $RUNPOD_WORKER_URL/health \
  -H "Authorization: Bearer $RUNPOD_API_KEY"

# View worker logs in RunPod dashboard
# Navigate to: Endpoints → Your Endpoint → Logs
```

### Database Issues

```bash
# Test Supabase connection
curl https://YOUR_PROJECT.supabase.co/rest/v1/ \
  -H "apikey: YOUR_KEY" \
  -H "Authorization: Bearer YOUR_KEY"
```

---

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use Secret Manager** for all sensitive data
3. **Enable VPC** for internal services
4. **Restrict IAM permissions** to minimum required
5. **Enable Cloud Armor** for DDoS protection
6. **Use HTTPS only** (enforced by Cloud Run)
7. **Rotate secrets** regularly
8. **Monitor access logs** for suspicious activity

---

## Next Steps

1. ✅ Deploy RunPod worker
2. ✅ Deploy Cloud Run service
3. ✅ Configure Cloud Scheduler
4. ✅ Set up monitoring and alerts
5. ✅ Test end-to-end pipeline
6. ✅ Configure budget alerts
7. ✅ Document runbooks for common issues
8. ✅ Set up automated backups

---

## Support

For issues or questions:
- Check logs: `gcloud run services logs read noir-factory`
- Review documentation: `/docs`
- Test endpoints: Use provided curl commands
- Monitor dashboard: `https://console.cloud.google.com`
