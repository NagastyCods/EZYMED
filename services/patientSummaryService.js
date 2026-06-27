const OpenAI = require('openai');
const Patient = require('../models/Patient');
const SymptomAssessment = require('../models/SymptomAssessment');
const Appointment = require('../models/Appointment');
const ClinicalRecord = require('../models/ClinicalRecord');
const DoctorNote = require('../models/DoctorNote');

const SYSTEM_PROMPT = `You are a clinical documentation assistant for EZYMED.
Generate a concise pre-visit summary for a treating physician.

Rules:
1. Summarize key facts only — demographics, active conditions, allergies, medications, recent triage, and recent visits.
2. Highlight urgent items, red flags, and items needing follow-up.
3. Do NOT diagnose. Use cautious language ("patient reports", "history suggests", "worth reviewing").
4. Keep the summary under 250 words, using short bullet-style sections.
5. Respond ONLY with valid JSON — no markdown.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    keyAlerts: {
      type: 'array',
      items: { type: 'string' },
    },
    suggestedFocus: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['headline', 'summary', 'keyAlerts', 'suggestedFocus'],
  additionalProperties: false,
};

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function buildPatientContext(patient, assessments, appointments, records, notes) {
  return {
    patient: {
      name: `${patient.firstName} ${patient.lastName}`,
      age: patient.dateOfBirth
        ? Math.floor((Date.now() - new Date(patient.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000))
        : null,
      gender: patient.gender,
      bloodType: patient.bloodType,
      allergies: patient.allergies?.map((a) => `${a.allergen} (${a.severity})`) || [],
      medications: patient.medications?.map((m) => `${m.name} ${m.dosage || ''}`.trim()) || [],
      conditions: patient.medicalHistory?.map((h) => `${h.condition} (${h.status})`) || [],
    },
    recentTriage: assessments.slice(0, 3).map((a) => ({
      date: a.createdAt,
      urgency: a.urgency,
      department: a.department,
      recommendation: a.recommendationTitle,
      conditions: a.possibleConditions?.map((c) => c.name) || [],
    })),
    recentAppointments: appointments.slice(0, 5).map((a) => ({
      date: a.scheduledAt,
      doctor: a.doctorName,
      status: a.status,
      reason: a.reason,
    })),
    recentClinicalActions: records.slice(0, 5).map((r) => ({
      type: r.type,
      title: r.title,
      date: r.createdAt,
    })),
    recentNotes: notes.slice(0, 3).map((n) => ({
      title: n.title,
      excerpt: n.content.slice(0, 120),
      date: n.createdAt,
    })),
  };
}

function buildFallbackSummary(patient, assessments) {
  const latest = assessments[0];
  const alerts = [];

  (patient.allergies || []).forEach((a) => {
    if (a.severity === 'severe') alerts.push(`Severe allergy: ${a.allergen}`);
  });

  if (latest?.urgency === 'urgent' || latest?.urgency === 'emergency') {
    alerts.push(`Recent triage flagged ${latest.urgency} urgency`);
  }

  const activeConditions = (patient.medicalHistory || [])
    .filter((h) => h.status === 'active')
    .map((h) => h.condition);

  const headline = `${patient.firstName} ${patient.lastName} — pre-visit overview`;
  const parts = [];

  if (activeConditions.length) parts.push(`Active conditions: ${activeConditions.join(', ')}.`);
  if (patient.medications?.length) {
    parts.push(`Current medications: ${patient.medications.map((m) => m.name).join(', ')}.`);
  }
  if (latest) {
    parts.push(`Latest symptom check (${new Date(latest.createdAt).toLocaleDateString()}): ${latest.recommendationTitle}.`);
  }

  return {
    headline,
    summary: parts.join(' ') || 'No significant history on file. Review intake details during the visit.',
    keyAlerts: alerts.length ? alerts : ['No critical alerts flagged from available records'],
    suggestedFocus: latest
      ? [`Review triage outcome: ${latest.department}`, 'Confirm allergies and current medications']
      : ['Confirm allergies and current medications', 'Document chief complaint'],
    provider: 'rules-fallback',
    generatedAt: new Date().toISOString(),
  };
}

async function generatePatientSummary(patientId) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new Error('Patient not found');

  const [assessments, appointments, records, notes] = await Promise.all([
    SymptomAssessment.find({ patient: patientId }).sort({ createdAt: -1 }).limit(5),
    Appointment.find({ patient: patientId }).sort({ scheduledAt: -1 }).limit(10),
    ClinicalRecord.find({ patient: patientId }).sort({ createdAt: -1 }).limit(10),
    DoctorNote.find({ patient: patientId }).sort({ createdAt: -1 }).limit(5),
  ]);

  const context = buildPatientContext(patient, assessments, appointments, records, notes);
  const client = getOpenAIClient();

  if (!client) {
    return buildFallbackSummary(patient, assessments);
  }

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Generate a physician pre-visit summary from this patient data:\n${JSON.stringify(context)}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'patient_summary', schema: RESPONSE_SCHEMA, strict: true },
      },
      temperature: 0.3,
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return {
      ...parsed,
      provider: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return buildFallbackSummary(patient, assessments);
  }
}

module.exports = { generatePatientSummary };
