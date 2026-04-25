# Sandbox Snapshot Runbook

Operational reference for the Daytona snapshot that powers user sandboxes.

## What

Every Xerus user sandbox is spawned from a single Daytona snapshot named
`xerus-sandbox` (image: `mcr.microsoft.com/devcontainers/python:3.14`). The
snapshot lives on the sandbox VPS at `91.98.23.64:3000`.

| Field | Value |
|-------|-------|
| Name | `xerus-sandbox` |
| Snapshot ID | `91c3dc6b-2935-49e3-924f-463f8bf2a13c` |
| Sandbox VPS | `91.98.23.64` (xerus-sandbox-1, CX43) |
| Daytona API | `http://localhost:3000/api` (private to VPS, behind UFW) |
| API key env | `DAYTONA_API_KEY` (Daytona Bearer token) |

## Why it can break

Daytona has an **idle GC**. If no sandbox is created from the snapshot for
~14 days, Daytona evicts the image from runner caches and flips the snapshot
state from `active` to `inactive`. The next `POST /api/sandbox` call fails
with `Failed to create sandbox: Snapshot xerus-sandbox is inactive`.

`lastUsedAt` only updates when a sandbox is *created*. Reading the snapshot
or activating it does not refresh the GC clock.

## Defenses (in order of activation)

1. **In-process self-heal** — `DaytonaProvider.create()` catches the inactive
   error, calls `ensureSnapshotActive`, polls until active, and retries the
   create once. Users never see the failure (worst case: ~30-60s extra
   latency on the first sandbox after a long idle period).
2. **Weekly warm-keep cron** — `src/jobs/snapshot-warm-keep.ts` runs every
   Monday at 04:00 UTC. Calls `ensureSnapshotActive` so the snapshot is
   reactivated *before* a real user request hits the inactive state.
3. **This runbook** — manual recovery if both layers fail.

## Manual recovery (last resort)

If a user reports `Snapshot xerus-sandbox is inactive` and the in-process
self-heal isn't working (e.g. backend is down for an unrelated reason):

```bash
# 1. SSH to the sandbox VPS (Daytona API is not exposed publicly)
ssh -i ~/.ssh/xerus root@91.98.23.64

# 2. Check current state
API="dtn_696ee9bc26f89ff3e514aeccb610ed5231158824bf19af1df6d44409f33440bc"
SID="91c3dc6b-2935-49e3-924f-463f8bf2a13c"
curl -s -H "Authorization: Bearer $API" \
  http://localhost:3000/api/snapshots/$SID | python3 -m json.tool

# 3. Activate
curl -X POST -H "Authorization: Bearer $API" \
  http://localhost:3000/api/snapshots/$SID/activate

# 4. Poll until state == "active" (usually 5-30s)
for i in $(seq 1 20); do
  STATE=$(curl -s -H "Authorization: Bearer $API" \
    http://localhost:3000/api/snapshots/$SID \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['state'])")
  echo "$i: $STATE"
  [ "$STATE" = "active" ] && break
  sleep 3
done
```

The shorthand for this is `/ship sandbox` from the project root — it executes
steps 1-4 with the right credentials.

## Diagnosing related issues

| Symptom | Likely cause | Where to look |
|---------|--------------|---------------|
| `Snapshot xerus-sandbox is inactive` | Idle GC (14d no creates) | This runbook |
| `Snapshot xerus-sandbox is in error state` | Image registry unreachable, runner OOM | `errorReason` on the snapshot, runner logs |
| `Snapshot xerus-sandbox is pending` for >2 min | Image pull stalled | Runner disk space, registry on the VPS |
| `No active runners` / runner registration drops | Runner container crashed | `docker compose ps` on `91.98.23.64` |

## Related code

- `xerus_backend/src/domains/sandbox-infra/sandbox/providers/daytona.provider.ts` — provider with self-heal
- `xerus_backend/src/jobs/snapshot-warm-keep.ts` — weekly cron
- `xerus_backend/src/domains/sandbox-infra/sandbox/sandbox.config.ts` — snapshot name config
