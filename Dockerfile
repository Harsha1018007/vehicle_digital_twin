FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for CAN support
RUN apt-get update && apt-get install -y \
    can-utils \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

EXPOSE 8000 8501

CMD ["uvicorn", "dashboard.api:app", "--host", "0.0.0.0", "--port", "8000"]
