#!/bin/bash

# Function to kill child processes on script exit
trap 'kill $(jobs -p)' EXIT

# Start Backend
echo "Starting Backend..."
cd backend
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Warning: venv not found in backend/. Assuming python is available or virtualenv is active."
fi

# Run python app (using specific python if venv exists, else defaults)
if [ -f "venv/bin/python" ]; then
    venv/bin/python app.py &
else
    python3 app.py &
fi
BACKEND_PID=$!
cd ..

# Start Frontend
echo "Starting Frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "Services started."
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop both services."

# Wait for process to finish (or user interrupt)
wait
