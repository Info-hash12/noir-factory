#!/bin/bash

# Cloud Run Environment Variable Checker
# Verifies that all required environment variables are set for Noir Factory

set -e

echo "🔍 Checking Cloud Run environment variables for noir-factory..."
echo ""

# Check if service exists
if ! gcloud run services describe noir-factory --region=us-south1 &>/dev/null; then
  echo "❌ Service 'noir-factory' not found in us-south1"
  echo "Run: gcloud run deploy noir-factory --source . --region=us-south1"
  exit 1
fi

echo "✅ Service 'noir-factory' found"
echo ""

# Get current environment variables
echo "📋 Current environment variables:"
ENV_VARS=$(gcloud run services describe noir-factory --region=us-south1 --format="json" | jq -r '.spec.template.spec.containers[0].env[]? | "\(.name)=\(.value // "<not set>")"' 2>/dev/null || echo "")

if [ -z "$ENV_VARS" ]; then
  echo "⚠️  No environment variables set"
else
  echo "$ENV_VARS" | while read line; do
    VAR_NAME=$(echo "$line" | cut -d'=' -f1)
    VAR_VALUE=$(echo "$line" | cut -d'=' -f2-)
    
    # Mask sensitive values
    if [[ $VAR_NAME == *"KEY"* ]] || [[ $VAR_NAME == *"SECRET"* ]] || [[ $VAR_NAME == *"TOKEN"* ]]; then
      echo "  $VAR_NAME=${VAR_VALUE:0:10}...***"
    else
      echo "  $VAR_NAME=$VAR_VALUE"
    fi
  done
fi

echo ""
echo "🔍 Checking required environment variables:"

# Define required variables
REQUIRED_VARS=(
  "SUPABASE_URL"
  "SUPABASE_KEY"
  "RUNPOD_API_KEY"
  "RUNPOD_WORKER_URL"
  "SCREENSHOTONE_ACCESS_KEY"
  "SCREENSHOTONE_SECRET_KEY"
  "OPENROUTER_API_KEY"
)

MISSING_VARS=()

for VAR in "${REQUIRED_VARS[@]}"; do
  if echo "$ENV_VARS" | grep -q "^$VAR="; then
    VALUE=$(echo "$ENV_VARS" | grep "^$VAR=" | cut -d'=' -f2-)
    if [ "$VALUE" = "<not set>" ] || [ -z "$VALUE" ]; then
      echo "  ❌ $VAR is NOT set"
      MISSING_VARS+=("$VAR")
    else
      echo "  ✅ $VAR is set"
    fi
  else
    echo "  ❌ $VAR is NOT set"
    MISSING_VARS+=("$VAR")
  fi
done

echo ""

# Check optional variables
OPTIONAL_VARS=(
  "SHOTSTACK_API_KEY"
  "METRICOOL_API_KEY"
  "TTS_SERVICE_URL"
)

echo "📝 Optional environment variables:"
for VAR in "${OPTIONAL_VARS[@]}"; do
  if echo "$ENV_VARS" | grep -q "^$VAR="; then
    echo "  ✅ $VAR is set"
  else
    echo "  ⚠️  $VAR not set (service may have limited functionality)"
  fi
done

echo ""

# Show deployment status
echo "📊 Deployment status:"
STATUS=$(gcloud run services describe noir-factory --region=us-south1 --format="value(status.conditions[0].status)")
MESSAGE=$(gcloud run services describe noir-factory --region=us-south1 --format="value(status.conditions[0].message)")
REVISION=$(gcloud run services describe noir-factory --region=us-south1 --format="value(status.latestReadyRevisionName)")

echo "  Status: $STATUS"
echo "  Message: $MESSAGE"
echo "  Latest Revision: $REVISION"

echo ""

# If there are missing variables, provide instructions
if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "⚠️  Missing ${#MISSING_VARS[@]} required environment variable(s)"
  echo ""
  echo "To set environment variables, run:"
  echo ""
  echo "gcloud run services update noir-factory --region=us-south1 \\"
  
  for VAR in "${MISSING_VARS[@]}"; do
    echo "  --update-env-vars=\"$VAR=<your-$VAR-here>\" \\"
  done
  echo ""
  
  echo "Or use Secret Manager (recommended):"
  echo ""
  echo "# Create secrets"
  for VAR in "${MISSING_VARS[@]}"; do
    echo "echo -n '<your-value>' | gcloud secrets create $VAR --data-file=-"
  done
  echo ""
  echo "# Update Cloud Run to use secrets"
  echo "gcloud run services update noir-factory --region=us-south1 \\"
  for VAR in "${MISSING_VARS[@]}"; do
    echo "  --update-secrets=\"$VAR=$VAR:latest\" \\"
  done
  echo ""
  
  exit 1
else
  echo "✅ All required environment variables are set!"
  echo ""
  echo "🌐 Service URL:"
  SERVICE_URL=$(gcloud run services describe noir-factory --region=us-south1 --format="value(status.url)")
  echo "  $SERVICE_URL"
  echo ""
  echo "🧪 Test the service:"
  echo "  curl $SERVICE_URL/api/health"
  echo ""
fi
