# RunPod Worker Dockerfile
# GPU-enabled container for Wan2.2 and InfiniteTalk

FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    wget \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Clone and setup InfiniteTalk
RUN git clone https://github.com/MeiGen-AI/InfiniteTalk.git /app/infinitetalk && \
    cd /app/infinitetalk && \
    pip install -r requirements.txt || true

# Create Wan2.2 directory (weights downloaded on first run)
RUN mkdir -p /app/wan2/weights /app/wan2/models

# Copy worker handler
COPY handler.py .

# Create temp directory
RUN mkdir -p /tmp

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV GOOGLE_CREDENTIALS_PATH=/credentials.json

# Expose port (if running HTTP mode)
EXPOSE 8000

# Run the handler
CMD ["python", "-u", "handler.py"]
