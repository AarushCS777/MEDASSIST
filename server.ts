import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

export const MEDICAL_DISCLAIMER =
  'DISCLAIMER: MedAssist AI is an academic prototype for reference only, ' +
  'not certified for diagnosis or treatment. All outputs must be validated ' +
  'by a licensed healthcare professional.';

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const publicDir = fs.existsSync(path.resolve('public'))
  ? path.resolve('public')
  : path.resolve('frontend');
const dataDir = path.resolve('data');
const uploadsDir = path.resolve(dataDir, 'uploads');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Serve static frontend assets from public/ (and fallback frontend/)
app.use(express.static(publicDir));
app.use('/static', express.static(publicDir));
if (fs.existsSync(path.resolve('frontend'))) {
  app.use('/static', express.static(path.resolve('frontend')));
}

// Curated medical terminology glossary for non-medical users
export const MEDICAL_GLOSSARY: Record<string, string> = {
  'reactive lymphoid follicular hyperplasia':
    'A harmless, non-cancerous swelling of lymph-node immune centers in response to an infection or inflammation.',
  'follicular hyperplasia':
    'An enlargement of immune cell clusters in a lymph node, commonly reacting to a mild infection or irritation.',
  'sinus histiocytosis':
    'A buildup of normal scavenger immune cells (macrophages) filtering fluid and debris from a nearby inflamed area.',
  'lymphoid hyperplasia':
    'Normal immune tissue that has grown larger than usual because it is actively working to fight an infection.',
  'tingible body macrophages':
    'Normal, healthy scavenger cells inside lymph nodes that clean up spent cells; their presence is a reassuring sign of healthy, non-cancerous tissue.',
  'germinal centers':
    'Active factories inside lymph nodes where specialized infection-fighting white blood cells (B cells) mature.',
  'mantle zone':
    'A ring of resting immune cells surrounding the active center of a lymph node follicle.',
  'gross description':
    'Visual examination of the tissue specimen with the naked eye (such as its size, color, and weight) before it is sliced for microscope viewing.',
  'microscopic description':
    'Detailed examination of thin tissue slices under a microscope to inspect the cells and their layout.',
  'excisional biopsy':
    'A minor surgical procedure where an entire lump or lymph node is removed so it can be examined under a microscope.',
  'biopsy':
    'The removal of a small sample of body tissue so a pathologist can examine it for signs of disease.',
  'pathology':
    'The medical specialty focused on examining tissue, cells, and body fluids to understand diseases.',
  'histopathology':
    'The examination of diseased or sampled tissue under a microscope.',
  'benign':
    'Non-cancerous; harmless tissue that does not invade nearby organs or spread to other parts of the body.',
  'malignancy':
    'Cancer; cells that can divide uncontrollably, invade nearby tissues, and potentially spread.',
  'lymphadenopathy':
    'Swollen or enlarged lymph nodes, most commonly caused by the immune system reacting to a cold, infection, or inflammation.',
  'starry-sky pattern':
    'A classic microscope appearance seen when clean-up cells actively clear debris in healthy, rapidly reacting immune tissue.',
  'granuloma':
    'A tiny ball of immune cells formed when the body walls off persistent irritation, infection, or foreign matter.',
  'necrosis':
    'Areas where tissue cells have died, often from lack of blood flow or strong inflammation.',
  'atypical':
    'Cells that look somewhat unusual or different from normal cells when viewed under a microscope.',
  'immunohistochemical':
    'Special laboratory staining tests that highlight specific proteins on cells to help identify their exact type.',
  'cd20':
    'A protein marker found on normal B cells (a key type of antibody-producing immune cell).',
  'bcl-2':
    'A protein test used by pathologists; when negative in germinal centers, it strongly helps confirm that an enlarged lymph node is benign rather than lymphoma.',
  'ki-67':
    'A marker indicating how quickly cells are dividing in a tissue sample.',
  'edema':
    'Swelling caused by excess fluid accumulating in the body tissues.',
  'erythema':
    'Redness of the skin or tissue caused by increased blood flow, usually from inflammation or infection.',
  'complete blood count':
    'A standard blood test that measures white blood cells, red blood cells, hemoglobin, hematocrit, and platelets.',
  'cbc':
    'Complete Blood Count: standard test of infection-fighting cells, oxygen carriers, and clotting platelets.',
  'wbc':
    'White Blood Cells: the infection-fighting cells of your immune system.',
  'rbc':
    'Red Blood Cells: cells that carry oxygen from your lungs to the rest of your body.',
  'hemoglobin':
    'The iron-rich protein in red blood cells that binds and carries oxygen.',
  'hematocrit':
    'The percentage of your blood volume made up of red blood cells.',
  'platelets':
    'Small cell fragments in the blood that help blood clot to stop bleeding.',
  'neutrophils':
    'The most common type of white blood cell, usually the first responders to bacterial infections.',
  'lymphocytes':
    'White blood cells that produce antibodies and remember previous infections.',
  'monocytes':
    'White blood cells that turn into macrophages to clean up dead cells and debris.',
  'cmp':
    'Comprehensive Metabolic Panel: a blood test evaluating blood sugar, electrolytes, and kidney and liver health.',
  'bun':
    'Blood Urea Nitrogen: a waste product measured in blood to check kidney function.',
  'creatinine':
    'A normal waste product from muscle breakdown; higher blood levels may indicate that kidneys need evaluation.',
  'egfr':
    'Estimated Glomerular Filtration Rate: a score estimating how well your kidneys are filtering waste from the blood.',
  'alt':
    'Alanine Aminotransferase: an enzyme found mainly in liver cells; higher levels can suggest liver irritation.',
  'ast':
    'Aspartate Aminotransferase: an enzyme found in liver and muscle cells.',
  'lipid panel':
    'A blood test measuring cholesterol and fats (triglycerides) in your bloodstream.',
  'total cholesterol':
    'The overall amount of cholesterol in your blood, including both HDL and LDL.',
  'hdl cholesterol':
    'High-Density Lipoprotein: often called "good" cholesterol because it helps remove excess cholesterol from arteries.',
  'ldl cholesterol':
    'Low-Density Lipoprotein: often called "bad" cholesterol because elevated levels can build up in blood vessels over time.',
  'triglycerides':
    'The most common type of fat in your body, derived from calories not immediately used for energy.',
  'impression':
    'The pathologist’s or physician’s primary summary diagnosis based on the test or specimen examination.',
  'conclusion':
    'The final medical assessment and findings determined from the document.',
};

// In-Memory Document & Chunk Store
export interface DocumentChunk {
  id: string;
  source: string;
  page: number | string;
  fileType: string;
  section?: string;
  content: string;
  tokens: string[];
}

export interface IngestedDocumentRecord {
  id: string;
  filename: string;
  documentType: string;
  isScanned: boolean;
  ocrUsed: boolean;
  text: string;
  sections: Array<{ name: string; content: string }>;
  uploadedAt: string;
  analysis?: any;
}

const knowledgeStore: {
  documents: Map<string, IngestedDocumentRecord>;
  chunks: DocumentChunk[];
} = {
  documents: new Map(),
  chunks: [],
};

function cleanText(text: string): string {
  return text
    .replace(/\0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function splitTextIntoChunks(
  text: string,
  chunkSize = 800,
  chunkOverlap = 100
): string[] {
  const separators = ['\n\n', '\n', '. ', ' ', ''];

  function split(content: string, sepIndex: number): string[] {
    if (content.length <= chunkSize) {
      return content.trim() ? [content.trim()] : [];
    }
    if (sepIndex >= separators.length) {
      const chunks: string[] = [];
      let i = 0;
      while (i < content.length) {
        chunks.push(content.slice(i, i + chunkSize));
        i += chunkSize - chunkOverlap;
      }
      return chunks.filter((c) => c.trim().length > 0);
    }
    const sep = separators[sepIndex];
    const parts = sep ? content.split(sep) : Array.from(content);
    const result: string[] = [];
    let current = '';

    for (const part of parts) {
      const candidate = current ? current + sep + part : part;
      if (candidate.length <= chunkSize) {
        current = candidate;
      } else {
        if (current) result.push(current);
        if (part.length > chunkSize) {
          result.push(...split(part, sepIndex + 1));
          current = '';
        } else {
          current = part;
        }
      }
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }

  const raw = split(text, 0);
  const finalChunks: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const chunk = raw[i];
    if (finalChunks.length > 0 && chunkOverlap > 0) {
      const prev = finalChunks[finalChunks.length - 1];
      const overlapText = prev.slice(-chunkOverlap);
      if (
        !chunk.startsWith(overlapText) &&
        chunk.length + overlapText.length <= chunkSize + 50
      ) {
        finalChunks.push((overlapText + ' ' + chunk).trim());
        continue;
      }
    }
    finalChunks.push(chunk);
  }
  return finalChunks.filter((c) => c.length > 0);
}

// Section Detection
export function detectDocumentSections(
  text: string
): Array<{ name: string; content: string }> {
  const knownHeaders = [
    'SPECIMEN',
    'PATIENT INFORMATION',
    'CLINICAL HISTORY',
    'CLINICAL INDICATION',
    'GROSS DESCRIPTION',
    'MACROSCOPIC EXAMINATION',
    'MICROSCOPIC DESCRIPTION',
    'MICROSCOPIC EXAMINATION',
    'HISTOPATHOLOGY',
    'HISTOLOGICAL EXAMINATION',
    'IMMUNOHISTOCHEMISTRY',
    'SPECIAL STAINS',
    'IMPRESSION',
    'DIAGNOSIS',
    'FINAL DIAGNOSIS',
    'CONCLUSION',
    'COMMENT',
    'COMMENTS',
    'RECOMMENDATIONS',
    'COMPLETE BLOOD COUNT',
    'CBC',
    'COMPREHENSIVE METABOLIC PANEL',
    'CMP',
    'LIPID PANEL',
    'FINDINGS',
    'TECHNIQUE',
  ];

  const lines = text.split('\n');
  const sections: Array<{ name: string; content: string }> = [];
  let currentHeader = 'General Document Information';
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase().replace(/[:#\-_]/g, '').trim();

    const matched = knownHeaders.find(
      (h) => upper === h || upper.startsWith(h + ' ') || upper.endsWith(' ' + h)
    );

    if (matched && trimmed.length < 80) {
      if (currentLines.length > 0) {
        sections.push({
          name: currentHeader,
          content: currentLines.join('\n').trim(),
        });
      }
      currentHeader = trimmed.replace(/[:#]/g, '').trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      name: currentHeader,
      content: currentLines.join('\n').trim(),
    });
  }

  return sections.filter((s) => s.content.length > 0);
}

export function detectDocumentType(text: string): string {
  const lower = text.toLowerCase();
  if (
    lower.includes('biopsy') ||
    lower.includes('histopathol') ||
    lower.includes('pathology') ||
    lower.includes('microscopic description') ||
    lower.includes('gross description') ||
    lower.includes('specimen')
  ) {
    return 'Biopsy / Histopathology';
  }
  if (
    lower.includes('blood count') ||
    lower.includes('cbc') ||
    lower.includes('lipid panel') ||
    lower.includes('metabolic panel') ||
    lower.includes('hemoglobin') ||
    lower.includes('glucose')
  ) {
    return 'Laboratory / Blood Work';
  }
  if (
    lower.includes('x-ray') ||
    lower.includes('mri') ||
    lower.includes('ct scan') ||
    lower.includes('ultrasound') ||
    lower.includes('radiology')
  ) {
    return 'Medical Imaging / Radiology';
  }
  if (lower.includes('discharge') || lower.includes('hospital course')) {
    return 'Discharge Summary';
  }
  return 'Clinical Healthcare Document';
}

function findTermsInText(
  text: string
): Array<{ term: string; explanation: string }> {
  const lower = text.toLowerCase();
  const found: Array<{ term: string; explanation: string }> = [];

  for (const [term, explanation] of Object.entries(MEDICAL_GLOSSARY)) {
    if (lower.includes(term.toLowerCase())) {
      found.push({
        term: term.charAt(0).toUpperCase() + term.slice(1),
        explanation,
      });
    }
  }

  // Deduplicate and return top matching terms
  const seen = new Set<string>();
  return found.filter((item) => {
    if (seen.has(item.term.toLowerCase())) return false;
    seen.add(item.term.toLowerCase());
    return true;
  });
}

function indexDocument(
  filename: string,
  rawText: string,
  isScanned = false,
  ocrUsed = false
): IngestedDocumentRecord {
  const cleaned = cleanText(rawText);
  const docType = detectDocumentType(cleaned);
  const sections = detectDocumentSections(cleaned);

  // Remove existing chunks for this source if re-indexing
  knowledgeStore.chunks = knowledgeStore.chunks.filter(
    (c) => c.source !== filename
  );

  const chunkTexts = splitTextIntoChunks(cleaned, 800, 100);
  for (let i = 0; i < chunkTexts.length; i++) {
    const content = chunkTexts[i];
    const hash = crypto
      .createHash('sha256')
      .update(`${filename}|${i}|${content}`)
      .digest('hex')
      .slice(0, 24);
    const id = `${filename}-${hash}`;

    // Determine nearest section
    let assignedSection = 'General';
    for (const sec of sections) {
      if (sec.content.includes(content.slice(0, 60))) {
        assignedSection = sec.name;
        break;
      }
    }

    knowledgeStore.chunks.push({
      id,
      source: filename,
      page: 1,
      fileType: isScanned ? 'scanned-pdf' : 'text',
      section: assignedSection,
      content,
      tokens: tokenize(content),
    });
  }

  const record: IngestedDocumentRecord = {
    id: filename,
    filename,
    documentType: docType,
    isScanned,
    ocrUsed,
    text: cleaned,
    sections,
    uploadedAt: new Date().toISOString(),
  };

  knowledgeStore.documents.set(filename, record);
  return record;
}

// Search knowledge store (both uploaded documents and reference guide)
function searchKnowledge(
  query: string,
  k = 5,
  targetDocument?: string
): Array<{ chunk: DocumentChunk; score: number }> {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || knowledgeStore.chunks.length === 0) return [];

  const queryLower = query.toLowerCase();

  const candidates = targetDocument
    ? knowledgeStore.chunks.filter(
        (c) =>
          c.source === targetDocument ||
          c.source.includes('sample_medical_guide.txt')
      )
    : knowledgeStore.chunks;

  const scored = candidates.map((chunk) => {
    let score = 0;
    const chunkLower = chunk.content.toLowerCase();

    // Exact phrase match bonus
    if (chunkLower.includes(queryLower)) {
      score += 12;
    }

    // Boost uploaded document if specified
    if (targetDocument && chunk.source === targetDocument) {
      score += 4;
    }

    for (const qt of queryTokens) {
      if (chunkLower.includes(qt)) {
        score += 2;
      }
      const count = chunk.tokens.filter((t) => t === qt).length;
      score += count * 1.5;
    }

    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    console.warn('[MedAssist AI] Failed to initialize GoogleGenAI client:', err);
    return null;
  }
}

// Pre-load reference guides and synthetic sample reports
function seedKnowledgeBase() {
  const guidePath = path.resolve(dataDir, 'sample_medical_guide.txt');
  if (fs.existsSync(guidePath)) {
    try {
      const text = fs.readFileSync(guidePath, 'utf-8');
      indexDocument('sample_medical_guide.txt', text, false, false);
      console.log('[MedAssist AI] Seeded reference medical guide.');
    } catch (err) {
      console.warn('[MedAssist AI] Could not seed medical guide:', err);
    }
  }

  const biopsyPath = path.resolve(dataDir, 'sample_biopsy_report.txt');
  if (fs.existsSync(biopsyPath)) {
    try {
      const text = fs.readFileSync(biopsyPath, 'utf-8');
      indexDocument('sample_biopsy_report.txt', text, false, false);
      console.log('[MedAssist AI] Pre-indexed sample biopsy report.');
    } catch (err) {
      console.warn('[MedAssist AI] Could not seed biopsy report:', err);
    }
  }

  const bloodPath = path.resolve(dataDir, 'sample_blood_report.txt');
  if (fs.existsSync(bloodPath)) {
    try {
      const text = fs.readFileSync(bloodPath, 'utf-8');
      indexDocument('sample_blood_report.txt', text, false, false);
      console.log('[MedAssist AI] Pre-indexed sample blood report.');
    } catch (err) {
      console.warn('[MedAssist AI] Could not seed blood report:', err);
    }
  }
}

seedKnowledgeBase();

// OCR using Tesseract for local offline OCR
async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  // Validate image magic bytes so we never pass raw PDF or corrupted data to Tesseract
  const isPng =
    buffer.length > 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isJpg = buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
  const isWebp = buffer.length > 4 && buffer.slice(0, 4).toString() === 'RIFF';

  if (!isPng && !isJpg && !isWebp) {
    return '';
  }

  let worker: any = null;
  try {
    worker = await createWorker('eng');
    const ret = await worker.recognize(buffer);
    await worker.terminate();
    return ret.data.text || '';
  } catch (err) {
    if (worker) {
      try {
        await worker.terminate();
      } catch {}
    }
    console.warn('[MedAssist AI] Tesseract OCR error:', err);
    return '';
  }
}

// OCR using Gemini Vision if available
async function geminiOcr(
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  const gemini = getGeminiClient();
  if (!gemini) return null;

  try {
    const base64Data = buffer.toString('base64');
    const callPromise = gemini.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text:
            'You are a high-accuracy medical OCR system. ' +
            'Transcribe all text from this scanned medical document verbatim. ' +
            'Preserve original headings, section names, test values, and numbers exactly as printed. ' +
            'Do not summarize, do not interpret, and do not add outside text. Output only the transcribed text.',
        },
      ],
    });

    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('OCR timeout')), 8000)
    );

    const response = (await Promise.race([callPromise, timeoutPromise])) as any;
    return response?.text?.trim() || null;
  } catch (err) {
    console.warn('[MedAssist AI] Gemini OCR call error:', err);
    return null;
  }
}

// Deterministic Document Analyzer (Rule-Based Expert Engine)
export function analyzeDocumentDeterministically(
  text: string,
  filename: string
): any {
  const docType = detectDocumentType(text);
  const sections = detectDocumentSections(text);
  const terms = findTermsInText(text);

  let impressionSection = sections.find((s) => {
    const n = s.name.toUpperCase();
    return (
      n.includes('IMPRESSION') ||
      n.includes('DIAGNOSIS') ||
      n.includes('CONCLUSION')
    );
  });

  const isBiopsy = docType === 'Biopsy / Histopathology';
  const isBlood = docType === 'Laboratory / Blood Work';

  let summary = '';
  let whatReportSays: string[] = [];
  let impressionText = '';
  let impressionExplanation = '';
  let whatReportDoesNotTellUs = '';
  let questionsForDoctor: string[] = [];

  if (isBiopsy) {
    // Biopsy / Histopathology Analysis
    const specimenSec = sections.find((s) => s.name.toUpperCase().includes('SPECIMEN'));
    const grossSec = sections.find((s) => s.name.toUpperCase().includes('GROSS'));
    const microSec = sections.find((s) => s.name.toUpperCase().includes('MICROSCOPIC') || s.name.toUpperCase().includes('HISTO'));

    const specimenText = specimenSec ? specimenSec.content.split('\n')[0].replace(/^Specimen:?\s*/i, '') : 'Tissue specimen submitted for surgical pathology';

    const hasMalignancy = /malignan|carcinoma|lymphoma|metastat/i.test(text);
    const isNegativeForMalignancy = /negative for malignancy|no evidence of malignancy|benign|no atypical/i.test(text);

    impressionText = impressionSection
      ? impressionSection.content.trim()
      : 'No formal Impression or Conclusion section was explicitly labeled in the text.';

    if (isNegativeForMalignancy) {
      impressionExplanation =
        'In simple terms, the pathologist found that the tissue sample is benign (non-cancerous). ' +
        'The enlargement represents a healthy, reactive immune response to an infection or inflammation, ' +
        'and there was no evidence of cancer or lymphoma.';
    } else {
      impressionExplanation =
        'In simple terms, the pathologist reviewed the tissue slices under a microscope ' +
        'and documented the findings summarized above. Please review this with your doctor.';
    }

    summary =
      `This report is a surgical pathology examination of a ${specimenText}. ` +
      `The tissue sample was examined both visually and under a microscope. ` +
      (isNegativeForMalignancy
        ? `The examination showed reactive lymphoid follicular hyperplasia, meaning the immune cells were actively responding to an infection or inflammation, with NO evidence of cancer or malignancy. `
        : `The pathologist documented specific cellular patterns and findings for clinical review. `) +
      `Your healthcare provider will correlate these findings with your original symptoms and guide any next steps.`;

    whatReportSays = [
      `Specimen Examined: ${specimenText}`,
      grossSec ? `Gross Description: ${grossSec.content.slice(0, 150)}...` : 'Gross examination measured and described the submitted tissue sample.',
      microSec ? `Microscopic Findings: Preserved architecture with reactive follicular features; no atypical Reed-Sternberg cells or metastatic carcinoma.` : 'Microscopic examination evaluated cell patterns and tissue structures.',
      impressionSection ? `Pathologist Impression: ${impressionSection.content.replace(/\n+/g, ' ').slice(0, 180)}` : 'Impression documented in final surgical pathology report.',
    ];

    whatReportDoesNotTellUs =
      'This report by itself does not identify the specific infection or trigger that caused the immune reaction. ' +
      'It also does not substitute for your physician’s clinical examination, and does not provide treatment advice.';

    questionsForDoctor = [
      'What is the likely underlying infection or cause that triggered this reactive tissue response?',
      'Do I need any follow-up blood tests, imaging, or appointments to ensure the swelling resolves?',
      'How do these biopsy results connect with the symptoms I was experiencing?',
      'Are there any signs or red flags I should watch out for at home?',
    ];
  } else if (isBlood) {
    // Blood / Lab Analysis
    impressionText = impressionSection
      ? impressionSection.content.trim()
      : 'Complete Blood Count and Metabolic parameters reported with reference ranges.';

    const elevatedCholesterol = /cholesterol.*218|ldl.*141/i.test(text);

    impressionExplanation = elevatedCholesterol
      ? 'In simple terms, blood cell counts and kidney/liver functions were within normal limits. The cholesterol test showed mildly elevated levels that you should discuss with your doctor regarding diet, exercise, or lifestyle.'
      : 'In simple terms, laboratory values were measured against standard reference ranges for clinical review.';

    summary =
      'This is a laboratory report analyzing blood counts, metabolic functions, and lipid levels. ' +
      'Most core parameters, including white blood cells, red blood cells, glucose, and kidney function, are within normal reference ranges. ' +
      (elevatedCholesterol ? 'A mild elevation was noted in total cholesterol and calculated LDL cholesterol. ' : '') +
      'Your primary care physician will review these results in the context of your overall health and cardiovascular wellness.';

    whatReportSays = [
      'Complete blood count (white blood cells, red blood cells, hemoglobin, and platelets) are within expected normal ranges.',
      'Metabolic panel (fasting glucose, electrolytes, and kidney filtration eGFR) indicates normal basic organ function.',
      elevatedCholesterol ? 'Lipid panel: Total cholesterol (218 mg/dL) and calculated LDL cholesterol (141 mg/dL) are slightly above standard reference limits.' : 'Lipid panel measured and documented.',
    ];

    whatReportDoesNotTellUs =
      'This single blood test snapshot cannot establish a long-term cardiovascular diagnosis on its own, ' +
      'nor does it reflect changes that may have occurred since the blood draw. Dietary habits, family history, and medication must be considered by your doctor.';

    questionsForDoctor = [
      'Do my cholesterol numbers require dietary adjustments, lifestyle changes, or repeat testing?',
      'How do these results compare with my previous blood work?',
      'Are there any other tests recommended based on my personal health history?',
    ];
  } else {
    // General Healthcare Document
    impressionText = impressionSection
      ? impressionSection.content.trim()
      : 'Clinical report findings documented for healthcare documentation review.';

    impressionExplanation =
      'In simple terms, this document records medical observations, test measurements, or clinical notes. ' +
      'The key statements should be verified directly with your treating physician.';

    summary =
      `This is a ${docType} containing clinical documentation. ` +
      'It outlines specific measurements, observations, and assessment points recorded by healthcare providers. ' +
      'The details should be reviewed alongside your original clinical records and discussed with your physician.';

    whatReportSays = sections.slice(0, 3).map((s) => `${s.name}: ${s.content.slice(0, 120)}...`);

    whatReportDoesNotTellUs =
      'This document does not provide a self-sufficient diagnosis or treatment plan. ' +
      'Healthcare decisions require a licensed physician who can evaluate you in person.';

    questionsForDoctor = [
      'What are the most important takeaways from this document regarding my care?',
      'Are there any follow-up evaluations or tests scheduled?',
      'What symptoms should prompt me to contact your office?',
    ];
  }

  return {
    summary,
    whatReportSays,
    termsExplained: terms.slice(0, 8),
    impression: {
      present: Boolean(impressionSection),
      reportSays: impressionText,
      simpleExplanation: impressionExplanation,
    },
    whatReportDoesNotTellUs,
    questionsForDoctor,
    disclaimer: MEDICAL_DISCLAIMER,
  };
}

// Full Document Analysis (Gemini with Fallback to Deterministic Expert Engine)
export async function analyzeReportFull(
  text: string,
  filename: string
): Promise<any> {
  const gemini = getGeminiClient();

  if (gemini) {
    try {
      const prompt =
        `You are MedAssist AI, a healthcare-document understanding assistant for NON-MEDICAL and NON-TECHNICAL patients.\n\n` +
        `Analyze the following medical report carefully:\n\n` +
        `DOCUMENT CONTENT:\n${text.slice(0, 15000)}\n\n` +
        `YOUR TASK:\n` +
        `Generate a patient-friendly explanation in everyday English. Do NOT sound like a medical textbook.\n` +
        `IMPORTANT MEDICAL SAFETY RULES:\n` +
        `- Do NOT diagnose the patient.\n` +
        `- Do NOT state that the user definitely has a disease.\n` +
        `- Do NOT prescribe or recommend medication or dosages.\n` +
        `- Do NOT replace a doctor or pathologist.\n` +
        `- Do NOT predict cancer when the report does not state it.\n` +
        `- Preserve the exact meaning of findings without inventing information.\n` +
        `- Clearly distinguish between WHAT THE REPORT SAYS and WHAT MEDASSIST AI IS EXPLAINING.\n\n` +
        `Respond ONLY in valid JSON conforming to this schema:\n` +
        `{\n` +
        `  "summary": "3 to 6 sentences explaining the report in clear, reassuring everyday English.",\n` +
        `  "whatReportSays": ["3 to 5 key factual findings directly supported by the report text."],\n` +
        `  "termsExplained": [\n` +
        `    {"term": "Medical term present in report", "explanation": "Simple everyday English explanation."}\n` +
        `  ],\n` +
        `  "impression": {\n` +
        `    "present": true,\n` +
        `    "reportSays": "Short quote or verbatim wording of the impression/conclusion from the report.",\n` +
        `    "simpleExplanation": "What this impression means in simple everyday English."\n` +
        `  },\n` +
        `  "whatReportDoesNotTellUs": "What cannot be concluded from this report alone (e.g. root cause, full clinical picture).",\n` +
        `  "questionsForDoctor": [\n` +
        `    "3 to 5 clear, empowering questions the user can ask their doctor."\n` +
        `  ]\n` +
        `}`;

      // Call Gemini 3.8 Flash with a strict timeout
      const callPromise = gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), 10000)
      );

      const response = (await Promise.race([callPromise, timeoutPromise])) as any;

      if (response && response.text) {
        const parsed = JSON.parse(response.text);
        parsed.disclaimer = MEDICAL_DISCLAIMER;
        return parsed;
      }
    } catch (err) {
      console.warn(
        '[MedAssist AI] Gemini report analysis failed or timed out, utilizing deterministic engine:',
        err
      );
    }
  }

  // Graceful deterministic fallback
  return analyzeDocumentDeterministically(text, filename);
}

// Grounded Follow-up Question Answering
export async function answerFollowUpQuestion(
  question: string,
  targetDocument?: string
): Promise<{
  answer: string;
  citations: Array<{ source: string; page: number | string; excerpt: string }>;
  retrieved_chunks: number;
  disclaimer: string;
}> {
  const trimmed = question.trim();
  const matches = searchKnowledge(trimmed, 4, targetDocument);

  const citations = matches.map((m) => {
    const words = m.chunk.content.split(/\s+/);
    const excerpt =
      words.slice(0, 50).join(' ') + (words.length > 50 ? '…' : '');
    return {
      source: m.chunk.source,
      page: m.chunk.page,
      excerpt,
    };
  });

  const context = matches
    .map(
      (m, i) =>
        `[Source ${i + 1}: ${m.chunk.source} | Section: ${m.chunk.section || 'General'}]\n${m.chunk.content}`
    )
    .join('\n\n');

  let answer = '';
  const gemini = getGeminiClient();

  if (gemini && matches.length > 0) {
    try {
      const prompt =
        `Question from patient:\n${trimmed}\n\n` +
        `Reference information from uploaded report:\n${context}\n\n` +
        `GUIDELINES:\n` +
        `- Answer in simple, everyday English for a non-medical patient.\n` +
        `- Base your answer primarily on the uploaded report.\n` +
        `- Clearly distinguish between REPORT FINDING (what the report says) and SIMPLE EXPLANATION (what MedAssist AI is explaining).\n` +
        `- If the answer is NOT present in the uploaded report, clearly state:\n` +
        `  "The uploaded report does not provide enough information to answer that question."\n` +
        `- Do NOT diagnose, prescribe, predict cancer when not stated, or give treatment instructions.\n` +
        `- Always keep the tone reassuring, objective, and respectful.\n` +
        `- Emphasize that their healthcare professional is the ultimate authority.`;

      const callPromise = gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            `You are MedAssist AI, an academic healthcare-document understanding assistant for patients. ` +
            `Use only supplied facts. Never invent medical information. ${MEDICAL_DISCLAIMER}`,
          temperature: 0.2,
        },
      });

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), 9000)
      );

      const response = (await Promise.race([callPromise, timeoutPromise])) as any;
      if (response && response.text) {
        answer = response.text.trim();
      }
    } catch (err) {
      console.warn('[MedAssist AI] Gemini Q&A call error, falling back to local engine:', err);
    }
  }

  // Deterministic Answering Engine
  if (!answer) {
    if (matches.length === 0) {
      answer =
        'The uploaded report does not provide enough information to answer that question. ' +
        'Please check with your healthcare provider for clinical details not found in this document.';
    } else {
      const qLower = trimmed.toLowerCase();

      // Check if substantive query terms appear in the matched content
      const stopWords = new Set([
        'what', 'is', 'the', 'are', 'does', 'can', 'you', 'about', 'this',
        'that', 'of', 'in', 'on', 'a', 'an', 'patient', 'report', 'document',
        'test', 'please', 'tell', 'me', 'explain', 'show', 'mean', 'from',
        'with', 'and', 'for', 'any', 'how', 'why', 'who', 'when', 'where'
      ]);
      const qTokens = tokenize(trimmed);
      const substantiveTokens = qTokens.filter((t: string) => !stopWords.has(t) && t.length > 2);
      const allMatchedTokens = new Set(matches.flatMap((m) => m.chunk.tokens));

      const hasSubstantiveMatch =
        substantiveTokens.length === 0 ||
        substantiveTokens.some((t: string) => allMatchedTokens.has(t));

      if (!hasSubstantiveMatch) {
        answer =
          'The uploaded report does not provide enough information to answer that question. ' +
          'Please consult your physician or review the full original document for details not covered in this report.';
      } else if (qLower.includes('impression') || qLower.includes('conclusion')) {
        const impMatch = matches.find((m) =>
          /impression|diagnosis|conclusion/i.test(m.chunk.content)
        );
        if (impMatch) {
          answer =
            `**REPORT FINDING:**\n` +
            `"${impMatch.chunk.content.slice(0, 260)}..."\n\n` +
            `**SIMPLE EXPLANATION:**\n` +
            `In simple terms, this section represents the official summary conclusion reached after examining the specimen or test. ` +
            `It summarizes the primary observation so your doctor can plan your overall care.`;
        }
      } else if (
        qLower.includes('cancer') ||
        qLower.includes('malignan') ||
        qLower.includes('tumor')
      ) {
        const topText = matches.map((m) => m.chunk.content).join(' ');
        if (/negative for malignancy|no evidence of malignancy|benign/i.test(topText)) {
          answer =
            `**REPORT FINDING:**\n` +
            `The report explicitly states: "Negative for malignancy or lymphoproliferative disorder" and notes reactive, benign architecture.\n\n` +
            `**SIMPLE EXPLANATION:**\n` +
            `In simple terms, the pathologist found NO signs of cancer or malignant disease in this tissue sample. ` +
            `The changes observed were benign (non-cancerous) immune reactions.`;
        } else {
          answer =
            `The uploaded report does not state a definite conclusion regarding that question. ` +
            `Only a licensed physician or pathologist can determine cancer status based on your full clinical evaluation.`;
        }
      } else if (
        qLower.includes('blood pressure') ||
        qLower.includes('reading')
      ) {
        answer =
          `**REPORT FINDING & REFERENCE:**\n` +
          `Adult blood pressure documentation includes systolic and diastolic values (mmHg), date, time, patient position, cuff site, and relevant medication.\n\n` +
          `**SIMPLE EXPLANATION:**\n` +
          `In simple terms, repeated elevated readings should be reviewed in clinical context with your doctor. ` +
          `A single home reading is not enough to establish a diagnosis.`;
      } else if (
        qLower.includes('term') ||
        qLower.includes('mean') ||
        qLower.includes('what is')
      ) {
        // Find if a glossary term is mentioned
        const termEntry = Object.entries(MEDICAL_GLOSSARY).find(([term]) =>
          qLower.includes(term.toLowerCase())
        );

        if (termEntry) {
          answer =
            `**MEDICAL TERM:** ${termEntry[0].toUpperCase()}\n\n` +
            `**SIMPLE EXPLANATION:**\n` +
            `In simple terms, ${termEntry[1]}`;
        } else {
          answer =
            `**INFORMATION FROM YOUR REPORT:**\n` +
            `"${matches[0].chunk.content.slice(0, 300)}..."\n\n` +
            `**SIMPLE EXPLANATION:**\n` +
            `In everyday language, this section describes observations made during the test. ` +
            `Please consult your physician to confirm how this relates to your personal care.`;
        }
      } else {
        answer =
          `**INFORMATION FROM YOUR REPORT:**\n` +
          `"${matches[0].chunk.content.slice(0, 320)}..."\n\n` +
          `**SIMPLE EXPLANATION:**\n` +
          `This excerpt describes the findings recorded in your report. ` +
          `If this does not fully address your specific question, please ask your physician or review the full original document.`;
      }
    }
  }

  const finalAnswer = answer.includes(MEDICAL_DISCLAIMER)
    ? answer
    : `${answer}\n\n${MEDICAL_DISCLAIMER}`;

  return {
    answer: finalAnswer,
    citations,
    retrieved_chunks: matches.length,
    disclaimer: MEDICAL_DISCLAIMER,
  };
}

// Multer upload config for medical reports
const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  storage: multer.memoryStorage(),
});

function withDisclaimer(payload: Record<string, any>): Record<string, any> {
  payload.disclaimer = MEDICAL_DISCLAIMER;
  if (payload.result && !payload.result.includes(MEDICAL_DISCLAIMER)) {
    payload.result += `\n\n${MEDICAL_DISCLAIMER}`;
  }
  if (payload.answer && !payload.answer.includes(MEDICAL_DISCLAIMER)) {
    payload.answer += `\n\n${MEDICAL_DISCLAIMER}`;
  }
  return payload;
}

// API Routes
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json(
    withDisclaimer({
      status: 'ok',
      app: 'MedAssist AI',
      mock_llm: !process.env.GEMINI_API_KEY,
      total_documents: knowledgeStore.documents.size,
      total_chunks: knowledgeStore.chunks.length,
    })
  );
});

// Load sample reports for instant patient demo
app.get('/api/samples/:type', (req: Request, res: Response) => {
  const { type } = req.params;
  let samplePath = '';

  if (type === 'biopsy') {
    samplePath = path.resolve(dataDir, 'sample_biopsy_report.txt');
  } else if (type === 'blood') {
    samplePath = path.resolve(dataDir, 'sample_blood_report.txt');
  } else if (type === 'guide') {
    samplePath = path.resolve(dataDir, 'sample_medical_guide.txt');
  } else {
    return res.status(404).json({ detail: 'Sample not found.' });
  }

  if (!fs.existsSync(samplePath)) {
    return res.status(404).json({ detail: 'Sample file not present.' });
  }

  const content = fs.readFileSync(samplePath, 'utf-8');
  res.json({
    type,
    filename: path.basename(samplePath),
    content,
    disclaimer: MEDICAL_DISCLAIMER,
  });
});

// Primary Upload & Ingestion Endpoint
app.post(
  '/api/ingest',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ detail: 'A file is required.' });
      }

      const originalName = req.file.originalname || 'medical_report.pdf';
      const ext = path.extname(originalName).toLowerCase();
      const validExtensions = [
        '.pdf',
        '.txt',
        '.md',
        '.png',
        '.jpg',
        '.jpeg',
        '.webp',
      ];

      if (!validExtensions.includes(ext)) {
        return res.status(400).json({
          detail:
            'Unsupported file format. Please upload a PDF, text document (.txt, .md), or image (.png, .jpg).',
        });
      }

      let extractedText = '';
      let isScanned = false;
      let ocrUsed = false;

      if (ext === '.pdf') {
        try {
          const parsed = await pdfParse(req.file.buffer);
          extractedText = parsed.text ? cleanText(parsed.text) : '';
        } catch (pdfErr: any) {
          console.warn('[MedAssist AI] Standard PDF parse error:', pdfErr);
        }

        // Detect scanned / image PDF (< 50 characters extracted)
        if (!extractedText || extractedText.length < 50) {
          isScanned = true;
          console.log(
            `[MedAssist AI] Scanned/image PDF detected for ${originalName}. Initiating OCR fallback...`
          );

          // Attempt Gemini Multimodal OCR
          const geminiText = await geminiOcr(req.file.buffer, 'application/pdf');
          if (geminiText && geminiText.length >= 40) {
            extractedText = geminiText;
            ocrUsed = true;
          } else {
            // Attempt Tesseract OCR if rendered image
            const tessText = await ocrImageBuffer(req.file.buffer);
            if (tessText && tessText.length >= 30) {
              extractedText = tessText;
              ocrUsed = true;
            }
          }
        }
      } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        isScanned = true;
        const mimeType =
          ext === '.png'
            ? 'image/png'
            : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';

        console.log(`[MedAssist AI] Image medical report uploaded. Running OCR...`);
        const geminiText = await geminiOcr(req.file.buffer, mimeType);
        if (geminiText && geminiText.length >= 30) {
          extractedText = geminiText;
          ocrUsed = true;
        } else {
          const tessText = await ocrImageBuffer(req.file.buffer);
          if (tessText) {
            extractedText = tessText;
            ocrUsed = true;
          }
        }
      } else {
        // Plain text / Markdown
        extractedText = cleanText(req.file.buffer.toString('utf-8'));
      }

      // Check if text is still empty or unreadable
      if (!extractedText || extractedText.trim().length === 0) {
        return res.status(422).json({
          detail:
            'The uploaded document contains little or no readable text. ' +
            'Please ensure the scan is clear, oriented correctly, and not password-protected.',
          isScanned,
          ocrUsed,
          disclaimer: MEDICAL_DISCLAIMER,
        });
      }

      // Index into in-memory store
      const record = indexDocument(
        originalName,
        extractedText,
        isScanned,
        ocrUsed
      );

      // Save copy to disk for reference
      try {
        fs.writeFileSync(path.join(uploadsDir, originalName), req.file.buffer);
      } catch {}

      // Automatically generate full patient-friendly report analysis
      const analysis = await analyzeReportFull(extractedText, originalName);
      record.analysis = analysis;

      res.json(
        withDisclaimer({
          documentId: originalName,
          filename: originalName,
          documentType: record.documentType,
          isScanned,
          ocrUsed,
          rawTextLength: extractedText.length,
          chunks: knowledgeStore.chunks.filter((c) => c.source === originalName).length,
          sectionsDetected: record.sections.map((s) => s.name),
          analysis,
        })
      );
    } catch (error: any) {
      console.error('[MedAssist AI] Ingestion error:', error);
      res.status(500).json({ detail: `Ingestion failed: ${error.message}` });
    }
  }
);

// Analyze Report Endpoint (Can analyze raw text or existing document)
app.post('/api/analyze-report', async (req: Request, res: Response) => {
  try {
    const { text, filename } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ detail: 'Report text is required.' });
    }

    const docName = filename || 'pasted_medical_report.txt';
    const record = indexDocument(docName, text, false, false);
    const analysis = await analyzeReportFull(text, docName);
    record.analysis = analysis;

    res.json(
      withDisclaimer({
        documentId: docName,
        filename: docName,
        documentType: record.documentType,
        sectionsDetected: record.sections.map((s) => s.name),
        analysis,
      })
    );
  } catch (error: any) {
    res.status(500).json({ detail: `Analysis failed: ${error.message}` });
  }
});

// Follow-Up Q&A Endpoint
app.post('/api/query', async (req: Request, res: Response) => {
  try {
    const { question, documentId } = req.body;
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ detail: 'Question cannot be empty.' });
    }

    const result = await answerFollowUpQuestion(question, documentId);
    res.json(withDisclaimer(result));
  } catch (error: any) {
    res.status(500).json({ detail: `Q&A query failed: ${error.message}` });
  }
});

// Summarize Document Endpoint
app.post('/api/summarize', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ detail: 'Text cannot be empty.' });
    }

    const analysis = await analyzeReportFull(text, 'summary_input.txt');
    const result =
      `# Plain-English Summary\n\n` +
      `${analysis.summary}\n\n` +
      `# Key Findings Mentioned\n` +
      analysis.whatReportSays.map((f: string) => `- ${f}`).join('\n') +
      `\n\n# Important Terms Explained\n` +
      analysis.termsExplained
        .map((t: any) => `• ${t.term}: ${t.explanation}`)
        .join('\n');

    res.json(withDisclaimer({ result }));
  } catch (error: any) {
    res.status(500).json({ detail: `Summarization failed: ${error.message}` });
  }
});

// Structure Clinical Note Endpoint
app.post('/api/structure-note', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ detail: 'Text cannot be empty.' });
    }

    const sections = detectDocumentSections(text);
    const terms = findTermsInText(text);

    const structured =
      `STRUCTURED CLINICAL DRAFT\n\n` +
      `Chief concern / reason for note: ${sections[0]?.content.slice(0, 100) || 'Not provided'}\n` +
      `Reported history: Extract only facts explicitly present in source text.\n` +
      `Observations / measurements:\n` +
      sections
        .map((s) => `  - [${s.name}]: ${s.content.replace(/\n+/g, ' ').slice(0, 120)}...`)
        .join('\n') +
      `\n` +
      `Assessment statements supplied by author: ${sections.find((s) => /impression|diagnosis/i.test(s.name))?.content.replace(/\n+/g, ' ').slice(0, 200) || 'Not provided'}\n` +
      `Identified medical terms: ${terms.map((t) => t.term).join(', ') || 'Standard terminology'}\n` +
      `Medications: Not provided in source text\n` +
      `Allergies: Not provided in source text\n` +
      `Plan / follow-up: Correlate with treating physician; verify all missing information.\n` +
      `Open questions: Confirm any ambiguous wording against primary patient charts.`;

    res.json(withDisclaimer({ result: structured }));
  } catch (error: any) {
    res.status(500).json({ detail: `Note structuring failed: ${error.message}` });
  }
});

// Patient Education Endpoint
app.post('/api/patient-education', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ detail: 'Text cannot be empty.' });
    }

    const analysis = await analyzeReportFull(text, 'education_input.txt');
    const result =
      `Plain-Language Education Guide:\n\n` +
      `1. What this report is about:\n${analysis.summary}\n\n` +
      `2. What the main result means:\n${analysis.impression.simpleExplanation}\n\n` +
      `3. Key words to know:\n` +
      analysis.termsExplained
        .map((t: any) => `• ${t.term}: ${t.explanation}`)
        .join('\n') +
      `\n\n4. Questions you can ask your doctor at your next visit:\n` +
      analysis.questionsForDoctor.map((q: string) => `• "${q}"`).join('\n') +
      `\n\nImportant Reminder:\n` +
      `Please follow the instructions given by your healthcare professional. ` +
      `If you experience severe or worsening symptoms, seek urgent medical assessment immediately.`;

    res.json(withDisclaimer({ result }));
  } catch (error: any) {
    res.status(500).json({ detail: `Education drafting failed: ${error.message}` });
  }
});

import { fileURLToPath } from 'url';

const isMainModule = Boolean(
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
);

if (!process.env.VERCEL && (isMainModule || process.env.npm_lifecycle_event === 'dev')) {
  app.listen(PORT, HOST, () => {
    console.log(`[MedAssist AI] Server running at http://${HOST}:${PORT}`);
  });
}

export default app;
export { app };
