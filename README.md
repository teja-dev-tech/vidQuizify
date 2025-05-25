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
## Demo
![image](https://github.com/user-attachments/assets/e94fb249-b711-4e0f-8ae3-050f01453906)

![image](https://github.com/user-attachments/assets/98b4cd4f-4ae8-4848-862f-9a7f9ec08aab)

![image](https://github.com/user-attachments/assets/74d3be24-fd64-40bb-9192-4c4f67e9a7a4)

![image](https://github.com/user-attachments/assets/fda95be6-e96e-4765-a8f0-5cb418b984cf)


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
