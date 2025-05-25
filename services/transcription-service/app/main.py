from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Tuple, Union
import requests
import json
import logging
import os
import tempfile
import re
from faster_whisper import WhisperModel

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma:2b"

class Question(BaseModel):
    question: str
    options: List[str]
    correctAnswer: int
    explanation: str

def split_text_into_chunks(text: str, num_chunks: int = 3) -> List[str]:
    """Split text into roughly equal chunks for question generation"""
    sentences = [s.strip() for s in text.split('.') if len(s.strip()) > 10]
    chunk_size = max(1, len(sentences) // num_chunks)
    chunks = []
    
    for i in range(0, len(sentences), chunk_size):
        chunk = '. '.join(sentences[i:i + chunk_size])
        if chunk:
            chunks.append(chunk + '.')
    
    return chunks or [text]

def generate_questions(text: str, num_questions: int = 3) -> List[Dict[str, Any]]:
    """Generate questions using Ollama API"""
    text = text.strip()
    if not text:
        logger.warning("Empty text provided for question generation")
        return []
        
    # Split text into chunks and generate one question per chunk
    chunks = split_text_into_chunks(text, num_questions)
    questions = []
    
    for chunk in chunks:
        chunk_questions = _generate_questions_from_chunk(chunk, 1)  # Get 1 question per chunk
        if chunk_questions:
            questions.extend(chunk_questions)
            if len(questions) >= num_questions:
                break
    
    return questions[:num_questions]

def _generate_questions_from_chunk(text: str, num_questions: int) -> List[Dict[str, Any]]:
    """Generate questions from a single text chunk"""
    max_attempts = 2
    attempt = 0
    
    while attempt < max_attempts:
        attempt += 1
            
        # Calculate max text length based on model context and prompt size
        # Estimate prompt tokens (roughly 1 token ~= 4 chars in English)
        base_prompt = """Generate exactly {num_questions} multiple-choice questions based on the following text. Follow these rules:
1. Create questions that test understanding of key concepts
2. Each question must have exactly 4 options (A, B, C, D)
3. Only one option should be correct
4. Include a brief explanation for the correct answer
5. Make questions specific and avoid vague or general knowledge questions
6. Base questions only on the provided text

Text to generate questions from:

Example response:
[
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correctAnswer": 0,
    "explanation": "..."
  }
]"""
        
        # Estimate tokens for base prompt and response (leaving room for the response)
        estimated_prompt_tokens = len(base_prompt) // 4 + 100  # Add buffer for variations
        max_model_tokens = 4000  # Conservative estimate for smaller models
        max_text_tokens = max_model_tokens - estimated_prompt_tokens
        max_text_length = max_text_tokens * 4  # Convert back to characters
        
        # Limit text length if needed, but keep it as long as possible
        original_length = len(text)
        if original_length > max_text_length:
            logger.warning(f"Text too long ({original_length} chars), truncating to {max_text_length} chars")
            text = text[:max_text_length].strip()
            
        logger.info(f"Generating {num_questions} questions from text ({len(text)} chars, first 100: {text[:100]}...)")

        # Split text into sentences to help with question generation
        sentences = [s.strip() for s in text.split('.') if len(s.strip()) > 10]
        
        # Create a focused prompt for one question
        prompt = """Generate exactly 1 high-quality multiple-choice question based on the following text.

RULES:
1. Create 1 question that tests understanding of a key concept
2. The question MUST have exactly 4 options (A, B, C, D)
3. Only one option should be correct (correctAnswer: 0-3)
4. Include a clear, concise explanation for the correct answer
5. The question should be specific and based ONLY on the provided text
6. Make the question challenging but fair

TEXT TO USE:
"""

        # Add the text with clear separation
        prompt += f"""
{text}

FORMAT REQUIREMENTS:
- Respond with a JSON array containing exactly 1 question object
- The object MUST have these exact fields:
  - question: (string) The question text
  - options: (array) Exactly 4 answer choices as strings
  - correctAnswer: (number) Index of correct answer (0-3)
  - explanation: (string) Brief explanation of why this is correct

EXAMPLE RESPONSE:
[
  {{
    "question": "What protocol is primarily used for loading websites?",
    "options": ["FTP", "SMTP", "HTTP", "SSH"],
    "correctAnswer": 2,
    "explanation": "HTTP (Hypertext Transfer Protocol) is the standard protocol for web communication."
  }}
]

IMPORTANT:
- Generate EXACTLY 1 question
- The question must be directly answerable from the given text
- Make all options plausible but only one correct
- The response MUST be valid JSON

Now generate 1 high-quality question based on the text above:"""

        logger.info("Sending request to Ollama API...")
        logger.debug(f"Using model: {MODEL_NAME}")
        
        try:
            response = requests.post(
                OLLAMA_URL,
                json={
                    "model": MODEL_NAME,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False
                },
                timeout=60
            )
            logger.debug(f"API response status: {response.status_code}")

            if response.status_code != 200:
                logger.error(f"Ollama API error: {response.text}")
                return []

            result = response.json()
            response_text = result.get('response', '').strip()
            
            # Log the raw response for debugging
            logger.debug(f"Raw API response: {response_text[:1000]}...")
            
            if not response_text:
                logger.error("Empty response from Ollama API")
                logger.debug(f"Full response: {result}")
                return []
                
            # Try to extract JSON from common patterns if not valid JSON
            if not response_text.strip().startswith('['):
                logger.debug("Response doesn't start with JSON array, attempting to extract...")
                
                # Try to find JSON array pattern
                json_patterns = [
                    (r'\[\s*\{.*\}\s*\]', re.DOTALL),  # JSON array with objects
                    (r'\{\s*"questions?"\s*:\s*\[.*\]\s*\}', re.DOTALL),  # Wrapped in a questions object
                ]
                
                for pattern, flags in json_patterns:
                    match = re.search(pattern, response_text, flags)
                    if match:
                        response_text = match.group(0)
                        logger.debug("Extracted JSON using pattern matching")
                        break
                
                # If still no JSON array, try code block extraction
                if not response_text.strip().startswith(('{', '[')):
                    if '```json' in response_text:
                        # Handle code block format
                        start = response_text.find('```json') + 7
                        end = response_text.find('```', start)
                        if start > 6 and end > start:
                            response_text = response_text[start:end].strip()
                            logger.debug("Extracted JSON from code block with json specifier")
                    elif '```' in response_text:
                        # Handle code block without json specifier
                        start = response_text.find('```') + 3
                        end = response_text.find('```', start)
                        if start > 2 and end > start:
                            response_text = response_text[start:end].strip()
                            logger.debug("Extracted JSON from plain code block")
                
                # Try to clean up any remaining non-JSON text
                response_text = response_text.strip()
                if response_text.startswith('```'):
                    response_text = response_text[3:].strip()
                if response_text.endswith('```'):
                    response_text = response_text[:-3].strip()
                        
                logger.debug(f"Extracted response: {response_text[:500]}...")
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Request to Ollama API failed: {str(e)}")
            return []
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Ollama API response: {str(e)}")
            return []
        
        # Clean up and parse the response
        try:
            logger.debug("Attempting to parse response...")
            
            # Try to extract and parse JSON response
            try:
                # Clean the response text
                response_text = response_text.strip()
                if response_text.startswith('```'):
                    response_text = response_text[3:].strip()
                if response_text.endswith('```'):
                    response_text = response_text[:-3].strip()
                
                # Try to parse as JSON
                questions = json.loads(response_text)
                
                # Ensure we have a list
                if not isinstance(questions, list):
                    questions = [questions]
                    
                logger.debug("Successfully parsed JSON response")
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON response: {e}")
                logger.debug(f"Response text: {response_text}")
                return []
            
            # Validate and clean the question
            valid_questions = []
            for q in questions:
                if not isinstance(q, dict):
                    logger.debug("Skipping non-dict question")
                    continue
                    
                try:
                    # Ensure required fields exist
                    if not all(k in q for k in ['question', 'options', 'correctAnswer']):
                        logger.debug(f"Missing required fields in question: {q}")
                        continue
                        
                    # Clean and validate options
                    options = [str(opt).strip() for opt in q.get('options', []) if str(opt).strip()]
                    if len(options) < 2:
                        logger.debug(f"Not enough valid options in question: {q}")
                        continue
                    
                    # Validate correct answer
                    try:
                        correct_answer = int(q.get('correctAnswer', 0))
                        if not 0 <= correct_answer < len(options):
                            correct_answer = 0  # Default to first option if invalid
                    except (TypeError, ValueError):
                        correct_answer = 0
                    
                    # Clean and add the question
                    valid_questions.append({
                        'question': str(q.get('question', '')).strip() or "What is the main topic of the text?",
                        'options': options[:4],  # Take up to 4 options
                        'correctAnswer': correct_answer,
                        'explanation': str(q.get('explanation', '')).strip() or "The correct answer is derived from the provided text."
                    })
                    
                    logger.debug(f"Successfully validated question: {valid_questions[-1]['question']}")
                    return valid_questions  # Return as soon as we have one good question
                    
                except Exception as e:
                    logger.error(f"Error processing question: {e}")
                    continue
            
            logger.warning(f"Failed to generate a valid question from chunk (attempt {attempt}/{max_attempts})")
            return []
            
        except Exception as e:
            logger.error(f"Unexpected error in _generate_questions_from_chunk (attempt {attempt}/{max_attempts}): {e}")
            if attempt < max_attempts - 1:
                import time
                time.sleep(1)  # Small delay before retry
        
        return []

async def generate_mcq_with_gemma(text: str, num_questions: int = 3) -> List[Dict[str, Any]]:
    """Generate MCQs using the locally running Gemma model"""
    try:
        if not text.strip():
            logger.warning("Empty text provided for MCQ generation")
            return []
            
        # Limit text length and clean it up
        text = text[:2000].strip()
        logger.info(f"Generating {num_questions} MCQs for text (first 100 chars): {text[:100]}...")
        
        prompt = f"""Generate exactly {num_questions} multiple-choice questions based on the following text. For each question, follow these rules:
1. Create a clear, specific question
2. Provide exactly 4 possible answers (A, B, C, D)
3. Mark the correct answer with (Correct)
4. Add a brief explanation

Format each question exactly like this example:
Question: What is the capital of France?
A) London
B) Berlin
C) Paris (Correct)
D) Madrid
Explanation: Paris is the capital and most populous city of France.

Text to generate questions from:
{text}

Now generate {num_questions} questions in the exact format shown above:"""
        
        async with httpx.AsyncClient(timeout=3600.0) as client:
            logger.info("Sending request to Ollama API...")
            response = await client.post(
                OLLAMA_URL,
                json={
                    "model": MODEL_NAME,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False
                },
                timeout=3600.0  # 1 hour timeout
            )
            
            logger.info(f"Received response from Ollama API: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                response_text = result.get('response', '').strip()
                logger.debug(f"Raw response: {response_text[:500]}...")  # Log first 500 chars
                
                try:
                    # Parse the response into questions
                    questions_data = []
                    current_question = {}
                    options = []
                    
                    for line in response_text.split('\n'):
                        line = line.strip()
                        if line.startswith('Question: '):
                            if current_question:
                                questions_data.append(current_question)
                            current_question = {
                                'question': line[10:].strip(),
                                'options': [],
                                'explanation': ''
                            }
                            options = []
                        elif line and line[0].isalpha() and ') ' in line:
                            # This is an option line (A, B, C, D)
                            option_text = line[line.find(')')+1:].strip()
                            is_correct = '(Correct)' in option_text
                            option_text = option_text.replace('(Correct)', '').strip()
                            options.append(option_text)
                            if is_correct:
                                current_question['correctAnswer'] = len(options) - 1
                            if len(options) == 1:  # First option
                                current_question['options'] = []
                            if len(options) <= 4:  # Only take up to 4 options
                                current_question['options'].append(option_text)
                        elif line.startswith('Explanation:'):
                            current_question['explanation'] = line[12:].strip()
                    
                    # Add the last question if exists
                    if current_question and 'question' in current_question:
                        questions_data.append(current_question)
                    
                    if not questions_data:
                        raise ValueError("No valid questions found in the response")
                    
                    # Validate and normalize all questions
                    valid_questions = []
                    for q in questions_data:
                        if valid_question := validate_question(q):
                            valid_questions.append(valid_question)
                        
                    logger.info(f"Successfully generated {len(valid_questions)} valid questions")
                    return valid_questions[:num_questions]
                except (json.JSONDecodeError, AttributeError) as e:
                    logger.error(f"JSON parse error: {e}")
                    logger.error(f"Problematic response: {response_text[:500]}")
                
                logger.warning("Failed to parse response, returning empty questions")
                return []
                
            else:
                error_msg = f"Ollama API error: {response.status_code} - {response.text}"
                logger.error(error_msg)
                raise Exception(error_msg)
                
    except asyncio.TimeoutError:
        logger.error("MCQ generation timed out after 1 hour")
        return []
    except Exception as e:
        logger.error(f"Error in generate_mcq_with_gemma: {str(e)}", exc_info=True)
        return []

class MCQRequest(BaseModel):
    text: str
    num_questions: int = 3
    video_id: str = None

@app.post("/generate-mcq")
def generate_mcq(mcq_request: dict = Body(...)):
    """Generate multiple-choice questions from text"""
    try:
        # Extract data from request body
        text = str(mcq_request.get('text', '')).strip()
        if not text:
            raise HTTPException(status_code=400, detail="Text cannot be empty")
            
        try:
            num_questions = min(max(1, int(mcq_request.get('num_questions', 3))), 10)  # 1-10 questions
        except (TypeError, ValueError):
            num_questions = 3
            
        video_id = mcq_request.get('video_id')
        
        logger.info(f"Starting question generation for video {video_id or 'N/A'}")
        logger.debug(f"Input text length: {len(text)} characters")
        
        # Generate questions with retry logic
        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                logger.info(f"Attempt {attempt + 1}/{max_retries + 1}")
                questions = generate_questions(text, num_questions)
                logger.debug(f"Generated {len(questions)} questions")
                
                if questions:
                    logger.info(f"Successfully generated {len(questions)} questions")
                    return {"questions": questions}
                
                if attempt < max_retries:
                    wait_time = 2 ** attempt  # Exponential backoff
                    logger.info(f"No questions generated. Retrying in {wait_time} seconds... (attempt {attempt + 1}/{max_retries})")
                    import time
                    time.sleep(wait_time)
                    
            except Exception as e:
                logger.error(f"Attempt {attempt + 1} failed: {str(e)}", exc_info=True)
                if attempt == max_retries - 1:  # Last attempt
                    logger.error("All attempts failed")
                    raise HTTPException(status_code=500, detail="Failed to generate questions after multiple attempts")
                
                wait_time = 2 ** attempt  # Exponential backoff
                import time
                time.sleep(wait_time)
        
        logger.warning("Failed to generate questions after retries")
        return {"questions": []}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/transcribe")
async def transcribe_video(file: UploadFile = File(...)):
    """Transcribe video file to text"""
    try:
        # Validate file type - check common video extensions
        allowed_extensions = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'}
        file_extension = os.path.splitext(file.filename or '')[1].lower()
        
        if not file_extension or file_extension not in allowed_extensions:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type. Allowed types: {', '.join(allowed_extensions)}"
            )
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        try:
            # Transcribe using Whisper
            segments, info = model.transcribe(temp_file_path, beam_size=5)
            
            # Combine all segments into single text
            text = " ".join([segment.text for segment in segments])
            
            return {
                "text": text.strip(),
                "duration": info.duration if hasattr(info, 'duration') else 0,
                "language": info.language if hasattr(info, 'language') else 'en'
            }
            
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_file_path)
            except Exception as e:
                logger.warning(f"Failed to delete temp file: {str(e)}")
                
    except Exception as e:
        logger.error(f"Error in transcription: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)