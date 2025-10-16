import fs from 'fs/promises';
import axios from 'axios';
import Resume from '../models/Resume.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Helpers extract candidate metadata from raw PDF text.
// These are heuristic and intentionally conservative to avoid noisy results.

function extractCandidateName(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const first = lines[0];
    if (first.length <= 80 && !/^email:?/i.test(first) && !/^phone:?/i.test(first)) {
      return first;
    }
  }
  const nameMatch = text.match(/(?:^|\n)\s*Name\s*:\s*(.+)/i);
  return nameMatch ? nameMatch[1].split(/\r?\n/)[0].trim() : undefined;
}

function extractEmail(text) {
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch ? emailMatch[0] : undefined;
}

function extractPhone(text) {
  const phoneMatch = text.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}/);
  return phoneMatch ? phoneMatch[0] : undefined;
}

function extractSkills(text) {
  const section = /skills?\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\w+\s*:|$)/i.exec(text);
  if (section && section[1]) {
    return section[1]
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return [];
}

// Accepts a PDF upload, extracts text, derives basic fields, and stores a Resume
export async function uploadResume(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const fileBuffer = await fs.readFile(file.path);

    // Try primary parser, then fall back to an alternate build if needed
    let pdfText = '';
    try {
      const mod = await import('pdf-parse');
      const pdfParse = mod.default || mod;
      const pdfData = await pdfParse(fileBuffer);
      pdfText = (pdfData.text || '').trim();
    } catch (primaryErr) {
      try {
        const modAlt = await import('pdf-parse-fixed');
        const pdfParseAlt = modAlt.default || modAlt;
        const pdfDataAlt = await pdfParseAlt(fileBuffer);
        pdfText = (pdfDataAlt.text || '').trim();
      } catch (fallbackErr) {
        // eslint-disable-next-line no-console
        console.error('PDF parsing failed', { primary: primaryErr?.message, fallback: fallbackErr?.message });
      }
    }

    if (!pdfText) {
      return res.status(422).json({ error: 'Unable to extract text from PDF' });
    }

    const candidateName = extractCandidateName(pdfText);
    const email = extractEmail(pdfText);
    const phone = extractPhone(pdfText);
    const skills = extractSkills(pdfText);

    const resume = new Resume({
      candidateName,
      email,
      phone,
      skills,
      pdfText,
      fileName: file.originalname
    });

    await resume.save();

    return res.status(201).json({ id: resume._id, message: 'Resume uploaded and parsed successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to process resume' });
  }
}

// Calls an external scoring endpoint to produce a matchScore and justification
export async function scoreResume(req, res) {
  try {
    const { resumeId, jobDescription } = req.body || {};

    if (!resumeId || !jobDescription || typeof jobDescription !== 'string' || !jobDescription.trim()) {
      return res.status(400).json({ error: 'resumeId and jobDescription are required' });
    }

    const resume = await Resume.findById(resumeId);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const resumeText = resume.pdfText || '';
    if (!resumeText) {
      return res.status(400).json({ error: 'Resume has no extracted text to score' });
    }

    const endpoint = process.env.LLM_ENDPOINT;
    let score, justification;
    let source = 'unknown';

    // Primary path: Google Gemini AI scoring
    const googleApiKey = process.env.GOOGLE_API_KEY;
    // eslint-disable-next-line no-console
    console.log('Scoring attempt - Gemini API Key available:', !!googleApiKey);
    
    if (googleApiKey && (score == null || justification == null)) {
      try {
        // eslint-disable-next-line no-console
        console.log('Attempting Gemini AI scoring...');
        const genAI = new GoogleGenerativeAI(googleApiKey);
        
        // Use the stable Gemini 2.5 Flash model
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        // eslint-disable-next-line no-console
        console.log('Using Gemini model: gemini-2.5-flash');
        
        const systemPrompt = `You are an experienced professional recruiter with expertise across all industries - technical, non-technical, creative, business, healthcare, finance, education, and more. Your goal is to intelligently match candidates to roles using semantic understanding and contextual analysis.

UNIVERSAL RECRUITING APPROACH:
- Analyze the job requirements and identify core competencies needed
- Match candidate experience, skills, and achievements to role demands
- Use semantic understanding - recognize transferable skills and relevant experience
- Consider industry context (technical vs non-technical, senior vs junior, etc.)
- Focus on practical ability to perform job duties regardless of industry
- Value both hard skills (technical, certifications) and soft skills (leadership, communication)
- Assess cultural fit, growth potential, and adaptability

SCORING FRAMEWORK:
- 90-95: Exceptional match - exceeds requirements with proven track record
- 80-89: Excellent fit - meets all key requirements with strong relevant experience
- 70-79: Good candidate - meets most requirements, minor gaps that can be filled
- 60-69: Adequate match - basic requirements met, some development needed
- 50-59: Weak fit - significant gaps in key requirements
- Below 50: Poor match for this specific role

Approach each evaluation with the mindset of a seasoned recruiter who understands diverse industries and can identify genuine talent and potential.`;
        
        const scoringPrompt = `${systemPrompt}

Perform a comprehensive evaluation of this candidate against the job requirements using intelligent matching and semantic understanding.

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

EVALUATION PROCESS:
1. ANALYZE THE ROLE: What industry is this? What are the core requirements? What type of experience matters most?

2. ASSESS CANDIDATE MATCH:
   - Core Skills & Competencies: Do they have the essential abilities for this role?
   - Relevant Experience: How does their background translate to this position?
   - Industry Knowledge: Do they understand the domain/sector?
   - Transferable Skills: What skills from other areas apply here?
   - Educational Background: How relevant is their academic/certification background?
   - Leadership & Soft Skills: Communication, teamwork, problem-solving abilities
   - Growth Trajectory: Career progression and learning capability

3. CONTEXTUAL UNDERSTANDING:
   - Consider the seniority level required vs candidate's experience level
   - Recognize equivalent experience from different industries
   - Value diverse backgrounds that bring fresh perspectives
   - Assess cultural and role-specific fit

4. SEMANTIC MATCHING:
   - Look beyond exact keyword matches
   - Understand skill synonyms and related competencies
   - Recognize relevant experience even if differently labeled
   - Consider the full context of their achievements

Provide a holistic assessment that any hiring manager would find valuable, regardless of industry.

Return your response in JSON format:
{
  "score": <score from 0-100 based on comprehensive role fit>,
  "justification": "<detailed analysis covering skills match, experience relevance, potential, and overall fit for this specific role>"
}`;
        
        const result = await model.generateContent(scoringPrompt);
        const response = await result.response;
        const text = response.text();
        
        // eslint-disable-next-line no-console
        console.log('Gemini raw response:', text.substring(0, 200) + '...');
        
        // Parse JSON response
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsedResponse = JSON.parse(jsonMatch[0]);
            if (typeof parsedResponse.score === 'number' && typeof parsedResponse.justification === 'string') {
              score = parsedResponse.score;
              justification = parsedResponse.justification;
              source = 'gemini';
              // eslint-disable-next-line no-console
              console.log('Gemini AI scoring successful:', { score, source });
            }
          }
        } catch (parseErr) {
          // eslint-disable-next-line no-console
          console.warn('Failed to parse Gemini response JSON:', parseErr?.message);
        }
      } catch (geminiErr) {
        // eslint-disable-next-line no-console
        console.error('Gemini AI scoring failed:', {
          message: geminiErr?.message,
          status: geminiErr?.status,
          error: geminiErr
        });
        // eslint-disable-next-line no-console
        console.log('Falling back to enhanced heuristic scoring');
      }
    }

    // Secondary path: external endpoint if configured
    if ((score == null || justification == null) && endpoint) {
      try {
        const response = await axios.post(endpoint, { resumeText, jobDescription }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
        ({ score, justification } = response?.data || {});
        if (typeof score === 'number' && typeof justification === 'string') {
          source = 'endpoint';
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('External LLM endpoint failed, falling back', e?.message || e);
      }
    }

    // Final fallback: enhanced intelligent heuristic scoring
    if (score == null || justification == null) {
      const jd = (jobDescription || '').toLowerCase();
      const resumeLower = (resumeText || '').toLowerCase();
      
      // Universal skill and competency categories for all industries
      const skillCategories = {
        // Technical Skills
        programming: ['java', 'python', 'javascript', 'typescript', 'c++', 'c#', 'programming', 'coding', 'development', 'software'],
        web_development: ['react', 'angular', 'vue', 'html', 'css', 'javascript', 'frontend', 'backend', 'web', 'api'],
        data_analytics: ['data', 'analytics', 'sql', 'python', 'excel', 'tableau', 'powerbi', 'statistics', 'analysis'],
        cloud_tech: ['aws', 'azure', 'cloud', 'docker', 'kubernetes', 'devops'],
        
        // Business Skills
        management: ['management', 'leadership', 'team lead', 'supervisor', 'manager', 'director', 'head'],
        sales_marketing: ['sales', 'marketing', 'business development', 'customer', 'crm', 'lead generation'],
        finance_accounting: ['finance', 'accounting', 'budgeting', 'financial analysis', 'bookkeeping', 'audit'],
        operations: ['operations', 'process improvement', 'logistics', 'supply chain', 'project management'],
        
        // Communication & Soft Skills
        communication: ['communication', 'presentation', 'writing', 'public speaking', 'interpersonal'],
        project_management: ['project management', 'agile', 'scrum', 'planning', 'coordination'],
        
        // Industry-Specific
        healthcare: ['healthcare', 'medical', 'patient care', 'clinical', 'nursing', 'doctor'],
        education: ['teaching', 'education', 'training', 'curriculum', 'instruction', 'academic'],
        legal: ['legal', 'law', 'compliance', 'regulatory', 'contracts', 'litigation'],
        creative: ['design', 'creative', 'graphic design', 'content', 'branding', 'marketing'],
        engineering: ['engineering', 'mechanical', 'electrical', 'civil', 'technical'],
        research: ['research', 'analysis', 'investigation', 'methodology', 'publication']
      };
      
      const experienceLevels = {
        senior: ['senior', 'lead', 'principal', 'architect', 'staff'],
        management: ['manager', 'director', 'head', 'vp', 'cto'],
        experience: ['years', 'experience', 'expertise', 'proficient', 'expert']
      };
      
      // Analyze skill matches by category
      const skillAnalysis = {};
      let totalSkillScore = 0;
      let skillDetails = [];
      
      for (const [category, skills] of Object.entries(skillCategories)) {
        const jdSkills = skills.filter(skill => jd.includes(skill));
        const resumeSkills = skills.filter(skill => resumeLower.includes(skill));
        const matches = jdSkills.filter(skill => resumeSkills.includes(skill));
        
        if (jdSkills.length > 0) {
          const categoryScore = (matches.length / jdSkills.length) * 100;
          skillAnalysis[category] = {
            required: jdSkills,
            found: matches,
            score: categoryScore
          };
          totalSkillScore += categoryScore;
          
          if (matches.length > 0) {
            skillDetails.push(`${category}: ${matches.length}/${jdSkills.length} skills matched (${matches.join(', ')})`);
          }
        }
      }
      
      // Experience level analysis
      const expAnalysis = [];
      let experienceScore = 0;
      
      // Extract years of experience
      const yearsMatch = resumeText.match(/(\d+)\+?\s*years?\s*(of\s*)?(experience|exp)/gi);
      const jdYearsMatch = jobDescription.match(/(\d+)\+?\s*years?/gi);
      
      if (yearsMatch && jdYearsMatch) {
        const resumeYears = Math.max(...yearsMatch.map(match => parseInt(match.match(/\d+/)[0])));
        const requiredYears = Math.max(...jdYearsMatch.map(match => parseInt(match.match(/\d+/)[0])));
        
        if (resumeYears >= requiredYears) {
          experienceScore += 20;
          expAnalysis.push(`Experience requirement met: ${resumeYears} years (required: ${requiredYears})`);
        } else {
          experienceScore += 10;
          expAnalysis.push(`Experience gap: ${resumeYears} years (required: ${requiredYears})`);
        }
      }
      
      // Seniority level analysis
      const seniorityMatches = [];
      for (const [level, keywords] of Object.entries(experienceLevels)) {
        const jdKeywords = keywords.filter(kw => jd.includes(kw));
        const resumeKeywords = keywords.filter(kw => resumeLower.includes(kw));
        const matches = jdKeywords.filter(kw => resumeKeywords.includes(kw));
        
        if (matches.length > 0) {
          seniorityMatches.push(`${level} level indicators: ${matches.join(', ')}`);
          experienceScore += 5;
        }
      }
      
      // Education and certifications
      const qualifications = [];
      let qualificationScore = 0;
      
      const educationKeywords = ['bachelor', 'master', 'phd', 'degree', 'university', 'college', 'bs', 'ms', 'mba'];
      const certificationKeywords = ['certified', 'certification', 'certificate', 'aws certified', 'google certified', 'microsoft certified'];
      
      const eduMatches = educationKeywords.filter(edu => resumeLower.includes(edu));
      const certMatches = certificationKeywords.filter(cert => resumeLower.includes(cert));
      
      if (eduMatches.length > 0) {
        qualifications.push(`Education: ${eduMatches[0]} degree identified`);
        qualificationScore += 5;
      }
      
      if (certMatches.length > 0) {
        qualifications.push(`Certifications: Professional certifications found`);
        qualificationScore += 5;
      }
      
      // Project and portfolio indicators
      const portfolioKeywords = ['project', 'portfolio', 'github', 'developed', 'built', 'created', 'implemented'];
      const portfolioMatches = portfolioKeywords.filter(kw => resumeLower.includes(kw));
      
      if (portfolioMatches.length >= 3) {
        qualifications.push('Strong project portfolio demonstrated');
        qualificationScore += 5;
      }
      
      // Calculate final score with improved weighting
      const avgSkillScore = Object.keys(skillAnalysis).length > 0 ? totalSkillScore / Object.keys(skillAnalysis).length : 0;
      
      // Bonus scoring for comprehensive skill coverage
      let coverageBonus = 0;
      const skillCategoriesFound = Object.keys(skillAnalysis).length;
      if (skillCategoriesFound >= 4) coverageBonus += 10; // Multiple skill areas
      if (skillCategoriesFound >= 6) coverageBonus += 5;  // Very comprehensive
      
      // Education bonus for exact degree match
      let educationBonus = 0;
      if (resumeLower.includes('b.tech') || resumeLower.includes('bachelor')) {
        if (resumeLower.includes('computer science') || resumeLower.includes('information technology')) {
          educationBonus += 10; // Perfect education match
        }
      }
      
      // Internship/experience relevance bonus
      let relevanceBonus = 0;
      if (resumeLower.includes('software engineer') || resumeLower.includes('developer') || resumeLower.includes('intern')) {
        relevanceBonus += 10;
      }
      
      // Calculate base score
      const baseScore = (avgSkillScore * 0.5) + (experienceScore * 0.2) + (qualificationScore * 0.1);
      
      // Apply bonuses
      score = Math.min(Math.round(baseScore + coverageBonus + educationBonus + relevanceBonus), 100);
      
      // Generate detailed justification
      const analysisDetails = [];
      
      // Skills analysis
      if (skillDetails.length > 0) {
        analysisDetails.push(`**Technical Skills Analysis:**\n${skillDetails.map(detail => `• ${detail}`).join('\n')}`);
      }
      
      // Experience analysis
      if (expAnalysis.length > 0 || seniorityMatches.length > 0) {
        const expDetails = [...expAnalysis, ...seniorityMatches];
        analysisDetails.push(`**Experience Assessment:**\n${expDetails.map(detail => `• ${detail}`).join('\n')}`);
      }
      
      // Qualifications analysis
      if (qualifications.length > 0) {
        analysisDetails.push(`**Qualifications:**\n${qualifications.map(qual => `• ${qual}`).join('\n')}`);
      }
      
      // Bonus analysis
      const bonuses = [];
      if (coverageBonus > 0) bonuses.push(`Skill diversity bonus: +${coverageBonus} points`);
      if (educationBonus > 0) bonuses.push(`Perfect education match: +${educationBonus} points`);
      if (relevanceBonus > 0) bonuses.push(`Relevant experience: +${relevanceBonus} points`);
      
      if (bonuses.length > 0) {
        analysisDetails.push(`**Additional Strengths:**\n${bonuses.map(bonus => `• ${bonus}`).join('\n')}`);
      }
      
      // Universal assessment framework for all industries
      let overallAssessment = '';
      if (score >= 85) {
        overallAssessment = 'Outstanding candidate with exceptional qualifications and strong alignment with role requirements. Highly recommended.';
      } else if (score >= 75) {
        overallAssessment = 'Excellent candidate with strong relevant experience and skills that match well with the position.';
      } else if (score >= 65) {
        overallAssessment = 'Good candidate with solid qualifications and most requirements met. Shows strong potential for success.';
      } else if (score >= 55) {
        overallAssessment = 'Adequate candidate with basic requirements met. Some development areas identified but good foundation.';
      } else if (score >= 40) {
        overallAssessment = 'Moderate fit with some relevant experience but significant gaps in key requirements.';
      } else {
        overallAssessment = 'Limited alignment with role requirements. Major skill and experience gaps identified.';
      }
      
      analysisDetails.push(`**Overall Assessment:**\n${overallAssessment}`);
      
      justification = analysisDetails.join('\n\n');
      source = 'enhanced-analysis';
    }

    if (typeof score !== 'number' || score < 0 || score > 100 || typeof justification !== 'string') {
      return res.status(502).json({ error: 'Invalid response from scoring service' });
    }

    resume.matchScore = score;
    resume.justification = `${justification}${source ? ` (source: ${source})` : ''}`;
    await resume.save();

    return res.status(200).json(resume);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to score resume' });
  }
}

// List all resumes sorted by score (desc) and recency
export async function getAllResumes(_req, res) {
  try {
    const items = await Resume.find({}).sort({ matchScore: -1, createdAt: -1 });
    return res.status(200).json(items);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch resumes' });
  }
}

// Fetch a single resume by ID
export async function getResumeById(req, res) {
  try {
    const { id } = req.params;
    const item = await Resume.findById(id);
    if (!item) return res.status(404).json({ error: 'Resume not found' });
    return res.status(200).json(item);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch resume' });
  }
}

// Return resumes above a threshold (>= 70)
export async function getShortlisted(_req, res) {
  try {
    const items = await Resume.find({ matchScore: { $gte: 70 } }).sort({ matchScore: -1, createdAt: -1 });
    return res.status(200).json(items);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch shortlisted resumes' });
  }
}

// Delete a resume by ID (and optionally remove associated file when stored)
export async function deleteResume(req, res) {
  try {
    const { id } = req.params;
    const item = await Resume.findById(id);
    if (!item) return res.status(404).json({ error: 'Resume not found' });

    // Attempt to remove associated PDF if stored name is recoverable
    // We stored only original fileName earlier; if you later add stored filename, delete here.
    // Keeping deletion best-effort so API remains robust.

    await item.deleteOne();
    return res.status(200).json({ message: 'Resume deleted' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete resume' });
  }
}


