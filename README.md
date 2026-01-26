# Zuul Visualizer

A web-based tool to visualize Zuul CI/CD job graphs, dependencies, and configurations. It supports loading repositories dynamically and features an AI-powered assistant to answer questions about jobs.

## Features
- **Interactive Graph**: Visualize job dependencies with React Flow.
- **Job Details**: Inspect job variables, parents, and playbooks.
- **Repository Management**: Load new git repositories on the fly.
- **Descendant Highlighting**: Highlight all downstream jobs of a selection.
- **Theme Support**: Customize node colors and styles.
- **AI Assistant**: Chat with an AI context-aware of your job definitions (requires Gemini API Key).

## Running Locally

### Prerequisites
- Node.js 18+
- Python 3.11+
- Git

### Steps

1. **Backend**:
   ```bash
   cd backend
   pip install -r requirements.txt
   python app.py
   ```
   Backend runs on `http://localhost:5001`.

2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Frontend runs on `http://localhost:5173`.

## Container Deployment

This application includes a `Containerfile` for building a single container image that serves both the frontend and backend.

### Building the Image

```bash
# Using Podman
podman build -t zuul-visualizer .

# Using Docker
docker build -t zuul-visualizer .
```

### Running the Container

Run the container exposing port 5001.

```bash
podman run -d -p 5001:5001 \
  -e GEMINI_API_KEY="your-api-key" \
  --name zuul-viz localhost/zuul-visualizer
```

> **Note**: You must run the **Build** step above before running this command. If you see an error like `repository localhost/zuul-visualizer not found`, it means the image has not been built yet.

### Using Custom Sources

You can override the default repository sources using the `SOURCES` environment variable (comma-separated):

```bash
podman run -d -p 5001:5001 \
  -e SOURCES="https://github.com/zuul/zuul,https://github.com/ansible/ansible" \
  --name zuul-viz localhost/zuul-visualizer
```

Access the application at `http://localhost:5001`.

### Environment Variables

The container can be configured using the following environment variables. These override values in `config.yaml`.

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port the server listens on | `5001` |
| `HOST` | Interface to bind to | `0.0.0.0` |
| `GEMINI_API_KEY` | Google Gemini API Key for AI features | *None* |
| `ENABLE_AI` | Enable/Disable AI features | `false` (if no key) |
| `SOURCES` | Comma-separated list of initial git repo URLs | *From config.yaml* |
| `CLONE_DIR` | Directory to clone repos into (inside container) | `repo_data` |
| `DOC_UPDATE_INTERVAL` | Interval in seconds for repo updates | `86400` |
| `FLASK_DEBUG` | Enable Flask debug mode | `false` |

### Volumes

To persist cloned repositories between restarts, mount the `repo_data` directory:

```bash
podman run -d -p 5001:5001 \
  -v zuul-data:/app/backend/repo_data \
  zuul-visualizer
```

### VPN / Corporate Network Access

If you are behind a VPN (e.g., trying to access an internal GitLab instance), the container might not be able to resolve the internal domain or route traffic through the VPN tunnel.

To fix this, run the container with `--network host`:

```bash
podman run -d --network host \
  -e SOURCES="https://gitlab.internal.example.com/project" \
  --name zuul-viz localhost/zuul-visualizer
```

**Note for macOS Users**: `--network host` on macOS typically does **not** expose ports to `localhost` due to the way the VM works. If you use this, you cannot access `http://localhost:5001`.
Instead, prefer using `-p 5001:5001`. If you have VPN issues with `-p`, ensure your Podman/Docker VM is restarted *after* connecting to the VPN, or try user-mode networking.

#### Manual Clone Helper

If you cannot get the container to clone repositories due to VPN/DNS issues (common on macOS + VPN), you can clone the repositories on your host machine using the provided helper script. This ensures the directory structure matches what the app expects.

1. **Clone on Host**:
   ```bash
   python3 scripts/manual_clone.py https://gitlab.internal.example.com/project
   ```

2. **Mount in Container**:
   ```bash
   podman run -d -p 5001:5001 \
     -v $(pwd)/backend/repo_data:/app/backend/repo_data \
     -e SOURCES="https://gitlab.internal.example.com/project" \
     --name zuul-viz localhost/zuul-visualizer
   ```

## Running Tests

### Backend
1. Install test dependencies:
   ```bash
   pip install -r backend/test-requirements.txt
   ```
2. Run tests:
   ```bash
   cd backend
   pytest
   ```

### Frontend
1. Install dependencies (if not done):
   ```bash
   cd frontend
   npm install
   ```
2. Run tests:
   ```bash
   npm test
   ```
