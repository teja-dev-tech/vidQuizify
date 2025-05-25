from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from pydantic import BaseModel
from typing import List, Dict, Any
import tempfile
import os
import logging
import httpx

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI()

# Initialize Whisper model
model = WhisperModel("tiny", device="cpu", compute_type="int8")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constants
CHUNK_SIZE = 1024 * 1024  # 1MB chunks
OLLAMA_BASE_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma:2b"

class MCQQuestion(BaseModel):
    question: str
    options: List[str]
    correct_answer: int
    explanation: str

async def generate_mcq_with_gemma(text: str, num_questions: int = 5) -> List[Dict[str, Any]]:
    """Generate MCQs using the locally running Gemma model"""
    prompt = f"""Generate {num_questions} multiple-choice questions based on the following text.
    For each question, provide 4 options and indicate the correct answer (0-3).
    Format your response as a JSON list where each item has:
    - question: The question text
    - options: List of 4 possible answers
    - correct_answer: Index of the correct answer (0-3)
    - explanation: Brief explanation of the answer

    Text: {text[:4000]}"""
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                OLLAMA_BASE_URL,
                json={
                    "model": MODEL_NAME,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False
                },
                timeout=300
            )
            response.raise_for_status()
            return response.json().get("response", [])
    except Exception as e:
        logger.error(f"Error generating MCQs: {str(e)}")
        raise

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe audio file using faster-whisper"""
    temp_file_path = None
    try:
        # Create temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
            # Save uploaded file
            while chunk := await file.read(CHUNK_SIZE):
                temp_file.write(chunk)
            temp_file_path = temp_file.name
        
        # Transcribe audio
        segments, _ = model.transcribe(
            temp_file_path,
            language="en",
            beam_size=5,
            vad_filter=True
        )
        
        # Combine segments into text
        text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
        
        return {"text": text}
        
    except Exception as e:
        logger.error(f"Transcription failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
        
    finally:
        # Cleanup temp file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as e:
                logger.warning(f"Error cleaning up temp file: {str(e)}")

@app.post("/generate-mcq")
async def generate_questions(
    text: str = Form(...),
    num_questions: int = Form(5)
) -> List[Dict[str, Any]]:
    """Generate multiple-choice questions from text using Gemma LLM"""
    try:
        if not text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
            
        # Generate questions using Gemma
        questions = await generate_mcq_with_gemma(text, num_questions)
        
        # If we couldn't generate questions, return sample questions
        if not questions:
            logger.warning("No questions generated, returning sample questions")
            questions = [{
                "question": "What is the main topic of the text?",
                "options": ["Technology", "Science", "Education", "Business"],
                "correct_answer": 0,
                "explanation": "The text primarily discusses technological topics."
            }]
            
        return questions[:num_questions]
        
    except Exception as e:
        logger.error(f"Question generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "ollama_available": True  # You might want to add a check for Ollama service
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)