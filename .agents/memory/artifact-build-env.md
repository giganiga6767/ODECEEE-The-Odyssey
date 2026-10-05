---
name: Artifact build environments
description: Required environment when building individual Vite artifacts from the shell.
---

Set `PORT` and the artifact’s own `BASE_PATH` when running a Vite build directly in the shell. Managed workflows inject these values; the root recursive build does not provide different values for each artifact.

**Why:** An unset `PORT` or `BASE_PATH` makes a shell build fail while loading Vite configuration, before the target artifact is built.

**How to apply:** For targeted shell builds, use the port and preview path from that artifact’s configuration. Build the API package separately; it does not use the Vite environment.
