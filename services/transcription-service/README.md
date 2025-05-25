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
