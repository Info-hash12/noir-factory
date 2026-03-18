# Cloud Scheduler Setup Guide

This guide explains how to set up Google Cloud Scheduler to trigger daily reports at 10:00 AM America/Chicago time.

## Prerequisites

1. Google Cloud Project with enabled services:
   - Cloud Scheduler API
   - Cloud Run (if deploying there)
2. Deployed Noir Factory application
3. CRON_SECRET_TOKEN configured in your environment

## Step 1: Generate a Secure Token

Generate a strong random token for securing your cron endpoint:

```bash
# Generate a secure random token
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add this to your `.env` file:
```env
CRON_SECRET_TOKEN=your_generated_token_here
```

## Step 2: Create Cloud Scheduler Job (gcloud CLI)

```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Create the scheduler job
gcloud scheduler jobs create http daily-report \
  --schedule="0 10 * * *" \
  --time-zone="America/Chicago" \
  --uri="https://your-app-url.run.app/cron/daily-report" \
  --http-method=POST \
  --headers="X-Cron-Secret=your_generated_token_here" \
  --description="Daily analytics report at 10:00 AM CST"
```

## Step 3: Create via Google Cloud Console

1. Navigate to **Cloud Scheduler** in Google Cloud Console
2. Click **Create Job**
3. Fill in the details:
   - **Name**: `daily-report`
   - **Description**: `Daily analytics report at 10:00 AM CST`
   - **Frequency**: `0 10 * * *` (cron format)
   - **Timezone**: `America/Chicago`
   - **Target**: HTTP
   - **URL**: `https://your-app-url.run.app/cron/daily-report`
   - **HTTP method**: POST
   - **Headers**: Add header
     - Name: `X-Cron-Secret`
     - Value: `your_generated_token_here`
4. Click **Create**

## Step 4: Test the Job

### Manual Test via gcloud

```bash
gcloud scheduler jobs run daily-report
```

### Manual Test via curl

```bash
curl -X POST https://your-app-url.run.app/cron/daily-report \
  -H "X-Cron-Secret: your_generated_token_here"
```

### Expected Response

```json
{
  "success": true,
  "message": "Daily report generated and sent",
  "data": {
    "yesterday": {
      "successful": 10,
      "failed": 2,
      "totalCost": "12.50"
    },
    "mtd": {
      "successful": 150,
      "failed": 25,
      "totalCost": "187.50"
    },
    "notifications": {
      "slack": true,
      "telegram": false,
      "email": true
    }
  }
}
```

## Step 5: Monitor Job Execution

### View Logs

```bash
# View scheduler logs
gcloud scheduler jobs describe daily-report

# View application logs (Cloud Run)
gcloud logging read "resource.type=cloud_run_revision" --limit=50
```

### Check Job Status

```bash
gcloud scheduler jobs list
```

## Cron Schedule Examples

```bash
# Every day at 10:00 AM
0 10 * * *

# Every weekday at 9:00 AM
0 9 * * 1-5

# Every Monday at 8:00 AM
0 8 * * 1

# Twice daily (10 AM and 6 PM)
0 10,18 * * *

# Every hour
0 * * * *
```

## Notification Channels

Configure one or more notification channels in your `.env` file:

### Slack

1. Create a Slack webhook: https://api.slack.com/messaging/webhooks
2. Add to `.env`:
```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Telegram

1. Create a bot via @BotFather
2. Get your chat ID (message the bot, then visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`)
3. Add to `.env`:
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

### Email (SendGrid)

1. Sign up for SendGrid: https://sendgrid.com
2. Create an API key
3. Add to `.env`:
```env
SENDGRID_API_KEY=SG.your_api_key_here
SENDGRID_FROM_EMAIL=reports@yourdomain.com
SENDGRID_TO_EMAIL=you@yourdomain.com
```

## Security Best Practices

1. **Never commit** the CRON_SECRET_TOKEN to version control
2. **Rotate** the secret token periodically
3. **Restrict** Cloud Scheduler service account permissions
4. **Monitor** unauthorized access attempts in logs
5. **Use HTTPS** for all cron endpoint calls

## Troubleshooting

### Job Not Running

Check scheduler logs:
```bash
gcloud logging read "resource.type=cloud_scheduler_job" --limit=20
```

### Authentication Errors

Verify the secret token matches in both:
- Cloud Scheduler header
- Application `.env` file

### Report Not Sending

Check notification channel configuration:
```bash
# Test the endpoint directly
curl -X POST http://localhost:3000/cron/daily-report \
  -H "X-Cron-Secret: your_secret"
```

Check application logs for delivery errors.

## Alternative: Manual Execution

Run the report manually without Cloud Scheduler:

```bash
# Direct script execution
node scripts/daily-report.js

# Via HTTP endpoint (development)
curl -X POST http://localhost:3000/cron/daily-report \
  -H "X-Cron-Secret: your_secret"
```

## Cleanup

To delete the scheduler job:

```bash
gcloud scheduler jobs delete daily-report
```

## Additional Resources

- [Cloud Scheduler Documentation](https://cloud.google.com/scheduler/docs)
- [Cron Schedule Expression](https://crontab.guru/)
- [Cloud Run Authentication](https://cloud.google.com/run/docs/authenticating/overview)
