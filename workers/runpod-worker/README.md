# RunPod Worker - Deployment Guide

This worker handles GPU-intensive video generation tasks using Wan2.2 and InfiniteTalk models.

## Overview

**Supported Task Types:**
1. `generate_base` - Generates 720p video from image using Wan2.2
2. `dub_video` - Adds lip-synced audio to video using InfiniteTalk

Both tasks return:
- `video_url` - Google Drive URL of the generated video
- `drive_file_id` - Drive file ID
- `gpu_seconds` - GPU time consumed (for cost tracking)

## Prerequisites

- RunPod account
- Docker installed locally
- Google Drive service account credentials
- Model weights for Wan2.2 and InfiniteTalk

## Building the Docker Image

```bash
cd workers/runpod-worker

# Build the image
docker build -t noir-factory-worker:latest .

# Test locally (optional)
docker run -p 8000:8000 \
  -e GOOGLE_CREDENTIALS_PATH=/credentials.json \
  -v /path/to/credentials.json:/credentials.json \
  noir-factory-worker:latest
```

## Deploying to RunPod

### 1. Push Image to Container Registry

```bash
# Tag for your container registry
docker tag noir-factory-worker:latest \
  your-registry.io/noir-factory-worker:latest

# Push to registry
docker push your-registry.io/noir-factory-worker:latest
```

### 2. Create RunPod Serverless Endpoint

1. Go to [RunPod Dashboard](https://runpod.io)
2. Navigate to **Serverless** → **Endpoints**
3. Click **New Endpoint**
4. Configure:
   - **Name**: `noir-factory-worker`
   - **Docker Image**: `your-registry.io/noir-factory-worker:latest`
   - **GPU Type**: RTX 3090 or RTX 4090 (recommended)
   - **Container Disk**: 20 GB
   - **Idle Timeout**: 60 seconds
   - **Workers**:
     - Min: 0 (cost-effective)
     - Max: 5 (adjust based on load)
   - **Environment Variables**:
     ```
     GOOGLE_CREDENTIALS_PATH=/credentials.json
     ```
5. Upload Google Drive credentials as a **Secret**:
   - Name: `GOOGLE_CREDENTIALS`
   - Mount Path: `/credentials.json`
   - Value: Paste your service account JSON

6. Click **Deploy**

### 3. Get Endpoint URL

After deployment, you'll receive an endpoint URL:**

```
https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync
```

Add this to your main app's `.env`:

```env
RUNPOD_WORKER_URL=https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync
RUNPOD_API_KEY=your_runpod_api_key
```

## Testing the Worker

### Test generate_base

```bash
curl -X POST https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync \
  -H "Authorization: Bearer YOUR_RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "task_type": "generate_base",
      "image_url": "https://example.com/image.jpg",
      "prompt": "person speaking naturally",
      "num_frames": 120
    }
  }'
```

**Expected Response:**
```json
{
  "id": "job-123",
  "status": "COMPLETED",
  "output": {
    "success": true,
    "video_url": "https://drive.google.com/file/d/FILE_ID",
    "drive_file_id": "FILE_ID",
    "gpu_seconds": 45.2
  }
}
```

### Test dub_video

```bash
curl -X POST https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync \
  -H "Authorization: Bearer YOUR_RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "task_type": "dub_video",
      "video_url": "https://drive.google.com/file/d/VIDEO_ID",
      "audio_url": "https://drive.google.com/file/d/AUDIO_ID",
      "lip_sync_strength": 1.0
    }
  }'
```

**Expected Response:**
```json
{
  "id": "job-456",
  "status": "COMPLETED",
  "output": {
    "success": true,
    "video_url": "https://drive.google.com/file/d/FILE_ID",
    "drive_file_id": "FILE_ID",
    "gpu_seconds": 120.5
  }
}
```

## Model Weights

### InfiniteTalk

The Dockerfile automatically clones InfiniteTalk from GitHub:
```
https://github.com/MeiGen-AI/InfiniteTalk.git → /app/infinitetalk/
```

Follow the [InfiniteTalk setup instructions](https://github.com/MeiGen-AI/InfiniteTalk) to download model checkpoints.

### Wan2.2

The handler automatically downloads Wan2.2 weights from HuggingFace on first run:

```python
# In handler.py (already implemented)
def download_model_weights():
    if not os.path.exists(f"{WAN2_MODEL_PATH}/model.safetensors"):
        snapshot_download(
            repo_id="your-org/wan2.2",  # Update with actual model ID
            local_dir=WAN2_MODEL_PATH
        )
```

**To use actual Wan2.2 weights:**

1. **Option A: HuggingFace Hub** (Recommended)
   - Find the Wan2.2 model on HuggingFace
   - Update `repo_id` in handler.py
   - Weights auto-download on first run

2. **Option B: Bake into Docker**
   ```dockerfile
   # Add to Dockerfile before COPY handler.py
   COPY wan2-weights/ /app/wan2/weights/
   ```

3. **Option C: Mount as RunPod Secret**
   - Upload weights as RunPod storage
   - Mount at `/app/wan2/weights/`

## Monitoring

### View Logs

1. RunPod Dashboard → Endpoints → Your Endpoint
2. Click **Logs** tab
3. View real-time logs from worker execution

### Check Metrics

```bash
# Get endpoint statistics
curl -X GET https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/stats \
  -H "Authorization: Bearer YOUR_RUNPOD_API_KEY"
```

## Cost Optimization

**RunPod Pricing** (as of 2026):
- RTX 3090: ~$0.50/hour
- RTX 4090: ~$0.80/hour
- Serverless: Pay per second (min charge: 1 second)

**Tips:**
- Set idle timeout to 60s to minimize costs
- Use Min Workers: 0 for development
- Use Max Workers: 5-10 for production load
- Monitor gpu_seconds to track actual usage

**Example Cost Calculation:**
```
Wan2.2 (45s) + InfiniteTalk (120s) = 165s total
165s ÷ 3600s/hr × $0.50/hr = $0.023 per video
```

## Troubleshooting

### Worker fails to start

```bash
# Check Docker image locally
docker run -it noir-factory-worker:latest bash

# Test Python imports
python -c "import runpod; print('OK')"

# Check FFmpeg
ffmpeg -version
```

### GPU out of memory

```
# Reduce batch size or resolution
--num_frames 80  # Instead of 120
--resolution 480p  # Instead of 720p
```

### Drive upload fails

```python
# Verify credentials
python -c "from google.oauth2 import service_account; \
credentials = service_account.Credentials.from_service_account_file('/credentials.json'); \
print('Credentials OK')"
```

### Timeouts

```bash
# Increase timeout in main app
VIDEO_GEN_TIMEOUT=600000  # 10 minutes
INFINITETALK_TIMEOUT=900000  # 15 minutes
```

## Scaling

**Horizontal Scaling:**
- RunPod automatically scales workers based on queue depth
- Configure Max Workers based on expected concurrent load
- Each worker handles one job at a time

**Vertical Scaling:**
- Use RTX 4090 for faster processing
- Reduce processing time = lower cost per video

**Example Load:**
- 100 videos/day ÷ 24 hours = ~4 videos/hour
- 4 videos × 165s = 660s/hour of GPU time
- Recommended: Max Workers = 2-3

## Health Checks

The worker automatically responds to RunPod health checks. Custom health check:

```python
# Add to handler.py
def health_check():
    return {
        "status": "healthy",
        "models_loaded": os.path.exists('/app/wan2/weights/'),
        "drive_connected": test_drive_connection()
    }
```

## Support

For issues or questions:
- RunPod Discord: https://discord.gg/runpod
- GitHub Issues: Your repository
- Email: your-support@email.com
