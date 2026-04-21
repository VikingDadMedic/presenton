# GitHub Actions Workflows

## Test All Applications (`test-all.yml`)

This workflow runs comprehensive tests for the web application:

- **FastAPI** - Python backend (Python 3.12)
- **Next.js** - Frontend lint, build, and Cypress component tests (Node.js 22)

## Testing Locally

Before pushing, you can test everything locally using the provided script:

```bash
./test-local.sh
```

This script runs the same tests that GitHub Actions will run, so you can catch issues early.

## Manual Testing

If you prefer to test individual components:

### FastAPI Tests
```bash
cd servers/fastapi
export APP_DATA_DIRECTORY=/tmp/app_data
export TEMP_DIRECTORY=/tmp/presenton
export DATABASE_URL=sqlite+aiosqlite:///./test.db
export DISABLE_ANONYMOUS_TRACKING=true
export DISABLE_IMAGE_GENERATION=true
export PYTHONPATH=$(pwd)
pytest tests/ -v
```

### Next.js Tests
```bash
cd servers/nextjs
npm run lint
npm run build
```

### Docker Build
```bash
docker build -t presenton:test -f Dockerfile .
docker images | grep presenton:test
```
