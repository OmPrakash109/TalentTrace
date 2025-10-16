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
        <td>${(r.skills || []).slice(0, 5).join(', ')}</td>
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
        <td>${(r.skills || []).slice(0, 5).join(', ')}</td>
        <td class="text-end fw-semibold">${r.matchScore ?? ''}</td>`;
      el.shortlistedTableBody.appendChild(tr);
    }

    el.allCount.textContent = `${all.length} resumes`;
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
    
    el.scoreResult.innerHTML = `
      <div class="alert alert-success">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="mb-0">AI Analysis Results</h6>
          <span class="badge bg-primary fs-6">Score: ${score}</span>
        </div>
        <div class="analysis-content" style="font-size: 0.9em; line-height: 1.5;">
          ${formattedJustification}
        </div>
      </div>
    `;
    await fetchResumes();
  } catch (err) {
    el.scoreResult.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
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

// Event bindings
el.uploadForm?.addEventListener('submit', uploadResume);
el.scoreBtn?.addEventListener('click', scoreResume);
el.refreshBtn?.addEventListener('click', fetchResumes);
el.allTableBody?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-del]');
  if (btn) deleteResume(btn.getAttribute('data-del'));
});

// Init
fetchResumes();


