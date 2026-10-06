import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:3000';
const DISCLAIMER_FRAGMENT = 'DISCLAIMER: MedAssist AI is an academic prototype';

async function runTests() {
  console.log('====================================================');
  console.log('MedAssist AI — Comprehensive Verification Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Health check
  console.log('--- Test 1: System Health Endpoint ---');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthData = await healthRes.json();
  assert(healthRes.status === 200, 'Health endpoint returns HTTP 200');
  assert(healthData.status === 'ok', 'System status is ok');
  assert(healthData.disclaimer.includes(DISCLAIMER_FRAGMENT), 'Health response includes medical disclaimer');

  // 2. Sample Endpoints
  console.log('\n--- Test 2: Sample Reports Loading ---');
  const sampleBiopsy = await fetch(`${BASE_URL}/api/samples/biopsy`).then((r) => r.json());
  assert(sampleBiopsy.content.includes('BIOPSY REPORT'), 'Biopsy sample loads correctly');
  assert(sampleBiopsy.content.includes('REACTIVE LYMPHOID FOLLICULAR HYPERPLASIA'), 'Biopsy contains reactive pathology');

  const sampleBlood = await fetch(`${BASE_URL}/api/samples/blood`).then((r) => r.json());
  assert(sampleBlood.content.includes('COMPLETE BLOOD COUNT'), 'Blood sample loads correctly');

  // 3. Biopsy Report Analysis (Primary Use Case)
  console.log('\n--- Test 3: Primary Use Case — Biopsy Report Understanding ---');
  const analyzeRes = await fetch(`${BASE_URL}/api/analyze-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: sampleBiopsy.content,
      filename: 'test_biopsy.txt',
    }),
  });
  const analyzeData = await analyzeRes.json();

  assert(analyzeRes.status === 200, 'Report analysis returns HTTP 200');
  assert(analyzeData.documentType === 'Biopsy / Histopathology', 'Document type correctly detected as Biopsy / Histopathology');
  assert(Boolean(analyzeData.analysis.summary), 'Summary generated');
  console.log('  Summary preview:', analyzeData.analysis.summary.slice(0, 140) + '...');

  // Check Impression comparison (What Report Says vs Simple Explanation)
  assert(Boolean(analyzeData.analysis.impression.reportSays), 'Impression verbatim report wording extracted');
  assert(Boolean(analyzeData.analysis.impression.simpleExplanation), 'Impression plain-English explanation generated');
  console.log('  Report Says:', analyzeData.analysis.impression.reportSays.replace(/\n+/g, ' ').slice(0, 100));
  console.log('  Simple Explanation:', analyzeData.analysis.impression.simpleExplanation.slice(0, 120));

  // Check Terms Explained
  assert(Array.isArray(analyzeData.analysis.termsExplained) && analyzeData.analysis.termsExplained.length > 0, 'Medical terms identified and explained');
  console.log(`  Identified ${analyzeData.analysis.termsExplained.length} terms (e.g. ${analyzeData.analysis.termsExplained[0]?.term})`);

  // Check What Report Does Not Tell Us
  assert(Boolean(analyzeData.analysis.whatReportDoesNotTellUs), 'Report limits / boundary clearly stated');

  // Check Questions for Doctor
  assert(Array.isArray(analyzeData.analysis.questionsForDoctor) && analyzeData.analysis.questionsForDoctor.length >= 3, 'At least 3 doctor questions generated');
  console.log(`  Generated ${analyzeData.analysis.questionsForDoctor.length} questions for doctor: "${analyzeData.analysis.questionsForDoctor[0]}"`);

  // 4. Grounded Follow-up Q&A (RAG)
  console.log('\n--- Test 4: Grounded Follow-up Q&A & Safety ---');

  // Question on specific term
  const qTerm = await fetch(`${BASE_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'What does reactive lymphoid follicular hyperplasia mean in simple terms?',
      documentId: 'test_biopsy.txt',
    }),
  }).then((r) => r.json());

  assert(qTerm.answer.includes(DISCLAIMER_FRAGMENT), 'Term explanation Q&A includes disclaimer');
  assert(qTerm.citations.length > 0, 'Term explanation includes source citation');
  console.log('  Q&A Answer excerpt:', qTerm.answer.slice(0, 150) + '...');

  // Cancer safety boundary check
  const qCancer = await fetch(`${BASE_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'Is there any sign of cancer in this biopsy report?',
      documentId: 'test_biopsy.txt',
    }),
  }).then((r) => r.json());

  assert(qCancer.answer.toLowerCase().includes('negative for malignancy') || qCancer.answer.toLowerCase().includes('non-cancerous') || qCancer.answer.toLowerCase().includes('no signs of cancer'), 'Grounded answer accurately reports benign finding without inventing cancer');

  // Question not in report
  const qNotInReport = await fetch(`${BASE_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'What is the patient favorite food and car model?',
      documentId: 'test_biopsy.txt',
    }),
  }).then((r) => r.json());

  assert(
    qNotInReport.answer.includes('not provide enough information') ||
    qNotInReport.answer.includes('does not provide enough information'),
    'Unknown / absent information correctly declined with safety boundary'
  );

  // 5. Secondary Tools
  console.log('\n--- Test 5: Secondary Clinical Tools ---');
  const sumRes = await fetch(`${BASE_URL}/api/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Patient reports persistent lymph node swelling.' }),
  }).then((r) => r.json());
  assert(sumRes.result.includes(DISCLAIMER_FRAGMENT), 'Summarizer includes disclaimer');

  const noteRes = await fetch(`${BASE_URL}/api/structure-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Patient presents with mild fever and sore throat.' }),
  }).then((r) => r.json());
  assert(noteRes.result.includes('STRUCTURED CLINICAL DRAFT'), 'Note structurer creates structured sections');

  const eduRes = await fetch(`${BASE_URL}/api/patient-education`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Diagnosis of benign reactive lymphadenopathy.' }),
  }).then((r) => r.json());
  assert(eduRes.result.includes('Plain-Language Education Guide'), 'Patient education drafter generates respectful guide');

  // 6. Empty / Invalid Document Handling
  console.log('\n--- Test 6: Empty Document Handling ---');
  const emptyRes = await fetch(`${BASE_URL}/api/analyze-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '   ' }),
  });
  assert(emptyRes.status === 400, 'Empty document text returns HTTP 400');

  console.log('\n====================================================');
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
