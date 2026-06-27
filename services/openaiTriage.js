const OpenAI = require('openai');
const { DISCLAIMER, QUESTIONS, analyzeSymptoms } = require('./symptomTriage');

const RED_FLAG_SET = new Set([
  'severe_breathing',
  'crushing_chest_pain',
  'sudden_weakness',
  'worst_headache',
  'loss_consciousness',
  'severe_bleeding',
  'suicidal_thoughts',
  'severe_allergic',
]);

const URGENCY_VALUES = ['routine', 'moderate', 'urgent', 'emergency'];
const RECOMMENDATION_VALUES = ['stay_home', 'book_consultation', 'seek_emergency'];
const LIKELIHOOD_VALUES = ['low', 'moderate', 'high'];

const SYSTEM_PROMPT = `You are a clinical triage assistant for EZYMED, a healthcare platform.
Your role is to support patient triage — you do NOT diagnose disease.

Rules you must follow:
1. Never state that the patient has a confirmed diagnosis. Use language like "possible", "may suggest", or "worth discussing with a doctor".
2. Identify 1–4 possible conditions the patient should discuss with a clinician.
3. Estimate urgency: routine, moderate, urgent, or emergency.
4. Suggest the most appropriate hospital department (e.g. General Medicine, Pediatrics, Cardiology, Emergency Medicine).
5. Recommend one action: stay_home, book_consultation, or seek_emergency.
6. If any emergency red flags are present, urgency MUST be "emergency" and recommendation MUST be "seek_emergency".
7. Consider patient age, allergies, medications, and medical history when relevant.
8. Respond ONLY with valid JSON matching the required schema — no markdown, no extra text.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    possibleConditions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          likelihood: { type: 'string', enum: LIKELIHOOD_VALUES },
          explanation: { type: 'string' },
        },
        required: ['name', 'likelihood', 'explanation'],
        additionalProperties: false,
      },
    },
    urgency: { type: 'string', enum: URGENCY_VALUES },
    department: { type: 'string' },
    recommendation: { type: 'string', enum: RECOMMENDATION_VALUES },
    recommendationTitle: { type: 'string' },
    recommendationDetail: { type: 'string' },
  },
  required: [
    'possibleConditions',
    'urgency',
    'department',
    'recommendation',
    'recommendationTitle',
    'recommendationDetail',
  ],
  additionalProperties: false,
};

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured. Add it to your .env file.');
  }
  return new OpenAI({ apiKey });
}

function labelForQuestion(questionId, value) {
  const question = QUESTIONS.find((q) => q.id === questionId);
  if (!question?.options) return value;
  if (Array.isArray(value)) {
    return value.map((v) => question.options.find((o) => o.value === v)?.label || v);
  }
  return question.options.find((o) => o.value === value)?.label || value;
}

function formatResponsesForPrompt(responses) {
  return {
    mainConcern: labelForQuestion('chiefComplaint', responses.chiefComplaint),
    duration: labelForQuestion('duration', responses.duration),
    severity: `${responses.severity}/10`,
    additionalSymptoms: labelForQuestion('associatedSymptoms', responses.associatedSymptoms || []),
    urgentWarningSigns: labelForQuestion('redFlags', responses.redFlags || []),
    patientNotes: responses.additionalNotes || '(none)',
  };
}

function formatPatientContext(patientContext) {
  const { age, gender, allergies, medications, medicalHistory } = patientContext;
  return {
    age: age ?? 'unknown',
    gender: gender || 'unknown',
    allergies: allergies?.length
      ? allergies.map((a) => `${a.allergen} (${a.severity})`).join('; ')
      : 'none recorded',
    currentMedications: medications?.length
      ? medications.map((m) => m.name).join('; ')
      : 'none recorded',
    medicalHistory: medicalHistory?.length
      ? medicalHistory.map((h) => `${h.condition} (${h.status})`).join('; ')
      : 'none recorded',
  };
}

function hasEmergencyRedFlags(responses) {
  const redFlags = Array.isArray(responses.redFlags)
    ? responses.redFlags.filter((f) => f !== 'none')
    : [];
  return redFlags.some((f) => RED_FLAG_SET.has(f));
}

function applySafetyOverrides(result, responses) {
  if (!hasEmergencyRedFlags(responses)) return result;

  return {
    ...result,
    urgency: 'emergency',
    recommendation: 'seek_emergency',
    recommendationTitle: 'Seek emergency care immediately',
    recommendationDetail:
      'You reported urgent warning signs. Go to the nearest emergency department or call emergency services now, regardless of other symptom details.',
    department: result.department === 'General Medicine' ? 'Emergency Medicine' : result.department,
  };
}

function validateAndNormalize(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid AI response format');
  }

  const possibleConditions = (raw.possibleConditions || [])
    .filter((c) => c && c.name)
    .slice(0, 4)
    .map((c) => ({
      name: String(c.name).slice(0, 200),
      likelihood: LIKELIHOOD_VALUES.includes(c.likelihood) ? c.likelihood : 'moderate',
      explanation: String(c.explanation || 'Requires clinical evaluation.').slice(0, 500),
    }));

  if (!possibleConditions.length) {
    possibleConditions.push({
      name: 'Non-specific symptoms — clinical evaluation recommended',
      likelihood: 'moderate',
      explanation: 'Your symptoms should be assessed by a qualified healthcare professional.',
    });
  }

  return {
    possibleConditions,
    urgency: URGENCY_VALUES.includes(raw.urgency) ? raw.urgency : 'moderate',
    department: String(raw.department || 'General Medicine').slice(0, 100),
    recommendation: RECOMMENDATION_VALUES.includes(raw.recommendation)
      ? raw.recommendation
      : 'book_consultation',
    recommendationTitle: String(raw.recommendationTitle || 'Book a consultation').slice(0, 200),
    recommendationDetail: String(raw.recommendationDetail || 'Please consult a healthcare professional.').slice(0, 1000),
  };
}

async function analyzeSymptomsWithOpenAI(responses, patientContext = {}) {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const userPrompt = JSON.stringify({
    task: 'Perform triage based on the patient symptom questionnaire responses.',
    patientContext: formatPatientContext(patientContext),
    symptomResponses: formatResponsesForPrompt(responses),
    outputSchema: {
      possibleConditions: '[{ name, likelihood: low|moderate|high, explanation }]',
      urgency: 'routine | moderate | urgent | emergency',
      department: 'string',
      recommendation: 'stay_home | book_consultation | seek_emergency',
      recommendationTitle: 'short action headline',
      recommendationDetail: '2-3 sentences explaining the recommendation',
    },
  });

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'symptom_triage',
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  const normalized = validateAndNormalize(parsed);
  const safe = applySafetyOverrides(normalized, responses);

  return {
    ...safe,
    disclaimer: DISCLAIMER,
    analyzedAt: new Date().toISOString(),
    provider: 'openai',
    model,
  };
}

async function analyzeSymptomsAI(responses, patientContext = {}) {
  try {
    return await analyzeSymptomsWithOpenAI(responses, patientContext);
  } catch (err) {
    if (!process.env.OPENAI_API_KEY) throw err;

    console.error('OpenAI triage failed, using rule-based fallback:', err.message);
    const fallback = analyzeSymptoms(responses, patientContext);
    return { ...fallback, provider: 'rules-fallback', fallbackReason: err.message };
  }
}

module.exports = {
  analyzeSymptomsWithOpenAI,
  analyzeSymptomsAI,
};
