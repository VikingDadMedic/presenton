# Presenton Azure Deployment Reference

This document describes the current Azure deployment, how resources are connected, and how to redeploy after code changes.

---

## Current Azure Resources

All resources are in the `presenton-rg` resource group, `eastus` region, under the "VSAI Azure Sponsorship" subscription.

| Resource | Azure Service | Name | Key Details |
|----------|--------------|------|-------------|
| Container Registry | ACR (Basic) | `presentonacr` | Login: `presentonacr.azurecr.io`, admin enabled |
| App Service Plan | Linux B2 | `presenton-plan` | 2 vCPU, 3.5 GB RAM |
| Web App | App Service for Containers | `presenton-app` | URL: `https://presenton-app.azurewebsites.net` |
| Storage Account | Standard LRS | `presentonstore` | Hosts the Azure Files share |
| File Share | Azure Files | `presenton-data` | 5 GB quota, mounted at `/app_data` in container |

---

## How Everything Connects

```mermaid
flowchart TD
    Internet["Internet\nhttps://presenton-app.azurewebsites.net"]
    
    subgraph azure [Azure - presenton-rg - eastus]
        AppService["App Service (B2)\npresenton-app\nPort 80"]
        ACR["Container Registry\npresentonacr.azurecr.io\nImage: presenton:latest"]
        FileShare["Azure Files\npresentonstore/presenton-data\nMounted at /app_data"]
    end
    
    subgraph container [Inside the Container]
        Nginx["Nginx :80"]
        FastAPI["FastAPI :8000"]
        NextJS["Next.js :3000"]
        Ollama["Ollama :11434"]
        StartJS["start.js\n(process manager)"]
    end
    
    Internet --> AppService
    ACR -->|"image pull"| AppService
    AppService --> container
    FileShare -->|"SMB mount"| container
    StartJS --> Nginx
    StartJS --> FastAPI
    StartJS --> NextJS
    StartJS --> Ollama
    Nginx -->|"/"| NextJS
    Nginx -->|"/api/v1/"| FastAPI
    Nginx -->|"/health"| FastAPI
    Nginx -->|"/static/"| FileSystem["Static files"]
```

### Container Internal Architecture

When App Service starts the container, `node /app/start.js` runs. It:

1. Creates `/app_data/userConfig.json` from environment variables (if it doesn't exist)
2. Starts Nginx (port 80) -- the external-facing reverse proxy
3. Starts FastAPI via uvicorn (port 8000) -- the backend API
4. Starts Next.js via `npm run start` (port 3000) -- the frontend
5. Starts Ollama (port 11434) -- local model server (idle in cloud deployments)
6. Waits until any of FastAPI, Next.js, or Ollama exits, then exits itself

Nginx routes:
- `/` -> Next.js (port 3000)
- `/api/v1/*` -> FastAPI (port 8000)
- `/health` -> FastAPI (port 8000)
- `/static/*` -> filesystem (icon SVGs)
- `/app_data/*` -> filesystem (images, exports, uploads, fonts)

### Persistent Storage

The Azure Files share is mounted at `/app_data` inside the container. This persists:
- `userConfig.json` (LLM provider settings)
- `presenton.db` (SQLite database -- presentations, slides, assets)
- `images/` (generated/fetched images)
- `exports/` (PPTX/PDF files)
- `uploads/` (user-uploaded documents)
- `fonts/` (custom fonts)

Data survives container restarts and redeployments.

---

## Environment Variables

Set via `az webapp config appsettings`. These are injected as env vars into the container.

### Required

| Variable | Current Value | Purpose |
|----------|--------------|---------|
| `WEBSITES_PORT` | `80` | Tells App Service which port the container listens on |
| `MIGRATE_DATABASE_ON_STARTUP` | `true` | Auto-creates/migrates DB tables on boot |
| `CAN_CHANGE_KEYS` | `true` | Allows users to modify API keys via the settings UI |
| `LLM` | `openai` | Active LLM provider |
| `OPENAI_API_KEY` | (set) | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4.1` | Model ID |
| `IMAGE_PROVIDER` | `pexels` | Image generation/search provider |
| `PEXELS_API_KEY` | (set) | Pexels API key |

### Enricher API Keys

| Variable | Used By |
|----------|---------|
| `TAVILY_API_KEY` | Destination Intel, Deals enrichers |
| `SERPAPI_API_KEY` | Hotels, Flights, Activities, Dining, Events, Reviews, Videos |
| `VISUAL_CROSSING_API_KEY` | Weather enricher |
| `UNSPLASH_ACCESS_KEY` | Images enricher |
| `GOOGLE_MAPS_API_KEY` | Maps enricher |
| `FIRECRAWL_API_KEY` | Deals enricher (scraping) |

### System

| Variable | Value | Purpose |
|----------|-------|---------|
| `WEBSITES_CONTAINER_START_TIME_LIMIT` | `180` | Seconds before App Service kills slow-starting container |
| `DISABLE_ANONYMOUS_TRACKING` | `true` | Disables Mixpanel telemetry |

### Updating Environment Variables

```bash
az webapp config appsettings set \
  --resource-group presenton-rg \
  --name presenton-app \
  --settings KEY=value KEY2=value2
```

Changes take effect on next container restart.

---

## Redeployment After Code Changes

### Quick Reference (copy-paste)

```bash
# 1. Build on ACR (builds AMD64 remotely -- required for Apple Silicon devs)
cd /path/to/presenton
az acr build --registry presentonacr --image presenton:latest --file Dockerfile .

# 2. Restart the web app to pull the new image
az webapp restart --name presenton-app --resource-group presenton-rg

# 3. Tail logs to verify startup
az webapp log tail --name presenton-app --resource-group presenton-rg
```

### Step-by-Step Explanation

**Step 1: Build the image**

The `az acr build` command uploads your entire source tree (~656 MB) to ACR, builds the Dockerfile on Azure's AMD64 build agents, and pushes the result to `presentonacr.azurecr.io/presenton:latest`. This takes 8-12 minutes.

Why ACR build instead of local Docker build:
- Your Mac is ARM64 (Apple Silicon); App Service runs AMD64
- `az acr build` builds natively on AMD64, no cross-compilation emulation
- Alternatively, you can use `docker buildx build --platform linux/amd64` locally, but it's slower due to QEMU emulation

**Step 2: Restart the web app**

App Service caches the previous image. `az webapp restart` forces it to pull `presenton:latest` again. The first pull for a changed image takes 1-3 minutes (only changed layers are downloaded). Full cold pull from scratch takes ~20 minutes.

**Step 3: Verify**

```bash
# Health check
curl -s https://presenton-app.azurewebsites.net/health

# Check enricher status
curl -s https://presenton-app.azurewebsites.net/api/v1/ppt/enrichers/status | python3 -m json.tool

# Tail container logs
az webapp log tail --name presenton-app --resource-group presenton-rg
```

Look for `Application startup complete.` in the logs and `{"status":"ok"}` from the health check.

### If the Container Fails to Start

```bash
# Check Docker pull/startup logs
TOKEN=$(az account get-access-token --query accessToken -o tsv)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://presenton-app.scm.azurewebsites.net/api/vfs/LogFiles/" | \
  python3 -c "import sys,json; [print(f['name']) for f in json.load(sys.stdin) if 'docker' in f['name']]"

# Read the docker log
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://presenton-app.scm.azurewebsites.net/api/vfs/LogFiles/<filename>" | tail -30
```

Common failure causes:
- **Image pull error**: Check `DOCKER_REGISTRY_SERVER_URL`, `_USERNAME`, `_PASSWORD`
- **502 Bad Gateway**: Nginx is up but FastAPI hasn't started yet -- wait 60-90 seconds
- **503 Application Error**: Container crashed or timed out. Check the docker log for Python/Node errors
- **Startup timeout**: Increase `WEBSITES_CONTAINER_START_TIME_LIMIT` if the image is cold (first pull)

### Force a Clean Redeploy

```bash
# Stop, then start (clears the running container entirely)
az webapp stop --name presenton-app --resource-group presenton-rg
sleep 5
az webapp start --name presenton-app --resource-group presenton-rg
```

---

## Scaling and Cost

### Current Setup

| Resource | SKU | Monthly Cost (approx) |
|----------|-----|----------------------|
| App Service Plan (B2) | 2 vCPU, 3.5 GB RAM | ~$40 |
| ACR (Basic) | 10 GB storage | ~$5 |
| Storage Account (Standard LRS) | 5 GB share | ~$1 |
| **Total** | | **~$46/month** |

### Scaling Up

If the B2 plan is too small (Chromium + LibreOffice + FastAPI + Next.js consume ~2 GB RAM):

```bash
# Upgrade to P1v2 (2 vCPU, 8 GB RAM, ~$80/mo)
az appservice plan update --name presenton-plan --resource-group presenton-rg --sku P1v2
```

### Scaling Out (Multiple Instances)

Not recommended with SQLite on Azure Files (no concurrent write safety). If you need multiple instances, switch to Azure Database for PostgreSQL first:

```bash
az webapp config appsettings set \
  --resource-group presenton-rg \
  --name presenton-app \
  --settings DATABASE_URL="postgresql://user:pass@host:5432/presenton"
```

The app's `services/database.py` already supports PostgreSQL via `DATABASE_URL`.

---

## Teardown

To delete everything and stop all billing:

```bash
az group delete --name presenton-rg --yes --no-wait
```

This deletes the resource group and all resources inside it (ACR, App Service, Storage Account, everything).

---

## CI/CD (Optional)

### ACR Task (Auto-Build on Git Push)

```bash
az acr task create \
  --registry presentonacr \
  --name build-presenton \
  --image presenton:latest \
  --context https://github.com/presenton/presenton.git \
  --file Dockerfile \
  --git-access-token <github-pat>
```

### Webhook (Auto-Restart on Image Push)

App Service can auto-restart when a new image is pushed to ACR:

```bash
az webapp deployment container config \
  --resource-group presenton-rg \
  --name presenton-app \
  --enable-cd true
```

This creates a webhook in ACR that triggers an App Service restart on every `presenton:latest` push.

---

## Key Gotchas

1. **Apple Silicon -> AMD64**: Always use `az acr build` or `docker buildx --platform linux/amd64`. A native ARM build will fail to start on App Service.

2. **Image name must include registry prefix**: The image name in App Service config must be `presentonacr.azurecr.io/presenton:latest`, not just `presenton:latest`. Without the prefix, App Service tries Docker Hub.

3. **First cold pull is ~20 minutes**: The image is ~3 GB (Chromium, LibreOffice, docling/PyTorch). Subsequent pulls reuse cached layers and take 1-3 minutes.

4. **Container startup takes 60-90 seconds**: After the image is pulled, `start.js` boots 4 processes (Nginx, FastAPI, Next.js, Ollama). The health check at `/health` won't respond until FastAPI is up.

5. **SQLite on Azure Files**: Works for single-instance deployments but is slower than local disk. Write-heavy operations (many concurrent presentations) may bottleneck. Use PostgreSQL for production multi-instance.

6. **Ollama wastes ~100 MB RAM**: It auto-starts inside the container even if you're using OpenAI. For a leaner cloud image, remove the `RUN curl -fsSL https://ollama.com/install.sh | sh` line from the Dockerfile.

7. **Port 1455 (Codex OAuth)**: Not exposed on App Service. Codex/ChatGPT sign-in requires a direct callback to `localhost:1455`, which doesn't work in cloud deployments.

8. **Environment changes need restart**: `az webapp config appsettings set` updates the config but the running container keeps old values until restarted.
