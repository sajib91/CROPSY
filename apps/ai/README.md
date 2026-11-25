# CROPSY AI Service

FastAPI service foundation with validated settings and health endpoints only.

## Endpoints

- `GET /api/v1/health`
- `GET /api/v1/health/ready`
- `GET /docs`

## Commands

From the repository root after `npm run setup`:

```bash
npm run dev:ai
npm run start:ai
npm run test:ai
npm run build:ai
```

Python dependencies are installed into the root `.venv`. No graphs, agents, vector stores,
or other AI workflows are implemented yet.
