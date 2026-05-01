# Recap Cron Recipes

Use these recipes to schedule lifecycle recap generation outside the app runtime.

TripStory does **not** include a built-in scheduler for recap mode. Use cron, GitHub Actions, or your orchestration platform to call the recap endpoint.

---

## Endpoint

- `POST /api/v1/ppt/presentation/recap`
- Modes:
  - `welcome_home`
  - `anniversary`
  - `next_planning_window`

---

## Example: Generate Anniversary Recap

```bash
curl -X POST "https://your-host/api/v1/ppt/presentation/recap" \
  -H "Content-Type: application/json" \
  -H "Cookie: presenton_session=<session-cookie>" \
  -d '{
    "mode": "anniversary",
    "source_presentation_id": "d3000f96-096c-4768-b67b-e99aed029b57"
  }'
```

Response shape:

```json
{
  "presentation_id": "7f746a16-7902-45ce-aa2c-1f94ad1798d5",
  "path": "/app_data/exports/Trip_Anniversary_Recap.pptx",
  "edit_path": "/presentation?id=7f746a16-7902-45ce-aa2c-1f94ad1798d5",
  "mode": "anniversary",
  "source_presentation_id": "d3000f96-096c-4768-b67b-e99aed029b57"
}
```

---

## Monthly Cron Example (Linux)

Run on the first day of each month at 09:00:

```cron
0 9 1 * * /usr/bin/curl -sS -X POST "https://your-host/api/v1/ppt/presentation/recap" \
  -H "Content-Type: application/json" \
  -H "Cookie: presenton_session=${PRESENTON_SESSION}" \
  -d '{"mode":"next_planning_window","source_presentation_id":"d3000f96-096c-4768-b67b-e99aed029b57"}'
```

---

## GitHub Actions Example

```yaml
name: tripstory-recap-cron

on:
  schedule:
    - cron: "0 13 * * 1"
  workflow_dispatch:

jobs:
  trigger-recap:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger welcome-home recap
        run: |
          curl -sS -X POST "${{ secrets.TRIPSTORY_BASE_URL }}/api/v1/ppt/presentation/recap" \
            -H "Content-Type: application/json" \
            -H "Cookie: presenton_session=${{ secrets.TRIPSTORY_SESSION_COOKIE }}" \
            -d '{"mode":"welcome_home","source_presentation_id":"${{ secrets.TRIP_SOURCE_PRESENTATION_ID }}"}'
```

---

## Operational Notes

- Recap mode reuses the standard generation pipeline and export engine.
- If you need non-default output format or aspect ratio, call recap first, then call `/api/v1/ppt/presentation/export` with `export_options`.
- Keep source presentation IDs in your CRM/job config so campaign automation can map to the correct client trip.
