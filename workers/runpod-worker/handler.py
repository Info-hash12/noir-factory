"""
RunPod Worker Handler
Processes video generation and dubbing tasks using Wan2.2 and InfiniteTalk
"""

import runpod
import os
import requests
import time
import json
from pathlib import Path
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from huggingface_hub import snapshot_download

# Model paths
WAN2_MODEL_PATH = '/app/wan2/weights'
INFINITETALK_PATH = '/app/infinitetalk'

def download_model_weights():
    """Download model weights from HuggingFace on first run"""
    try:
        # Download Wan2.2 weights (example - adjust to actual model ID)
        if not os.path.exists(f"{WAN2_MODEL_PATH}/model.safetensors"):
            print("📦 Downloading Wan2.2 weights from HuggingFace...")
            # Replace with actual Wan2.2 model ID when available
            # snapshot_download(
            #     repo_id="your-org/wan2.2",
            #     local_dir=WAN2_MODEL_PATH,
            #     cache_dir="/app/.cache"
            # )
            print("⚠️ Wan2.2 weights need to be provided - using placeholder")
            # Create placeholder to prevent repeated downloads
            Path(f"{WAN2_MODEL_PATH}/.downloaded").touch()
        
        # Check InfiniteTalk is set up
        if os.path.exists(f"{INFINITETALK_PATH}/requirements.txt"):
            print("✅ InfiniteTalk found")
        else:
            print("⚠️ InfiniteTalk not properly installed")
        
        print("✅ Model setup complete")
        
    except Exception as e:
        print(f"⚠️ Model weight download failed: {str(e)}")
        print("Continuing anyway - models may need manual setup")

# Download weights on module load
download_model_weights()

# Initialize Google Drive
CREDENTIALS_PATH = os.getenv('GOOGLE_CREDENTIALS_PATH', '/credentials.json')
credentials = service_account.Credentials.from_service_account_file(
    CREDENTIALS_PATH,
    scopes=['https://www.googleapis.com/auth/drive']
)
drive_service = build('drive', 'v3', credentials=credentials)

def upload_to_drive(file_path, filename, folder_path='RawFunds Media/Videos'):
    """Upload file to Google Drive"""
    try:
        # Create folder structure if needed
        folder_id = ensure_folder_exists(folder_path)
        
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        
        media = MediaFileUpload(file_path, resumable=True)
        file = drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink'
        ).execute()
        
        print(f"✅ Uploaded to Drive: {file.get('id')}")
        return file.get('id')
        
    except Exception as e:
        print(f"❌ Drive upload failed: {str(e)}")
        raise

def ensure_folder_exists(folder_path):
    """Ensure folder structure exists in Drive"""
    parts = folder_path.split('/')
    parent_id = 'root'
    
    for part in parts:
        query = f"name='{part}' and '{parent_id}' in parents and mimeType='application/vnd.google-apps.folder'"
        results = drive_service.files().list(q=query, fields='files(id, name)').execute()
        folders = results.get('files', [])
        
        if folders:
            parent_id = folders[0]['id']
        else:
            file_metadata = {
                'name': part,
                'mimeType': 'application/vnd.google-apps.folder',
                'parents': [parent_id]
            }
            folder = drive_service.files().create(body=file_metadata, fields='id').execute()
            parent_id = folder.get('id')
    
    return parent_id

def download_file(url, output_path):
    """Download file from URL"""
    print(f"📥 Downloading: {url}")
    response = requests.get(url, stream=True, timeout=300)
    response.raise_for_status()
    
    with open(output_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    
    print(f"✅ Downloaded: {output_path}")
    return output_path

def generate_base_video(job):
    """Generate base video using Wan2.2"""
    start_time = time.time()
    
    try:
        image_url = job['input']['image_url']
        prompt = job['input'].get('prompt', 'person speaking naturally')
        num_frames = job['input'].get('num_frames', 120)
        
        # Download image
        image_path = '/tmp/input_image.jpg'
        download_file(image_url, image_path)
        
        # Run Wan2.2 model
        print("🎬 Running Wan2.2 model...")
        output_path = '/tmp/generated_video.mp4'
        
        # Example Wan2.2 command (adjust based on actual model)
        import subprocess
        cmd = [
            'python', '/app/wan2/generate.py',
            '--image', image_path,
            '--prompt', prompt,
            '--num_frames', str(num_frames),
            '--output', output_path,
            '--resolution', '720p'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            raise Exception(f"Wan2.2 failed: {result.stderr}")
        
        print("✅ Video generated")
        
        # Upload to Drive
        drive_file_id = upload_to_drive(
            output_path,
            f"wan2_gen_{job['id']}.mp4",
            'RawFunds Media/Videos/Generated'
        )
        
        # Calculate GPU time
        gpu_seconds = time.time() - start_time
        
        # Clean up
        os.remove(image_path)
        os.remove(output_path)
        
        return {
            'success': True,
            'video_url': f"https://drive.google.com/file/d/{drive_file_id}",
            'drive_file_id': drive_file_id,
            'gpu_seconds': gpu_seconds
        }
        
    except Exception as e:
        gpu_seconds = time.time() - start_time
        print(f"❌ Base video generation failed: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'gpu_seconds': gpu_seconds
        }

def dub_video(job):
    """Dub video with audio using InfiniteTalk"""
    start_time = time.time()
    
    try:
        video_url = job['input']['video_url']
        audio_url = job['input']['audio_url']
        lip_sync_strength = job['input'].get('lip_sync_strength', 1.0)
        
        # Download files
        video_path = '/tmp/input_video.mp4'
        audio_path = '/tmp/input_audio.wav'
        
        download_file(video_url, video_path)
        download_file(audio_url, audio_path)
        
        # Run InfiniteTalk
        print("🎙️ Running InfiniteTalk lip-sync...")
        output_path = '/tmp/dubbed_video.mp4'
        
        # Example InfiniteTalk command (adjust based on actual implementation)
        import subprocess
        cmd = [
            'python', '/app/infinitetalk/inference.py',
            '--video', video_path,
            '--audio', audio_path,
            '--output', output_path,
            '--strength', str(lip_sync_strength)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        
        if result.returncode != 0:
            raise Exception(f"InfiniteTalk failed: {result.stderr}")
        
        print("✅ Video dubbed")
        
        # Upload to Drive
        drive_file_id = upload_to_drive(
            output_path,
            f"infinitetalk_{job['id']}.mp4",
            'RawFunds Media/Videos/Dubbed'
        )
        
        # Calculate GPU time
        gpu_seconds = time.time() - start_time
        
        # Clean up
        os.remove(video_path)
        os.remove(audio_path)
        os.remove(output_path)
        
        return {
            'success': True,
            'video_url': f"https://drive.google.com/file/d/{drive_file_id}",
            'drive_file_id': drive_file_id,
            'gpu_seconds': gpu_seconds
        }
        
    except Exception as e:
        gpu_seconds = time.time() - start_time
        print(f"❌ Video dubbing failed: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'gpu_seconds': gpu_seconds
        }

def handler(job):
    """Main RunPod handler for serverless endpoints"""
    print(f"📋 Processing job: {job['id']}")
    print(f"Task type: {job['input'].get('task_type')}")
    
    task_type = job['input'].get('task_type')
    
    if task_type == 'generate_base':
        return generate_base_video(job)
    elif task_type == 'dub_video':
        return dub_video(job)
    else:
        return {
            'success': False,
            'error': f'Unknown task type: {task_type}. Use "generate_base" or "dub_video"'
        }

# Start RunPod serverless worker
if __name__ == "__main__":
    print("🚀 Starting RunPod serverless worker...")
    print("✅ Supported task types: generate_base, dub_video")
    runpod.serverless.start({"handler": handler})
