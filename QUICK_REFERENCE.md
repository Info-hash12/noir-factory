# Noir Factory Multi-Tenant Backend - Quick Reference

## Start the Server

```bash
cd /sessions/focused-zealous-carson/mnt/noir-factory-2

# Install dependencies (if not already done)
npm install

# Start server
npm start

# Or with auto-reload during development
npm run dev
```

Server runs on http://localhost:8080

## Health Check

```bash
curl http://localhost:8080/healthz
```

## Key Files

| File | Purpose | Lines |
|------|---------|-------|
| src/middleware/auth.js | JWT verification | 120 |
| src/middleware/companyContext.js | Company scoping | 90 |
| src/routes/auth.js | Authentication endpoints | 130 |
| src/routes/companies.js | Company management | 140 |
| src/routes/feeds.js | RSS feeds | 210 |
| src/routes/content-items.js | Content workflow | 290 |
| src/routes/engagement.js | Bot configuration | 340 |
| src/server.js | Main server file | 316 |
| src/db/supabase.js | Database config | 110 |

## Environment Setup

Create `.env` file with:
```bash
SUPABASE_URL=https://your-instance.supabase.co
SUPABASE_SERVICE_KEY=<from-supabase-dashboard>
SUPABASE_ANON_KEY=<from-supabase-dashboard>
```

## Authentication Flow

1. User authenticates with Google SSO via Supabase
2. Receives JWT access token
3. Includes in requests: `Authorization: Bearer <token>`
4. Server decodes JWT and loads user companies
5. User can access only assigned companies

## Company Scoping

All company-scoped endpoints require:
```bash
Authorization: Bearer <JWT_TOKEN>
X-Company-ID: <company-uuid>
```

Example:
```bash
curl -X GET http://localhost:8080/api/feeds \
  -H "Authorization: Bearer eyJ0eXAi..." \
  -H "X-Company-ID: 550e8400-e29b-41d4-a716-446655440000"
```

## Endpoint Categories

### Authentication (/api/auth)
- POST /callback - OAuth callback
- GET /me - Current user
- POST /switch-company - Verify company

### Companies (/api/companies)
- GET / - List companies
- GET /:id - Get company
- POST / - Create company
- PUT /:id - Update company

### RSS Feeds (/api/feeds)
- GET / - List feeds
- POST / - Create feed
- PUT /:id - Update feed
- DELETE /:id - Delete feed
- POST /:id/check - Trigger check

### Content Items (/api/content-items)
- GET / - List items (paginated)
- GET /:id - Get item
- POST /:id/approve - Approve item
- POST /:id/reject - Reject item
- POST /batch-approve - Batch approve

### Engagement (/api/engagement)
- GET /config - Bot configs
- PUT /config - Update config
- GET /templates - List templates
- POST /templates - Create template
- PUT /templates/:id - Update template
- DELETE /templates/:id - Delete template
- GET /log - Activity log (paginated)
- GET /stats - Summary stats

## Common Requests

### List feeds for a company
```bash
curl -X GET http://localhost:8080/api/feeds \
  -H "Authorization: Bearer <JWT>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

### Create a new feed
```bash
curl -X POST http://localhost:8080/api/feeds \
  -H "Authorization: Bearer <JWT>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Feed Name",
    "url": "https://example.com/rss",
    "type": "rss"
  }'
```

### Approve content item
```bash
curl -X POST http://localhost:8080/api/content-items/<ID>/approve \
  -H "Authorization: Bearer <JWT>" \
  -H "X-Company-ID: <COMPANY_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "screenshot",
    "target_platforms": ["twitter"]
  }'
```

## Debugging

### Check if server is running
```bash
curl http://localhost:8080/healthz | jq .
```

### View logs
```bash
# Server logs everything to console
npm start
# Look for: "User authenticated", "Company verified", errors, etc.
```

### Test authentication
```bash
# Decode JWT to verify user_id and companies
echo "<JWT>" | cut -d. -f2 | base64 -d | jq .
```

### Service-to-service requests
```bash
# No JWT needed, use service key instead
curl -X GET http://localhost:8080/api/feeds \
  -H "X-Service-Key: <SUPABASE_SERVICE_KEY>" \
  -H "X-Company-ID: <COMPANY_ID>"
```

## Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 200 | OK | Success |
| 201 | Created | Object created |
| 400 | Bad Request | Check request body |
| 401 | Unauthorized | Add valid JWT token |
| 403 | Forbidden | User lacks access to company |
| 404 | Not Found | Resource doesn't exist |
| 500 | Server Error | Check server logs |

## Common Issues

### 401 Unauthorized
- Missing `Authorization` header
- Invalid or expired JWT token
- Check token in Supabase dashboard

### 403 Forbidden
- User not assigned to company
- Check user_companies table
- Try different company_id

### Missing X-Company-ID
- Required for all company-scoped endpoints
- Add header: `X-Company-ID: <uuid>`
- Or use query param: `?company_id=<uuid>`

### Database connection errors
- Check SUPABASE_SERVICE_KEY in .env
- Verify SUPABASE_URL is correct
- Test connection: `curl http://localhost:8080/healthz`

## Documentation Files

| File | Purpose |
|------|---------|
| IMPLEMENTATION_SUMMARY.md | Overview of entire implementation |
| MULTI_TENANT_BACKEND.md | Detailed architecture & design |
| DEPLOYMENT_STATUS.md | Build verification & deployment checklist |
| API_TESTING_GUIDE.md | Detailed endpoint examples |
| BUILD_CHECKLIST.md | Task completion verification |
| QUICK_REFERENCE.md | This file |

## Production Deployment

1. **Staging first**
   ```bash
   # Test with staging credentials
   SUPABASE_SERVICE_KEY=staging_key npm start
   ```

2. **Verify health**
   ```bash
   curl https://staging-backend.com/healthz
   ```

3. **Test a few endpoints**
   ```bash
   # With test JWT token
   curl -H "Authorization: Bearer <TEST_JWT>" \
        -H "X-Company-ID: <TEST_COMPANY>" \
        https://staging-backend.com/api/feeds
   ```

4. **Monitor logs**
   - Check for authentication failures
   - Monitor response times
   - Watch error rates

5. **Deploy to production**
   - Use production Supabase credentials
   - Deploy to Cloud Run or your platform
   - Verify health check passes
   - Monitor initial traffic

## Performance Tips

- Pagination limits prevent memory issues
- JWT decode is fast (no DB call)
- Company verification is single DB lookup
- Use batch endpoints for multiple operations
- Enable monitoring/APM in production

## Next Steps

1. Add Supabase credentials to .env
2. Test health endpoint
3. Test authentication flow
4. Create test company and user
5. Test all endpoint categories
6. Deploy to staging
7. Run integration tests
8. Deploy to production

---

For detailed information, see IMPLEMENTATION_SUMMARY.md or MULTI_TENANT_BACKEND.md
