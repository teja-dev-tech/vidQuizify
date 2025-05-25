# Video Transcription Service

This is a FastAPI-based service that provides video/audio transcription using OpenAI's Whisper model and question generation capabilities.

## Features

- Transcribe audio/video files to text using Whisper
- Generate quiz questions from transcribed text
- RESTful API endpoints for easy integration
- CORS enabled for cross-origin requests

## Prerequisites

- Python 3.8+
- FFmpeg (required by Whisper)
- Port 8000 available (or configure a different port)

## Installation

1. Clone the repository
2. Navigate to the service directory:
   ```
   cd services/transcription-service
   ```
3. Create a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```
4. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

## Video Quizify - Transcription Service

A FastAPI service for transcribing audio/video files and generating quiz questions from the content using Whisper and language models.

## Features

- Audio/Video transcription using Whisper
- Multiple-choice question generation
- Multi-language support
- Fast and efficient processing
- Configurable model parameters
- Automatic retry logic for reliability

## Quick Start

### Prerequisites

- Python 3.8+
- FFmpeg (for audio processing)
- Ollama server running locally (for question generation)

### Installation

1. Clone the repository and navigate to the service directory:
   ```bash
   git clone https://github.com/teja-dev-tech/vidQuizify.git
   cd vidQuizify/services/transcription-service
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Set up environment variables (create a `.env` file):
   ```env
   # API Configuration
   PORT=8000
   HOST=0.0.0.0
   
   # Whisper Model Configuration
   WHISPER_MODEL=base  # Options: tiny, base, small, medium, large
   
   # Ollama Configuration
   OLLAMA_URL=http://localhost:11434/api/generate
   OLLAMA_MODEL=gemma:2b  # Or your preferred model
   ```

5. Start the service:
   ```bash
   uvicorn app.main:app --reload --port 8000 --host 0.0.0.0
   ```

   The service will be available at `http://localhost:8000`

## API Documentation

### 1. Health Check

```
GET /
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

### 2. Transcribe Audio/Video

```
POST /transcribe
```

**Form Data:**
- `file` (required): Audio/Video file to transcribe
- `language` (optional, default: "en"): Language code (e.g., "en", "es", "fr")
- `task` (optional, default: "transcribe"): "transcribe" or "translate"

**Example Request:**
```bash
curl -X POST "http://localhost:8000/transcribe" \
     -H "accept: application/json" \
     -F "file=@/path/to/your/video.mp4" \
     -F "language=en"
```

**Successful Response (200 OK):**
```json
{
  "text": "Transcribed text here...",
  "language": "en",
  "duration": 125.5
}
```

### 3. Generate Multiple-Choice Questions

```
POST /generate-mcq
```

**Request Body:**
```json
{
  "text": "The text to generate questions from...",
  "num_questions": 3,
  "video_id": "optional_video_id"
}
```

**Parameters:**
- `text` (required): The text content to generate questions from
- `num_questions` (optional, default: 3): Number of questions to generate (1-10)
- `video_id` (optional): Identifier for tracking related questions

**Example Request:**
```bash
curl -X POST "http://localhost:8000/generate-mcq" \
     -H "Content-Type: application/json" \
     -d '{"text": "Your text here...", "num_questions": 3}'
```

**Successful Response (200 OK):**
```json
{
  "questions": [
    {
      "question": "What protocol is primarily used for loading websites?",
      "options": [
        "FTP",
        "SMTP",
        "HTTP",
        "SSH"
      ],
      "correctAnswer": 2,
      "explanation": "HTTP (Hypertext Transfer Protocol) is the standard protocol for web communication."
    },
    ...
  ]
}
```

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- `400 Bad Request`: Invalid input parameters
- `422 Unprocessable Entity`: Validation error
- `500 Internal Server Error`: Server-side error
- `503 Service Unavailable`: Ollama service not available

## Development

### Running Tests

```bash
pytest tests/
```

### Linting

```bash
flake8 app/
```

### Environment Setup

1. Install pre-commit hooks:
   ```bash
   pre-commit install
   ```

2. The following pre-commit hooks are configured:
   - Black code formatting
   - Flake8 linting
   - isort import sorting

## Deployment

### Docker

Build the Docker image:
```bash
docker build -t vidquizify/transcription-service .
```

Run the container:
```bash
docker run -p 8000:8000 --env-file .env vidquizify/transcription-service
```

### Kubernetes

Example deployment configuration:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: transcription-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: transcription-service
  template:
    metadata:
      labels:
        app: transcription-service
    spec:
      containers:
      - name: transcription-service
        image: vidquizify/transcription-service:latest
        ports:
        - containerPort: 8000
        envFrom:
        - configMapRef:
            name: transcription-service-config
---
apiVersion: v1
kind: Service
metadata:
  name: transcription-service
spec:
  selector:
    app: transcription-service
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8000
  type: ClusterIP
```

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Running the Service

1. Activate the virtual environment:
   ```
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```
2. Start the service:
   ```
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
3. The service will be available at `http://localhost:8000`
4. Access the API documentation at `http://localhost:8000/docs`

## API Endpoints

### Transcribe Audio/Video

```
POST /transcribe
```

**Parameters:**
- `file`: The audio/video file to transcribe
- `language` (optional): Language code (default: "en")
- `task` (optional): "transcribe" or "translate" (default: "transcribe")

### Generate Questions

```
POST /generate-questions
```

**Request Body:**
```json
{
  "text": "The text to generate questions from",
  "num_questions": 5,
  "difficulty": "medium"
}
```

## Environment Variables

Create a `.env` file in the project root with the following variables:

```
# API Configuration
PORT=8000
HOST=0.0.0.0

# Whisper Model Configuration
WHISPER_MODEL=base  # or tiny, small, medium, large
```

## Development

### Running Tests

```
pytest
```

### Code Formatting

```
black .
```

### Linting

```
flake8 .
```

## License

MIT
