# Sample Test Data

This directory contains sample data for testing and demonstrating TalentTrace functionality.

## Files

### job-descriptions.json
Contains 5 sample job descriptions covering different roles:
- Senior Full-Stack Developer
- Frontend React Developer  
- Backend Node.js Engineer
- Data Scientist
- DevOps Engineer

### sample-resumes.json
Contains 5 sample resume texts with expected matching levels:
- **John Smith**: Senior Full-Stack Developer (Expected: High match for full-stack roles)
- **Sarah Johnson**: Frontend React Specialist (Expected: High match for frontend roles)
- **Michael Chen**: Backend Node.js Engineer (Expected: High match for backend roles)
- **Emily Davis**: Junior Developer (Expected: Low-medium match for senior roles)
- **Dr. Lisa Wong**: Data Scientist (Expected: High match for data science roles)

## Usage for Testing

### Manual Testing via Web UI
1. Start the application: `npm run dev`
2. Go to http://localhost:5000/public/
3. Create text files from the resume content in `sample-resumes.json`
4. Save as PDF files and upload through the UI
5. Use job descriptions from `job-descriptions.json` to score resumes

### API Testing
```bash
# Example: Score John Smith's resume against Senior Full-Stack Developer role
curl -X POST http://localhost:5000/api/score-resume \
  -H "Content-Type: application/json" \
  -d '{
    "resumeId": "<resume_id_from_upload>",
    "jobDescription": "Senior Full-Stack Developer - 5+ Years Experience..."
  }'
```

### Expected Results
- John Smith vs Senior Full-Stack Developer: Score 85-95
- Sarah Johnson vs Frontend React Developer: Score 80-90
- Michael Chen vs Backend Node.js Engineer: Score 85-95
- Emily Davis vs Senior Full-Stack Developer: Score 25-45
- Dr. Lisa Wong vs Data Scientist: Score 90-98

## Demo Video Scenarios

Use these combinations to showcase the application:

1. **High Match**: Upload John Smith's resume, score against Senior Full-Stack job
2. **Perfect Match**: Upload Michael Chen's resume, score against Backend Node.js job  
3. **Skill Mismatch**: Upload Emily Davis's resume, score against Senior Full-Stack job
4. **Different Domain**: Upload Dr. Lisa Wong's resume, score against Data Scientist job

This demonstrates the AI's ability to accurately assess candidate-job fit across different scenarios.