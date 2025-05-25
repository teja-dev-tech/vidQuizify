# Video Quizify

An intelligent platform that generates interactive quizzes from video content using AI-powered transcription and question generation.

## 🚀 Features

- **Video Processing**: Upload and process video content
- **AI-Powered Transcription**: Convert speech to text with high accuracy
- **Smart Quiz Generation**: Automatically create multiple-choice questions from video content
- **Interactive Quizzes**: Engage users with automatically generated quizzes
- **Multi-language Support**: Support for multiple languages in transcription and question generation
- **Scalable Architecture**: Microservices-based architecture for reliability and scalability

## 🏗️ Project Structure

```
vidQuizify/
├── frontend/           # React-based web interface
├── server/             # Main backend service (NestJS)
└── services/
    └── transcription-service/  # Audio processing and question generation
```

## 🛠️ Prerequisites

- Node.js 16+
- Python 3.8+
- Docker (optional, for containerized deployment)
- FFmpeg (for audio processing)
- Ollama (for question generation)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/teja-dev-tech/vidQuizify.git
cd vidQuizify
```

### 2. Set Up Services

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

#### Backend Server

```bash
cd server
npm install
npm run start:dev
```

#### Transcription Service

```bash
cd services/transcription-service
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 3. Configure Environment

Create `.env` files in each service directory with appropriate configuration. See individual service READMEs for details.

## 🌐 API Documentation

Once services are running, access the API documentation at:
- Backend API: http://localhost:3000/api
- Transcription Service: http://localhost:8000/docs

## 🐳 Docker Deployment

```bash
# Build and start all services
docker-compose up --build

# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Whisper for speech recognition
- Ollama for language model capabilities
- All open-source libraries and frameworks used in this project
