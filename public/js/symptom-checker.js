const symptomChecker = {
  questions: [],
  steps: [],
  responses: {},
  currentStep: 1,
  totalSteps: 5,
  initialized: false,
};

function initSymptomChecker() {
  if (symptomChecker.initialized) return;
  symptomChecker.initialized = true;

  document.getElementById('startSymptomCheckBtn').addEventListener('click', startWizard);
  document.getElementById('scPrevBtn').addEventListener('click', prevStep);
  document.getElementById('scNextBtn').addEventListener('click', nextStep);

  loadQuestions();
  loadAssessmentHistory();
}

async function loadQuestions() {
  try {
    const data = await API.request('/api/symptom-checker/questions');
    symptomChecker.questions = data.questions;
    symptomChecker.steps = data.steps;
    symptomChecker.totalSteps = data.steps.length;
  } catch {
    document.getElementById('scIntro').innerHTML +=
      '<p class="alert alert-error" style="margin-top:1rem;">Unable to load symptom checker. Please refresh the page.</p>';
  }
}

function startWizard() {
  symptomChecker.responses = {};
  symptomChecker.currentStep = 1;
  document.getElementById('scIntro').hidden = true;
  document.getElementById('scResults').hidden = true;
  document.getElementById('scWizard').hidden = false;
  renderWizardStep();
}

function getQuestionsForStep(step) {
  return symptomChecker.questions.filter((q) => q.step === step);
}

function renderWizardStep() {
  const step = symptomChecker.currentStep;
  const stepMeta = symptomChecker.steps.find((s) => s.step === step) || {};
  const questions = getQuestionsForStep(step);

  document.getElementById('scStepLabel').textContent = `Step ${step} of ${symptomChecker.totalSteps}`;
  document.getElementById('scStepTitle').textContent = stepMeta.title || `Step ${step}`;
  document.getElementById('scStepHelp').textContent = stepMeta.description || '';
  document.getElementById('scWizardAlert').innerHTML = '';

  const progress = (step / symptomChecker.totalSteps) * 100;
  document.getElementById('scProgressBar').style.width = `${progress}%`;

  document.getElementById('scPrevBtn').disabled = step === 1;
  document.getElementById('scNextBtn').textContent = step === symptomChecker.totalSteps ? 'Get triage result' : 'Continue';

  const container = document.getElementById('scStepContent');
  container.innerHTML = questions.map((q) => renderQuestion(q)).join('');
  bindQuestionInputs(container);
}

function renderQuestion(q) {
  const help = q.helpText ? `<p class="text-small">${q.helpText}</p>` : '';

  if (q.type === 'select') {
    return `
      <div class="form-group" data-question="${q.id}">
        <label>${q.title}${q.required ? ' *' : ''}</label>
        ${help}
        <select name="${q.id}" ${q.required ? 'required' : ''}>
          <option value="">Select an option</option>
          ${q.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
      </div>`;
  }

  if (q.type === 'scale') {
    const val = symptomChecker.responses[q.id] || 5;
    return `
      <div class="form-group" data-question="${q.id}">
        <label>${q.title}${q.required ? ' *' : ''}</label>
        ${help}
        <div class="severity-scale">
          <input type="range" name="${q.id}" min="${q.min}" max="${q.max}" value="${val}" class="severity-slider">
          <div class="severity-labels">
            <span>Mild (1)</span>
            <span class="severity-value" id="severityValue">${val}</span>
            <span>Severe (10)</span>
          </div>
        </div>
      </div>`;
  }

  if (q.type === 'multiselect') {
    const selected = symptomChecker.responses[q.id] || [];
    return `
      <div class="form-group" data-question="${q.id}">
        <label>${q.title}${q.required ? ' *' : ''}</label>
        ${help}
        <div class="checkbox-group">
          ${q.options.map((o) => `
            <label class="checkbox-item">
              <input type="checkbox" name="${q.id}" value="${o.value}"
                ${selected.includes(o.value) ? 'checked' : ''}>
              <span>${o.label}</span>
            </label>
          `).join('')}
        </div>
      </div>`;
  }

  if (q.type === 'textarea') {
    return `
      <div class="form-group" data-question="${q.id}">
        <label>${q.title}${q.required ? ' *' : ''}</label>
        ${help}
        <textarea name="${q.id}" rows="4" placeholder="${q.placeholder || ''}">${symptomChecker.responses[q.id] || ''}</textarea>
      </div>`;
  }

  return '';
}

function bindQuestionInputs(container) {
  const slider = container.querySelector('.severity-slider');
  if (slider) {
    slider.addEventListener('input', (e) => {
      document.getElementById('severityValue').textContent = e.target.value;
    });
  }

  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      if (e.target.value === 'none' && e.target.checked) {
        container.querySelectorAll(`input[name="${e.target.name}"]`).forEach((el) => {
          if (el !== e.target) el.checked = false;
        });
      } else if (e.target.value !== 'none' && e.target.checked) {
        const noneBox = container.querySelector(`input[name="${e.target.name}"][value="none"]`);
        if (noneBox) noneBox.checked = false;
      }
    });
  });
}

function collectStepResponses() {
  const questions = getQuestionsForStep(symptomChecker.currentStep);
  const container = document.getElementById('scStepContent');

  for (const q of questions) {
    if (q.type === 'multiselect') {
      const checked = [...container.querySelectorAll(`input[name="${q.id}"]:checked`)].map((el) => el.value);
      symptomChecker.responses[q.id] = checked.length ? checked : (q.required ? [] : []);
      if (q.required && !checked.length) {
        return { ok: false, message: 'Please select at least one option (including "None" if applicable).' };
      }
    } else if (q.type === 'scale') {
      const el = container.querySelector(`[name="${q.id}"]`);
      symptomChecker.responses[q.id] = el ? Number(el.value) : null;
    } else if (q.type === 'textarea') {
      const el = container.querySelector(`[name="${q.id}"]`);
      symptomChecker.responses[q.id] = el ? el.value.trim() : '';
    } else {
      const el = container.querySelector(`[name="${q.id}"]`);
      const val = el ? el.value : '';
      if (q.required && !val) {
        return { ok: false, message: 'Please answer all required questions before continuing.' };
      }
      symptomChecker.responses[q.id] = val;
    }
  }
  return { ok: true };
}

function prevStep() {
  if (symptomChecker.currentStep > 1) {
    collectStepResponses();
    symptomChecker.currentStep -= 1;
    renderWizardStep();
  }
}

async function nextStep() {
  const result = collectStepResponses();
  if (!result.ok) {
    showAlert(document.getElementById('scWizardAlert'), result.message);
    return;
  }

  if (symptomChecker.currentStep < symptomChecker.totalSteps) {
    symptomChecker.currentStep += 1;
    renderWizardStep();
    return;
  }

  await submitAssessment();
}

async function submitAssessment() {
  const btn = document.getElementById('scNextBtn');
  btn.disabled = true;
  btn.textContent = 'Analyzing…';

  try {
    const data = await API.request('/api/symptom-checker/analyze', {
      method: 'POST',
      body: JSON.stringify({ responses: symptomChecker.responses }),
    });

    document.getElementById('scWizard').hidden = true;
    renderResults(data.assessment);
    loadAssessmentHistory();
  } catch (err) {
    showAlert(document.getElementById('scWizardAlert'), err.message);
    btn.disabled = false;
    btn.textContent = 'Get triage result';
  }
}

function renderResults(assessment) {
  const el = document.getElementById('scResults');
  el.hidden = false;

  const recClass = {
    stay_home: 'rec-home',
    book_consultation: 'rec-consult',
    seek_emergency: 'rec-emergency',
  }[assessment.recommendation] || 'rec-consult';

  const recIcon = {
    stay_home: '🏠',
    book_consultation: '📅',
    seek_emergency: '🚨',
  }[assessment.recommendation] || '📋';

  el.innerHTML = `
    <div class="disclaimer-banner" role="alert">
      <strong>Not a diagnosis:</strong> ${assessment.disclaimer}
    </div>

    <div class="card triage-result ${recClass}">
      <div class="triage-rec-header">
        <span class="triage-rec-icon">${recIcon}</span>
        <div>
          <p class="triage-rec-label">Recommended action</p>
          <h3>${assessment.recommendationTitle}</h3>
        </div>
      </div>
      <p>${assessment.recommendationDetail}</p>
      <div class="triage-meta">
        <div><span class="meta-label">Urgency</span> ${statusBadge(assessment.urgency)}</div>
        <div><span class="meta-label">Suggested department</span> <strong>${assessment.department}</strong></div>
        ${resultProviderLabel(assessment)}
      </div>
      ${assessment.recommendation === 'book_consultation' ? `
        <div class="quick-actions" style="margin-top:1rem;">
          <button type="button" class="btn btn-primary" id="scBookFromResult"
            data-dept="${assessment.department}" data-urgency="${assessment.urgency}">
            Book consultation
          </button>
          <button type="button" class="btn btn-outline" id="scQueueFromResult"
            data-dept="${assessment.department}" data-urgency="${assessment.urgency}">
            Join virtual queue
          </button>
        </div>
      ` : ''}
      ${assessment.recommendation === 'seek_emergency' ? `
        <p class="alert alert-error" style="margin-top:1rem;">Call emergency services or go to the nearest emergency department now.</p>
      ` : ''}
    </div>

    <div class="card">
      <h3>Possible conditions to discuss with a doctor</h3>
      <p class="text-muted text-small" style="margin-bottom:1rem;">These are possibilities for triage — not confirmed diagnoses.</p>
      ${assessment.possibleConditions.map((c) => `
        <div class="condition-item">
          <div class="condition-header">
            <strong>${c.name}</strong>
            ${likelihoodBadge(c.likelihood)}
          </div>
          <p class="text-small">${c.explanation}</p>
        </div>
      `).join('')}
    </div>

    <button type="button" class="btn btn-outline" id="scRestartBtn">Start new symptom check</button>
  `;

  document.getElementById('scRestartBtn').addEventListener('click', () => {
    el.hidden = true;
    document.getElementById('scIntro').hidden = false;
  });

  const bookBtn = document.getElementById('scBookFromResult');
  if (bookBtn && typeof openBookingWithPrefill === 'function') {
    bookBtn.addEventListener('click', () => {
      openBookingWithPrefill(bookBtn.dataset.dept, bookBtn.dataset.urgency, 'Following symptom assessment');
    });
  }

  const queueBtn = document.getElementById('scQueueFromResult');
  if (queueBtn && typeof joinVirtualQueue === 'function') {
    queueBtn.addEventListener('click', () => {
      joinVirtualQueue(queueBtn.dataset.dept, queueBtn.dataset.urgency, 'Following symptom assessment');
    });
  }
}

function likelihoodBadge(likelihood) {
  const map = { low: 'badge-muted', moderate: 'badge-warning', high: 'badge-danger' };
  return `<span class="badge ${map[likelihood] || 'badge-muted'}">${capitalize(likelihood)} likelihood</span>`;
}

function resultProviderLabel(assessment) {
  if (assessment.provider === 'openai') {
    const model = assessment.model ? ` (${assessment.model})` : '';
    return `<div><span class="meta-label">Analysis</span> <span class="badge badge-info">OpenAI${model}</span></div>`;
  }
  if (assessment.provider === 'rules-fallback') {
    return '<div><span class="meta-label">Analysis</span> <span class="badge badge-muted">Backup triage</span></div>';
  }
  return '';
}

async function loadAssessmentHistory() {
  const list = document.getElementById('scHistoryList');
  try {
    const data = await API.request('/api/symptom-checker/history');
    if (!data.assessments?.length) {
      list.innerHTML = '<p class="empty-state">No previous assessments. Start your first symptom check above.</p>';
      return;
    }

    list.innerHTML = data.assessments.map((a) => `
      <div class="list-card">
        <div class="list-card-main">
          <strong>${a.department}</strong>
          ${statusBadge(a.urgency)}
          <p class="text-muted">${formatDateTime(a.createdAt)} · ${a.recommendationTitle}</p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="viewAssessment('${a._id}')">View</button>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<p class="empty-state">Unable to load assessment history.</p>';
  }
}

window.viewAssessment = async (id) => {
  try {
    const data = await API.request(`/api/symptom-checker/${id}`);
    document.getElementById('scIntro').hidden = true;
    document.getElementById('scWizard').hidden = true;
    renderResults(data.assessment);
    document.getElementById('scResults').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert(err.message);
  }
};
