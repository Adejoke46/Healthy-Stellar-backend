# Graceful Shutdown

## Behaviour

The API server (`src/main.ts`) calls `app.enableShutdownHooks()`. On `SIGTERM` or `SIGINT`, Nest closes the HTTP server and then runs the lifecycle hooks of every provider that implements `onModuleDestroy`, `beforeApplicationShutdown` or `onApplicationShutdown`. This releases Redis locks, closes the read-replica pool, flushes the subscription rate limiter and similar cleanup, instead of letting the process be killed mid-request.

The worker (`src/worker.ts`) handles `SIGTERM`/`SIGINT` itself and calls `app.close()`.

## Termination grace period

The orchestrator must wait long enough for in-flight requests and hooks to finish before it sends `SIGKILL`.

- Kubernetes: set `terminationGracePeriodSeconds: 30` on the API and worker pod specs (this is the Kubernetes default; raise it if requests routinely run longer than 30 seconds).
- Docker Compose: set `stop_grace_period: 30s` on the `api` and `worker` services. Docker's default is 10 seconds, which is too short for the drain.

If the grace period is shorter than the drain time, the process receives `SIGKILL`, the hooks are skipped and locks fall back to their TTL, which is the failure this setting prevents.

## Verifying

1. Start the API locally and send a slow request.
2. Run `kill -TERM <pid>` while the request is in flight.
3. The log should show the shutdown hooks running and the in-flight request completing before the process exits.
