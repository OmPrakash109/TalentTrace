const API_URL = '/api';

const el = {
  uploadForm: document.getElementById('upload-form'),
  uploadFile: document.getElementById('file'),
  uploadResult: document.getElementById('upload-result'),
  scoreBtn: document.getElementById('score-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  jobDesc: document.getElementById('job-desc'),
  resumeSelect: document.getElementById('resume-select'),
  scoreResult: document.getElementById('score-result'),
  allTableBody: document.querySelector('#all-table tbody'),
  shortlistedTableBody: document.querySelector('#shortlisted-table tbody'),
  allCount: document.getElementById('all-count'),
  shortlistedCount: document.getElementById('shortlisted-count')
};

function setLoading(target, loading) {
  if (!target) return;
  target.innerHTML = loading ? '<div class="text-muted small">Loading...</div>' : '';
}

function truncate(text, len = 80) {
  if (!text) return '';
  return text.length > len ? text.slice(0, len - 1) + '…' : text;
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchResumes() {
  try {
    setLoading(el.allTableBody, true);
    setLoading(el.shortlistedTableBody, true);

    const [all, shortlisted] = await Promise.all([
      fetchJSON(`${API_URL}/resumes`),
      fetchJSON(`${API_URL}/shortlisted`)
    ]);

    // Populate dropdown
    el.resumeSelect.innerHTML = '';
    for (const r of all) {
      const opt = document.createElement('option');
      opt.value = r._id;
      opt.textContent = `${r.candidateName || 'Unnamed'} ${r.matchScore != null ? `(${r.matchScore})` : ''}`.trim();
      el.resumeSelect.appendChild(opt);
    }

    // All table
    el.allTableBody.innerHTML = '';
    for (const r of all) {
      const tr = document.createElement('tr');
      if (typeof r.matchScore === 'number' && r.matchScore >= 70) tr.classList.add('row-shortlisted');
      tr.innerHTML = `
        <td>${truncate(r.candidateName, 48) || '<span class="text-muted">—</span>'}</td>
        <td>${r.email || '<span class="text-muted">—</span>'}</td>
        <td>${r.phone || '<span class="text-muted">—</span>'}</td>
        <td>${r.roleApplied || '<span class="text-muted">—</span>'}</td>
        <td class="text-end">${r.matchScore ?? '<span class="text-muted">—</span>'}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger" data-del="${r._id}"><i class="fa-solid fa-trash"></i></button>
        </td>`;
      el.allTableBody.appendChild(tr);
    }

    // Shortlisted table
    el.shortlistedTableBody.innerHTML = '';
    for (const r of shortlisted) {
      const tr = document.createElement('tr');
      tr.classList.add('row-shortlisted');
      tr.innerHTML = `
        <td>${truncate(r.candidateName, 48) || '<span class="text-muted">—</span>'}</td>
        <td>${r.email || '<span class="text-muted">—</span>'}</td>
        <td>${r.phone || '<span class="text-muted">—</span>'}</td>
        <td>${r.roleApplied || '<span class="text-muted">—</span>'}</td>
        <td class="text-end fw-semibold">${r.matchScore ?? ''}</td>`;
      el.shortlistedTableBody.appendChild(tr);
    }

    el.allCount.textContent = `${all.length} candidate${all.length !== 1 ? 's' : ''}`;
    el.shortlistedCount.textContent = `${shortlisted.length} shortlisted`;
  } catch (err) {
    el.allTableBody.innerHTML = `<tr><td colspan="6" class="text-danger">${err.message}</td></tr>`;
    el.shortlistedTableBody.innerHTML = `<tr><td colspan="5" class="text-danger">${err.message}</td></tr>`;
  }
}

async function uploadResume(e) {
  e.preventDefault();
  try {
    if (!el.uploadFile.files[0]) return;
    el.uploadResult.innerHTML = '';
    document.getElementById('up-spinner')?.classList.remove('d-none');
    const fd = new FormData();
    fd.append('resume', el.uploadFile.files[0]);
    const data = await fetchJSON(`${API_URL}/upload-resume`, { method: 'POST', body: fd });
    el.uploadResult.innerHTML = `<div class="alert alert-success">Uploaded. ID: ${data.id}</div>`;
    el.uploadForm.reset();
    
    // Reset file upload display
    const placeholder = document.getElementById('upload-placeholder');
    const fileSelected = document.getElementById('file-selected');
    if (placeholder && fileSelected) {
      placeholder.classList.remove('d-none');
      fileSelected.classList.add('d-none');
    }
    
    await fetchResumes();
  } catch (err) {
    el.uploadResult.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
  finally {
    document.getElementById('up-spinner')?.classList.add('d-none');
  }
}

async function scoreResume() {
  try {
    const resumeId = el.resumeSelect.value;
    const jobDescription = (el.jobDesc.value || '').trim();
    if (!resumeId || !jobDescription) {
      el.scoreResult.innerHTML = `<div class="alert alert-warning">Select a resume and enter a job description.</div>`;
      return;
    }
    el.scoreResult.innerHTML = '';
    document.getElementById('score-spinner')?.classList.remove('d-none');
    const data = await fetchJSON(`${API_URL}/score-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId, jobDescription })
    });
    const score = data.matchScore ?? data.score;
    const just = data.justification || 'No justification provided.';
    
    // Format justification with proper line breaks and styling
    const formattedJustification = just
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')  // Bold formatting
      .replace(/•/g, '&bull;')  // Bullet points
      .replace(/\n/g, '<br>')   // Line breaks
      .replace(/<br><br>/g, '<br><br>');  // Preserve double line breaks
    
    // Create score badge with color coding
    let scoreBadgeClass = 'bg-danger';
    let scoreLabel = 'Poor Match';
    if (score >= 85) {
      scoreBadgeClass = 'bg-success';
      scoreLabel = 'Excellent';
    } else if (score >= 75) {
      scoreBadgeClass = 'bg-primary';
      scoreLabel = 'Very Good';
    } else if (score >= 65) {
      scoreBadgeClass = 'bg-info';
      scoreLabel = 'Good';
    } else if (score >= 50) {
      scoreBadgeClass = 'bg-warning text-dark';
      scoreLabel = 'Fair';
    }
    
    // Show the analysis results section
    document.getElementById('analysis-results-section').style.display = 'block';
    
    // Smooth scroll to results
    setTimeout(() => {
      document.getElementById('analysis-results-section').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);
    
    el.scoreResult.innerHTML = `
      <div class="card card-modern shadow-lg mt-4 fade-in">
        <div class="card-header bg-gradient text-white" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <h5 class="mb-0"><i class="fa-solid fa-robot me-2"></i>AI Analysis Complete</h5>
              <small class="text-white-75">Powered by Gemini 2.5 Flash</small>
            </div>
            <div class="text-end">
              <div class="badge ${scoreBadgeClass} px-3 py-2 fs-6 mb-1">
                ${score}/100
              </div>
              <div class="small text-white-75">${scoreLabel} Match</div>
            </div>
          </div>
        </div>
        <div class="card-body p-4">
          <div class="analysis-content">
            ${formattedJustification}
          </div>
          <div class="mt-4 pt-3 border-top">
            <div class="row text-center">
              <div class="col-4">
                <div class="text-muted small mb-1">Analysis Time</div>
                <div class="fw-semibold">< 3 seconds</div>
              </div>
              <div class="col-4">
                <div class="text-muted small mb-1">AI Model</div>
                <div class="fw-semibold">Gemini 2.5</div>
              </div>
              <div class="col-4">
                <div class="text-muted small mb-1">Match Score</div>
                <div class="fw-semibold text-primary">${score}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    await fetchResumes();
  } catch (err) {
    // Show the analysis results section even for errors
    document.getElementById('analysis-results-section').style.display = 'block';
    el.scoreResult.innerHTML = `
      <div class="card card-modern shadow-lg fade-in">
        <div class="card-header bg-danger text-white">
          <h5 class="mb-0"><i class="fa-solid fa-exclamation-triangle me-2"></i>Analysis Error</h5>
          <small class="text-white-75">Something went wrong</small>
        </div>
        <div class="card-body">
          <div class="alert alert-danger mb-0">
            <i class="fa-solid fa-exclamation-circle me-2"></i>
            ${err.message}
          </div>
        </div>
      </div>
    `;
    // Scroll to error
    setTimeout(() => {
      document.getElementById('analysis-results-section').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);
  }
  finally {
    document.getElementById('score-spinner')?.classList.add('d-none');
  }
}

async function deleteResume(id) {
  try {
    await fetchJSON(`${API_URL}/resumes/${id}`, { method: 'DELETE' });
    await fetchResumes();
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
}

function hideAnalysisResults() {
  document.getElementById('analysis-results-section').style.display = 'none';
  el.scoreResult.innerHTML = '';
}

// File selection handler
el.uploadFile?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  const placeholder = document.getElementById('upload-placeholder');
  const fileSelected = document.getElementById('file-selected');
  const selectedFilename = document.getElementById('selected-filename');
  
  if (file) {
    // Show selected file display
    placeholder.classList.add('d-none');
    fileSelected.classList.remove('d-none');
    selectedFilename.textContent = file.name;
  } else {
    // Show placeholder
    placeholder.classList.remove('d-none');
    fileSelected.classList.add('d-none');
  }
});

// Event bindings
el.uploadForm?.addEventListener('submit', uploadResume);
el.scoreBtn?.addEventListener('click', scoreResume);
el.refreshBtn?.addEventListener('click', () => {
  fetchResumes();
  hideAnalysisResults();
  // Reset file upload display
  const placeholder = document.getElementById('upload-placeholder');
  const fileSelected = document.getElementById('file-selected');
  if (placeholder && fileSelected) {
    placeholder.classList.remove('d-none');
    fileSelected.classList.add('d-none');
  }
});
el.allTableBody?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-del]');
  if (btn) deleteResume(btn.getAttribute('data-del'));
});

// Init
fetchResumes();


