# Stage 1: Build Frontend
FROM node:18-alpine as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Serve with Python
FROM python:3.11-slim
WORKDIR /app

# Install git (required for cloning repos)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Setup Backend
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# Ensure repo_data exists
RUN mkdir -p repo_data

# Copy built frontend assets
# Note: app.py expects '../frontend/dist' relative to backend dir
# So we copy to /app/frontend/dist
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Environment settings
ENV PORT=5001
ENV HOST=0.0.0.0
# Disable Flask Debug in production by default
ENV FLASK_DEBUG=false 

EXPOSE 5001

# Run the application
CMD ["python", "app.py"]
