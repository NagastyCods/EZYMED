const DISCLAIMER =
  'This AI symptom checker does not diagnose disease. It supports triage only and helps direct you to appropriate care. Always follow the advice of a qualified healthcare professional. If you think you are having a medical emergency, call emergency services immediately.';

const QUESTIONS = [
  {
    id: 'chiefComplaint',
    step: 1,
    title: 'What is your main concern today?',
    type: 'select',
    required: true,
    options: [
      { value: 'fever', label: 'Fever or feeling unwell' },
      { value: 'cough_breathing', label: 'Cough, cold, or breathing problems' },
      { value: 'chest_pain', label: 'Chest pain or heart-related symptoms' },
      { value: 'headache_neuro', label: 'Headache, dizziness, or neurological symptoms' },
      { value: 'stomach', label: 'Stomach pain, nausea, or digestive issues' },
      { value: 'pain_injury', label: 'Pain, injury, or joint problems' },
      { value: 'skin', label: 'Skin rash, itching, or swelling' },
      { value: 'mental_health', label: 'Anxiety, mood, or mental health concerns' },
      { value: 'other', label: 'Something else' },
    ],
  },
  {
    id: 'duration',
    step: 2,
    title: 'How long have you had these symptoms?',
    type: 'select',
    required: true,
    options: [
      { value: 'hours', label: 'Less than 24 hours' },
      { value: '1_3_days', label: '1–3 days' },
      { value: '4_7_days', label: '4–7 days' },
      { value: '1_2_weeks', label: '1–2 weeks' },
      { value: 'more_2_weeks', label: 'More than 2 weeks' },
    ],
  },
  {
    id: 'severity',
    step: 2,
    title: 'How severe are your symptoms? (1 = mild, 10 = worst imaginable)',
    type: 'scale',
    required: true,
    min: 1,
    max: 10,
  },
  {
    id: 'associatedSymptoms',
    step: 3,
    title: 'Do you have any of these additional symptoms?',
    type: 'multiselect',
    required: false,
    options: [
      { value: 'fever', label: 'Fever or chills' },
      { value: 'cough', label: 'Cough' },
      { value: 'shortness_of_breath', label: 'Shortness of breath' },
      { value: 'chest_pain', label: 'Chest pain or pressure' },
      { value: 'palpitations', label: 'Fast or irregular heartbeat' },
      { value: 'headache', label: 'Headache' },
      { value: 'dizziness', label: 'Dizziness or fainting' },
      { value: 'nausea_vomiting', label: 'Nausea or vomiting' },
      { value: 'abdominal_pain', label: 'Abdominal pain' },
      { value: 'diarrhea', label: 'Diarrhea' },
      { value: 'rash', label: 'Skin rash' },
      { value: 'swelling', label: 'Swelling of face, lips, or throat' },
      { value: 'weakness_numbness', label: 'Weakness or numbness (one side)' },
      { value: 'confusion', label: 'Confusion or difficulty speaking' },
      { value: 'blood_in_stool', label: 'Blood in stool or vomit' },
      { value: 'pain_urination', label: 'Pain when urinating' },
      { value: 'none', label: 'None of the above' },
    ],
  },
  {
    id: 'redFlags',
    step: 4,
    title: 'Are you experiencing any of these urgent warning signs?',
    type: 'multiselect',
    required: true,
    helpText: 'Select all that apply. These help us identify emergencies.',
    options: [
      { value: 'severe_breathing', label: 'Severe difficulty breathing or blue lips' },
      { value: 'crushing_chest_pain', label: 'Crushing chest pain spreading to arm, jaw, or back' },
      { value: 'sudden_weakness', label: 'Sudden weakness, facial droop, or slurred speech' },
      { value: 'worst_headache', label: 'Sudden worst headache of your life' },
      { value: 'loss_consciousness', label: 'Loss of consciousness or seizure' },
      { value: 'severe_bleeding', label: 'Heavy bleeding that will not stop' },
      { value: 'suicidal_thoughts', label: 'Thoughts of harming yourself or others' },
      { value: 'severe_allergic', label: 'Severe allergic reaction (throat closing, widespread rash)' },
      { value: 'none', label: 'None of these — I do not have urgent warning signs' },
    ],
  },
  {
    id: 'additionalNotes',
    step: 5,
    title: 'Anything else you want to share? (optional)',
    type: 'textarea',
    required: false,
    placeholder: 'Describe your symptoms in your own words…',
  },
];

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

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v) => v !== 'none');
  return value === 'none' ? [] : [value];
}

function analyzeSymptoms(responses, patientContext = {}) {
  const chief = responses.chiefComplaint;
  const duration = responses.duration;
  const severity = Number(responses.severity) || 5;
  const associated = normalizeList(responses.associatedSymptoms);
  const redFlags = normalizeList(responses.redFlags);
  const notes = (responses.additionalNotes || '').toLowerCase();
  const age = patientContext.age;

  const hasRedFlag = redFlags.some((f) => RED_FLAG_SET.has(f));
  const possibleConditions = [];
  let department = 'General Medicine';
  let urgency = 'routine';
  let recommendation = 'stay_home';
  let recommendationTitle = 'Self-care at home may be appropriate';
  let recommendationDetail =
    'Your responses suggest symptoms that may be managed at home with rest, fluids, and monitoring. Seek care sooner if symptoms worsen.';

  const addCondition = (name, likelihood, explanation) => {
    possibleConditions.push({ name, likelihood, explanation });
  };

  if (hasRedFlag) {
    urgency = 'emergency';
    recommendation = 'seek_emergency';
    recommendationTitle = 'Seek emergency care immediately';
    recommendationDetail =
      'You reported warning signs that may indicate a serious or life-threatening condition. Go to the nearest emergency department or call emergency services now. Do not wait for an appointment.';
    department = 'Emergency Medicine';

    if (redFlags.includes('crushing_chest_pain') || associated.includes('chest_pain')) {
      addCondition('Possible acute cardiac event', 'high',
        'Chest pain with emergency warning signs requires immediate medical evaluation — not a diagnosis.');
    }
    if (redFlags.includes('sudden_weakness')) {
      addCondition('Possible stroke or neurological emergency', 'high',
        'Sudden weakness or speech changes need urgent assessment.');
    }
    if (redFlags.includes('severe_breathing')) {
      addCondition('Possible severe respiratory distress', 'high',
        'Severe breathing difficulty requires emergency care.');
    }
    if (redFlags.includes('severe_allergic')) {
      addCondition('Possible severe allergic reaction (anaphylaxis)', 'high',
        'Throat swelling or widespread reaction may need emergency treatment.');
    }
    if (redFlags.includes('suicidal_thoughts')) {
      department = 'Psychiatry / Mental Health';
      addCondition('Mental health crisis — immediate support needed', 'high',
        'Thoughts of self-harm require urgent professional help.');
    }
    if (!possibleConditions.length) {
      addCondition('Urgent medical evaluation recommended', 'high',
        'Your reported warning signs need emergency assessment.');
    }

    return buildResult({ possibleConditions, urgency, department, recommendation, recommendationTitle, recommendationDetail, responses });
  }

  if (chief === 'chest_pain' || associated.includes('chest_pain') || associated.includes('palpitations')) {
    department = 'Cardiology';
    urgency = severity >= 7 || associated.includes('palpitations') ? 'urgent' : 'moderate';
    addCondition('Possible musculoskeletal chest pain', 'moderate', 'Often related to strain or inflammation — requires clinical evaluation.');
    addCondition('Possible acid reflux (GERD)', 'moderate', 'Burning chest discomfort can mimic cardiac symptoms.');
    if (associated.includes('palpitations')) {
      addCondition('Possible arrhythmia or palpitations', 'moderate', 'Irregular heartbeat should be evaluated by a clinician.');
    }
  } else if (chief === 'cough_breathing' || associated.includes('cough') || associated.includes('shortness_of_breath')) {
    department = associated.includes('shortness_of_breath') ? 'Pulmonology' : 'General Medicine';
    if (associated.includes('shortness_of_breath') && severity >= 6) urgency = 'urgent';
    else if (severity >= 5 || duration === 'more_2_weeks') urgency = 'moderate';
    addCondition('Possible upper respiratory infection', 'moderate', 'Common cold or viral illness — not a confirmed diagnosis.');
    addCondition('Possible bronchitis or asthma flare', 'low', 'Persistent cough or wheeze may need clinical review.');
    if (associated.includes('fever')) {
      addCondition('Possible influenza or viral fever', 'moderate', 'Fever with respiratory symptoms is common in viral illness.');
    }
  } else if (chief === 'headache_neuro' || associated.includes('headache') || associated.includes('dizziness')) {
    department = 'Neurology';
    if (severity >= 8) urgency = 'urgent';
    else if (severity >= 5 || duration === 'more_2_weeks') urgency = 'moderate';
    addCondition('Possible tension headache', 'moderate', 'Stress-related headache is common but should be assessed if severe or new.');
    addCondition('Possible migraine', 'moderate', 'One-sided throbbing headache with sensitivity may suggest migraine.');
    if (associated.includes('dizziness')) {
      addCondition('Possible vertigo or inner ear issue', 'low', 'Dizziness can have many causes.');
    }
  } else if (chief === 'stomach' || associated.includes('nausea_vomiting') || associated.includes('abdominal_pain')) {
    department = 'Gastroenterology';
    if (associated.includes('blood_in_stool') || severity >= 8) urgency = 'urgent';
    else if (severity >= 5) urgency = 'moderate';
    addCondition('Possible gastroenteritis', 'moderate', 'Stomach bug with nausea or diarrhea — usually viral.');
    addCondition('Possible gastritis or indigestion', 'moderate', 'Stomach irritation from diet, stress, or infection.');
    if (associated.includes('blood_in_stool')) {
      addCondition('Possible gastrointestinal bleeding', 'high', 'Blood in stool requires prompt medical evaluation.');
      urgency = 'urgent';
      recommendation = 'book_consultation';
    }
  } else if (chief === 'pain_injury') {
    department = 'Orthopedics';
    if (severity >= 8) urgency = 'urgent';
    else if (severity >= 4) urgency = 'moderate';
    addCondition('Possible musculoskeletal strain or sprain', 'moderate', 'Soft tissue injury from overuse or trauma.');
    addCondition('Possible joint inflammation', 'low', 'Swelling and stiffness may indicate inflammatory joint issues.');
  } else if (chief === 'skin' || associated.includes('rash')) {
    department = 'Dermatology';
    if (associated.includes('swelling')) {
      urgency = 'urgent';
      addCondition('Possible allergic reaction', 'high', 'Facial or throat swelling needs urgent review.');
    } else {
      urgency = severity >= 6 ? 'moderate' : 'routine';
      addCondition('Possible contact dermatitis or eczema', 'moderate', 'Skin irritation from allergens or dryness.');
      addCondition('Possible viral rash', 'low', 'Some infections cause widespread rash.');
    }
  } else if (chief === 'mental_health') {
    department = 'Psychiatry / Mental Health';
    urgency = severity >= 8 ? 'urgent' : 'moderate';
    addCondition('Possible anxiety or stress-related symptoms', 'moderate', 'Mood and anxiety symptoms benefit from professional support.');
    addCondition('Possible depressive symptoms', 'moderate', 'Persistent low mood should be evaluated by a clinician.');
  } else if (chief === 'fever' || associated.includes('fever')) {
    department = 'General Medicine';
    urgency = severity >= 7 ? 'urgent' : 'moderate';
    addCondition('Possible viral infection', 'moderate', 'Fever often indicates the body fighting infection.');
    addCondition('Possible bacterial infection', 'low', 'Prolonged or high fever may need tests — clinical judgment required.');
  } else {
    department = 'General Medicine';
    addCondition('Non-specific symptoms — clinical evaluation recommended', 'moderate',
      'Your symptoms do not clearly match one pattern; a clinician can assess further.');
  }

  if (age !== null && age < 18) {
    department = 'Pediatrics';
  }

  if (notes.includes('pregnant') || notes.includes('pregnancy')) {
    urgency = urgency === 'routine' ? 'moderate' : urgency;
    addCondition('Pregnancy-related symptoms need clinician guidance', 'moderate',
      'Some symptoms during pregnancy require specialized assessment.');
  }

  if (duration === 'more_2_weeks' && urgency === 'routine') {
    urgency = 'moderate';
  }
  if (severity >= 8 && urgency !== 'emergency') {
    urgency = 'urgent';
  } else if (severity >= 6 && urgency === 'routine') {
    urgency = 'moderate';
  }

  if (recommendation !== 'seek_emergency') {
    if (urgency === 'emergency') {
      recommendation = 'seek_emergency';
      recommendationTitle = 'Seek emergency care immediately';
      recommendationDetail = 'Based on your responses, urgent in-person emergency evaluation is recommended.';
    } else if (urgency === 'urgent') {
      recommendation = 'book_consultation';
      recommendationTitle = 'Book a consultation soon';
      recommendationDetail =
        'Your symptoms suggest you should see a doctor within 24 hours. Consider urgent care or a same-day virtual consultation.';
    } else if (urgency === 'moderate') {
      recommendation = 'book_consultation';
      recommendationTitle = 'Book a consultation';
      recommendationDetail =
        'A virtual or in-person consultation with the suggested department is recommended to evaluate your symptoms properly.';
    } else {
      recommendation = 'stay_home';
      recommendationTitle = 'Monitor at home';
      recommendationDetail =
        'Your responses suggest mild symptoms that may improve with rest and self-care. Book a consultation if symptoms persist beyond a few days or worsen.';
    }
  }

  return buildResult({ possibleConditions, urgency, department, recommendation, recommendationTitle, recommendationDetail, responses });
}

function buildResult(payload) {
  return {
    ...payload,
    disclaimer: DISCLAIMER,
    analyzedAt: new Date().toISOString(),
  };
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

module.exports = {
  DISCLAIMER,
  QUESTIONS,
  analyzeSymptoms,
  calculateAge,
};
