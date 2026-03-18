# Noir Factory API Testing Guide

Quick reference for testing the multi-tenant backend endpoints.

## Prerequisites

1. Supabase credentials in `.env`:
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY
   - SUPABASE_ANON_KEY

2. Start the server:
   ```bash
   npm start
   ```

3. Have a valid JWT token from Supabase authentication

## Health Check

```bash
curl http://localhost:8080/healthz
```

Expected response:
```json
{
  "ok": true,
  "service": "noir-factory-backend",
  "timestamp": "2026-03-18T...",
  "uptime": 1.234,
  "node": "v18.0.0"
}
```

## Authentication Endpoints

### Get Current User

```bash
curl -X GET http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

Expected response:
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "companies": [
      {
        "id": "company-uuid",
        "name": "Company Name",
        "slug": "company-slug"
      }
    ]
  }
}
```

### OAuth Callback (After Google SSO)

```bash
curl -X POST http://localhost:8080/api/auth/callback \
  -H "Content-Type: application/json" \
  -d '{
    "session": {
      "access_token": "<JWT_TOKEN>",
      "user": {
        "id": "user-uuid",
        "email": "user@example.com"
      }
    }
  }'
```

This creates a user_companies entry on first login.

## Company Endpoints

### List User's Companies

```bash
curl -X GET http://localhost:8080/api/companies \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Get Company Details

```bash
curl -X GET http://localhost:8080/api/companies/<COMPANY_ID> \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Create Company

```bash
curl -X POST http://localhost:8080/api/companies \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Company",
    "slug": "new-company"
  }'
```

### Update Company

```bash
curl -X PUT http://localhost:8080/api/companies/<COMPANY_ID> \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Company Name"
  }'
```

## RSS Feeds Endpoints

**Required headers for all requests:**
- `Authorization: Bearer <JWT_TOKEN>`
- `X-Company-ID: <COMPANY_ID>`

### List Feeds

```bash
curl -X GET http://localhost:8080/api/feeds \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

### Create Feed

```bash
curl -X POST http://localhost:8080/api/feeds \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Reddit Tech News",
    "url": "https://reddit.com/r/technology/rss",
    "type": "rss"
  }'
```

### Update Feed

```bash
curl -X PUT http://localhost:8080/api/feeds/<FEED_ID> \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Feed Name"
  }'
```

### Delete Feed (Soft Delete)

```bash
curl -X DELETE http://localhost:8080/api/feeds/<FEED_ID> \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

### Trigger Feed Check

```bash
curl -X POST http://localhost:8080/api/feeds/<FEED_ID>/check \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

## Content Items Endpoints

### List Content Items

```bash
# List all items
curl -X GET http://localhost:8080/api/content-items \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"

# Filter by status
curl -X GET "http://localhost:8080/api/content-items?status=pending" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"

# Pagination
curl -X GET "http://localhost:8080/api/content-items?limit=10&offset=0" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"

# Combine filters
curl -X GET "http://localhost:8080/api/content-items?status=pending&feed_id=<FEED_ID>&limit=20&offset=0" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

### Get Content Item

```bash
curl -X GET http://localhost:8080/api/content-items/<ITEM_ID> \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

### Approve Content Item

```bash
curl -X POST http://localhost:8080/api/content-items/<ITEM_ID>/approve \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "screenshot",
    "target_platforms": ["twitter", "instagram"]
  }'
```

### Reject Content Item

```bash
curl -X POST http://localhost:8080/api/content-items/<ITEM_ID>/reject \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Inappropriate content"
  }'
```

### Batch Approve Items

```bash
curl -X POST http://localhost:8080/api/content-items/batch-approve \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "item_ids": ["id1", "id2", "id3"],
    "job_type": "screenshot",
    "target_platforms": ["twitter"]
  }'
```

## Engagement Endpoints

### Get Bot Configs

```bash
curl -X GET http://localhost:8080/api/engagement/config \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

### Update Bot Config

```bash
curl -X PUT http://localhost:8080/api/engagement/config \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "twitter",
    "enabled": true,
    "settings": {
      "auto_like": true,
      "like_threshold": 0.7
    }
  }'
```

### List Engagement Templates

```bash
curl -X GET http://localhost:8080/api/engagement/templates \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

### Create Engagement Template

```bash
curl -X POST http://localhost:8080/api/engagement/templates \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Positive Comment",
    "content": "Great post! Love this perspective.",
    "type": "comment"
  }'
```

### Update Template

```bash
curl -X PUT http://localhost:8080/api/engagement/templates/<TEMPLATE_ID> \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Template Name",
    "content": "Updated content"
  }'
```

### Delete Template (Soft Delete)

```bash
curl -X DELETE http://localhost:8080/api/engagement/templates/<TEMPLATE_ID> \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

### Get Engagement Log

```bash
curl -X GET "http://localhost:8080/api/engagement/log?limit=50&offset=0" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

### Get Engagement Stats

```bash
curl -X GET http://localhost:8080/api/engagement/stats \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

## Testing Multi-Tenant Isolation

### Verify Cross-Company Access Denied (403)

```bash
# Use token from User A
# Try to access Company B (not assigned to User A)
curl -X GET http://localhost:8080/api/feeds \
  -H "Authorization: Bearer <USER_A_JWT>" \
  -H "X-Company-ID: <COMPANY_B_ID>"

# Expected: 403 Forbidden
```

## Service-to-Service Authentication

For server-to-server requests, use X-Service-Key header:

```bash
curl -X GET http://localhost:8080/api/feeds \
  -H "X-Service-Key: <SUPABASE_SERVICE_KEY>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

## Debugging Tips

1. **Check JWT token**:
   ```bash
   # Decode JWT (install jq first)
   echo "<JWT_TOKEN>" | cut -d. -f2 | base64 -d | jq .
   ```

2. **Check server logs**:
   ```bash
   # Server logs authentication and request details
   npm start
   # Look for "Decoding token", "User authenticated", "Company verified", etc.
   ```

3. **Verify Supabase connection**:
   ```bash
   curl http://localhost:8080/healthz | jq .
   ```

4. **Missing headers error**:
   - All company-scoped endpoints require `X-Company-ID` header
   - All authenticated endpoints require `Authorization: Bearer <token>` header

5. **401 Unauthorized**:
   - JWT token is missing or invalid
   - Check token expiration in Supabase dashboard

6. **403 Forbidden**:
   - User doesn't have access to the specified company
   - Check user_companies table in Supabase

## Common Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | Deleted (soft delete) |
| 400 | Bad Request (invalid data) |
| 401 | Unauthorized (missing/invalid JWT) |
| 403 | Forbidden (no access to company) |
| 404 | Not Found |
| 500 | Server Error |

