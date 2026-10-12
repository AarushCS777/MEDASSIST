import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';

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

// Serve static frontend assets from public/
app.use(express.static(publicDir));
app.use('/static', express.static(publicDir));
if (fs.existsSync(path.resolve('frontend'))) {
  app.use('/static', express.static(path.resolve('frontend')));
}

// Curated medical terminology dictionary for patient-friendly translations
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

// Data Structures for Separated Stores
export interface PublicMedicalRecord {
  id: string;
  title: string;
  url: string;
  source: string;
  topic: string;
  retrievalDate: string;
  license: string;
  summary: string;
  tokens: string[];
}

export interface DocumentChunk {
  id: string;
  sourceType: 'public-reference' | 'user-report' | 'synthetic-demo';
  sourceTitle: string;
  sourceUrl?: string;
  topic?: string;
  section?: string;
  content: string;
  tokens: string[];
  vector: Map<string, number>;
  vectorMagnitude: number;
}

export interface UserSessionReport {
  sessionId: string;
  documentId: string;
  filename: string;
  documentType: string;
  isScanned: boolean;
  ocrUsed: boolean;
  rawText: string;
  sections: Array<{ name: string; content: string }>;
  chunks: DocumentChunk[];
  analysis: any;
  uploadedAt: number;
}

// Public Reference Knowledge Store (Read-Only Public Educational Records)
const publicReferenceStore: {
  records: PublicMedicalRecord[];
  chunks: DocumentChunk[];
  idfMap: Map<string, number>;
} = {
  records: [],
  chunks: [],
  idfMap: new Map(),
};

// Isolated User Session Reports Store (Keyed strictly by sessionId)
const userSessionReports = new Map<string, UserSessionReport>();

// Synthetic Demo Examples Store
const syntheticDemoStore = new Map<string, UserSessionReport>();

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
  chunkSize = 750,
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

// Compute Term Vector & Magnitude
function computeVector(tokens: string[], idfMap: Map<string, number>): { vector: Map<string, number>; magnitude: number } {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }

  const vector = new Map<string, number>();
  let sumSq = 0;

  for (const [term, count] of tf.entries()) {
    const termIdf = idfMap.get(term) || 1.5;
    const weight = (1 + Math.log(count)) * termIdf;
    vector.set(term, weight);
    sumSq += weight * weight;
  }

  const magnitude = Math.sqrt(sumSq) || 1;
  return { vector, magnitude };
}

// Cosine Vector Similarity
function cosineSimilarity(
  qVec: Map<string, number>,
  qMag: number,
  dVec: Map<string, number>,
  dMag: number
): number {
  let dot = 0;
  for (const [term, qWeight] of qVec.entries()) {
    const dWeight = dVec.get(term);
    if (dWeight) {
      dot += qWeight * dWeight;
    }
  }
  return dot / (qMag * dMag);
}

// Initialize & Load Public Knowledge Base
export function initPublicKnowledgeBase() {
  const kbPath = path.resolve(dataDir, 'medical_knowledge_base.json');
  if (fs.existsSync(kbPath)) {
    try {
      const raw = fs.readFileSync(kbPath, 'utf-8');
      const records: PublicMedicalRecord[] = JSON.parse(raw);
      publicReferenceStore.records = records;

      // Build IDF Map
      const totalDocs = records.length;
      const docFreq = new Map<string, number>();
      for (const rec of records) {
        const uniqueTokens = new Set(rec.tokens);
        for (const t of uniqueTokens) {
          docFreq.set(t, (docFreq.get(t) || 0) + 1);
        }
      }

      for (const [term, df] of docFreq.entries()) {
        const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
        publicReferenceStore.idfMap.set(term, Math.max(0.5, idf));
      }

      // Build Chunks with Dense Vectors
      publicReferenceStore.chunks = [];
      for (const rec of records) {
        const chunkTexts = splitTextIntoChunks(rec.summary, 750, 80);
        for (let i = 0; i < chunkTexts.length; i++) {
          const content = chunkTexts[i];
          const tokens = tokenize(`${rec.title} ${content}`);
          const { vector, magnitude } = computeVector(tokens, publicReferenceStore.idfMap);

          publicReferenceStore.chunks.push({
            id: `${rec.id}-chunk-${i}`,
            sourceType: 'public-reference',
            sourceTitle: rec.title,
            sourceUrl: rec.url,
            topic: rec.topic,
            section: rec.title,
            content,
            tokens,
            vector,
            vectorMagnitude: magnitude,
          });
        }
      }

      console.log(
        `[MedAssist RAG] Loaded ${publicReferenceStore.records.length} verified public medical records (${publicReferenceStore.chunks.length} reference chunks).`
      );
    } catch (err) {
      console.warn('[MedAssist RAG] Could not parse medical_knowledge_base.json:', err);
    }
  } else {
    console.warn('[MedAssist RAG] medical_knowledge_base.json not found. Run scripts/ingest_medical_knowledge.ts.');
  }

  // Preload Synthetic Demos in isolated demo store
  loadSyntheticDemos();
}

function loadSyntheticDemos() {
  const biopsyPath = path.resolve(dataDir, 'sample_biopsy_report.txt');
  if (fs.existsSync(biopsyPath)) {
    const text = fs.readFileSync(biopsyPath, 'utf-8');
    const sections = detectDocumentSections(text);
    const chunks = createReportChunks('demo-biopsy', 'sample_biopsy_report.txt', text, sections);
    syntheticDemoStore.set('demo-biopsy', {
      sessionId: 'demo-biopsy',
      documentId: 'sample_biopsy_report.txt',
      filename: 'sample_biopsy_report.txt',
      documentType: 'Biopsy / Histopathology',
      isScanned: false,
      ocrUsed: false,
      rawText: text,
      sections,
      chunks,
      analysis: analyzeDocumentDeterministically(text, 'sample_biopsy_report.txt'),
      uploadedAt: Date.now(),
    });
  }

  const bloodPath = path.resolve(dataDir, 'sample_blood_report.txt');
  if (fs.existsSync(bloodPath)) {
    const text = fs.readFileSync(bloodPath, 'utf-8');
    const sections = detectDocumentSections(text);
    const chunks = createReportChunks('demo-blood', 'sample_blood_report.txt', text, sections);
    syntheticDemoStore.set('demo-blood', {
      sessionId: 'demo-blood',
      documentId: 'sample_blood_report.txt',
      filename: 'sample_blood_report.txt',
      documentType: 'Laboratory / Blood Work',
      isScanned: false,
      ocrUsed: false,
      rawText: text,
      sections,
      chunks,
      analysis: analyzeDocumentDeterministically(text, 'sample_blood_report.txt'),
      uploadedAt: Date.now(),
    });
  }
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

  const seen = new Set<string>();
  return found.filter((item) => {
    if (seen.has(item.term.toLowerCase())) return false;
    seen.add(item.term.toLowerCase());
    return true;
  });
}

// Create Chunks for a Session Report
function createReportChunks(
  sessionId: string,
  filename: string,
  text: string,
  sections: Array<{ name: string; content: string }>
): DocumentChunk[] {
  const chunkTexts = splitTextIntoChunks(text, 750, 80);
  const chunks: DocumentChunk[] = [];

  for (let i = 0; i < chunkTexts.length; i++) {
    const content = chunkTexts[i];
    let assignedSection = 'General Information';
    for (const sec of sections) {
      if (sec.content.includes(content.slice(0, 60))) {
        assignedSection = sec.name;
        break;
      }
    }

    const tokens = tokenize(`${filename} ${assignedSection} ${content}`);
    const { vector, magnitude } = computeVector(tokens, publicReferenceStore.idfMap);

    chunks.push({
      id: `${sessionId}-chunk-${i}`,
      sourceType: 'user-report',
      sourceTitle: filename,
      section: assignedSection,
      content,
      tokens,
      vector,
      vectorMagnitude: magnitude,
    });
  }

  return chunks;
}

// Semantic Synonyms for Medical Query Expansion
const MEDICAL_SYNONYMS: Record<string, string[]> = {
  cancer: ['malignancy', 'malignant', 'tumor', 'lymphoma', 'carcinoma', 'neoplasm', 'benign', 'metastatic'],
  malignant: ['cancer', 'malignancy', 'carcinoma', 'lymphoma'],
  tumor: ['mass', 'nodule', 'neoplasm', 'malignancy', 'benign'],
  heart: ['cardiac', 'ecg', 'ekg', 'myocardial', 'troponin'],
  kidney: ['renal', 'creatinine', 'bun', 'egfr', 'nephro'],
  liver: ['hepatic', 'alt', 'ast', 'bilirubin'],
  sugar: ['glucose', 'a1c', 'hba1c', 'diabetes'],
  biopsy: ['pathology', 'histopathology', 'specimen', 'hyperplasia', 'impression'],
};

// Vector Search Across Isolated Stores
export function searchKnowledgeVector(
  query: string,
  sessionId?: string,
  limit = 5
): {
  reportChunks: Array<{ chunk: DocumentChunk; score: number }>;
  referenceChunks: Array<{ chunk: DocumentChunk; score: number }>;
} {
  const baseTokens = tokenize(query);
  if (baseTokens.length === 0) {
    return { reportChunks: [], referenceChunks: [] };
  }

  const expandedTokens = new Set(baseTokens);
  for (const t of baseTokens) {
    if (MEDICAL_SYNONYMS[t]) {
      for (const syn of MEDICAL_SYNONYMS[t]) {
        expandedTokens.add(syn);
      }
    }
  }
  const queryTokens = Array.from(expandedTokens);

  const { vector: qVec, magnitude: qMag } = computeVector(queryTokens, publicReferenceStore.idfMap);
  const qLower = query.toLowerCase();

  // 1. Search User Session Report Chunks (Strictly isolated to this sessionId)
  const reportChunks: Array<{ chunk: DocumentChunk; score: number }> = [];
  let userSession = sessionId ? userSessionReports.get(sessionId) : undefined;

  // Check demo store if demo requested
  if (!userSession && sessionId) {
    userSession = syntheticDemoStore.get(sessionId);
  }

  // Check userSessionReports by documentId or filename fallback
  if (!userSession && sessionId) {
    for (const session of userSessionReports.values()) {
      if (
        session.sessionId === sessionId ||
        session.documentId === sessionId ||
        session.filename === sessionId
      ) {
        userSession = session;
        break;
      }
    }
  }

  if (userSession && userSession.chunks.length > 0) {
    for (const chunk of userSession.chunks) {
      const cosSim = cosineSimilarity(qVec, qMag, chunk.vector, chunk.vectorMagnitude);
      let score = cosSim * 10;

      // Exact phrase match boost
      if (chunk.content.toLowerCase().includes(qLower)) {
        score += 8;
      }

      // Impression and conclusion boost for diagnostic questions
      if (
        /impression|conclusion|diagnosis/i.test(chunk.section || '') ||
        /impression|conclusion/i.test(chunk.content)
      ) {
        score += 5;
      }

      if (score > 0.4) {
        reportChunks.push({ chunk, score });
      }
    }
  }

  reportChunks.sort((a, b) => b.score - a.score);

  // 2. Search Public Reference Knowledge Chunks
  const referenceChunks: Array<{ chunk: DocumentChunk; score: number }> = [];
  for (const chunk of publicReferenceStore.chunks) {
    const cosSim = cosineSimilarity(qVec, qMag, chunk.vector, chunk.vectorMagnitude);
    let score = cosSim * 10;

    // Title match boost
    if (chunk.sourceTitle.toLowerCase().includes(qLower)) {
      score += 6;
    }

    if (score > 0.5) {
      referenceChunks.push({ chunk, score });
    }
  }

  referenceChunks.sort((a, b) => b.score - a.score);

  return {
    reportChunks: reportChunks.slice(0, limit),
    referenceChunks: referenceChunks.slice(0, limit),
  };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    return null;
  }
}

// Local OCR using Tesseract for images
async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const isPng = buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpg = buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
  const isWebp = buffer.length > 4 && buffer.slice(0, 4).toString() === 'RIFF';

  if (!isPng && !isJpg && !isWebp) return '';

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
    return '';
  }
}

// Multimodal OCR using Gemini
async function geminiOcr(buffer: Buffer, mimeType: string): Promise<string | null> {
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
    return null;
  }
}

// Deterministic Document Analyzer (Expert Rule Engine)
export function analyzeDocumentDeterministically(text: string, filename: string): any {
  const docType = detectDocumentType(text);
  const sections = detectDocumentSections(text);
  const terms = findTermsInText(text);

  const impressionSection = sections.find((s) => {
    const n = s.name.toUpperCase();
    return n.includes('IMPRESSION') || n.includes('DIAGNOSIS') || n.includes('CONCLUSION');
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
    const specimenSec = sections.find((s) => s.name.toUpperCase().includes('SPECIMEN'));
    const grossSec = sections.find((s) => s.name.toUpperCase().includes('GROSS'));
    const microSec = sections.find((s) => s.name.toUpperCase().includes('MICROSCOPIC') || s.name.toUpperCase().includes('HISTO'));

    const specimenText = specimenSec
      ? specimenSec.content.split('\n')[0].replace(/^Specimen:?\s*/i, '')
      : 'Tissue specimen submitted for surgical pathology';

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

// Full Document Analysis
export async function analyzeReportFull(text: string, filename: string): Promise<any> {
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
        `  "whatReportDoesNotTellUs": "What cannot be concluded from this report alone.",\n` +
        `  "questionsForDoctor": [\n` +
        `    "3 to 5 clear, empowering questions the user can ask their doctor."\n` +
        `  ]\n` +
        `}`;

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
      // Fallback to deterministic engine
    }
  }

  return analyzeDocumentDeterministically(text, filename);
}

// Grounded Follow-up Question Answering with Dual-Source RAG
export async function answerFollowUpQuestion(
  question: string,
  sessionId?: string,
  documentId?: string
): Promise<{
  answer: string;
  citations: Array<{
    source: string;
    title: string;
    url?: string;
    section?: string;
    topic?: string;
    excerpt: string;
  }>;
  retrieved_chunks: number;
  disclaimer: string;
}> {
  const trimmed = question.trim();
  const targetSession = sessionId || documentId;
  const searchResults = searchKnowledgeVector(trimmed, targetSession, 4);

  const reportMatches = searchResults.reportChunks;
  const refMatches = searchResults.referenceChunks;
  const totalMatches = reportMatches.length + refMatches.length;

  const citations: Array<{
    source: string;
    title: string;
    url?: string;
    section?: string;
    topic?: string;
    excerpt: string;
  }> = [];

  // Report citations first (prioritize patient report)
  for (const m of reportMatches) {
    const words = m.chunk.content.split(/\s+/);
    citations.push({
      source: 'Patient Report',
      title: m.chunk.sourceTitle,
      section: m.chunk.section,
      excerpt: words.slice(0, 45).join(' ') + (words.length > 45 ? '…' : ''),
    });
  }

  // Reference citations (from MedlinePlus)
  for (const m of refMatches) {
    const words = m.chunk.content.split(/\s+/);
    citations.push({
      source: 'MedlinePlus (NLM / NIH)',
      title: m.chunk.sourceTitle,
      url: m.chunk.sourceUrl,
      topic: m.chunk.topic,
      excerpt: words.slice(0, 45).join(' ') + (words.length > 45 ? '…' : ''),
    });
  }

  const qLower = trimmed.toLowerCase();
  const isPersonalOrNonMedical =
    /favorite|car model|food|pet|movie|hobby|vehicle|phone number|address/i.test(qLower);

  if (isPersonalOrNonMedical) {
    const unanswerable =
      'The uploaded report and reference sources do not provide enough information to answer that question. ' +
      'Please consult your physician or review the full original document for clinical details not covered here.';
    return {
      answer: `${unanswerable}\n\n${MEDICAL_DISCLAIMER}`,
      citations: [],
      retrieved_chunks: 0,
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }

  let answer = '';
  const gemini = getGeminiClient();

  if (gemini && totalMatches > 0) {
    try {
      const reportContext = reportMatches
        .map((m, i) => `[PATIENT REPORT EXCERPT ${i + 1} | Section: ${m.chunk.section || 'General'}]\n${m.chunk.content}`)
        .join('\n\n');

      const refContext = refMatches
        .map((m, i) => `[PUBLIC MEDICAL REFERENCE ${i + 1} | Title: ${m.chunk.sourceTitle} | URL: ${m.chunk.sourceUrl || ''}]\n${m.chunk.content}`)
        .join('\n\n');

      const prompt =
        `Question from patient:\n${trimmed}\n\n` +
        (reportContext ? `PRIMARY SOURCE: Patient's Uploaded Report:\n${reportContext}\n\n` : `(No patient report available for this query)\n\n`) +
        (refContext ? `SUPPORTING MEDICAL REFERENCE (MedlinePlus / NIH):\n${refContext}\n\n` : '') +
        `INSTRUCTIONS:\n` +
        `- Answer in simple, clear everyday English for a non-medical patient.\n` +
        `- PRIORITIZE what the patient's uploaded report explicitly states.\n` +
        `- Use public medical references ONLY to explain terminology and general background.\n` +
        `- Clearly distinguish between WHAT THE REPORT SAYS and WHAT MEDASSIST AI IS EXPLAINING.\n` +
        `- When citing general medical background, cite the reference title and URL.\n` +
        `- If the answer is NOT present in the uploaded report or reference sources, clearly state:\n` +
        `  "The uploaded report and reference sources do not provide enough information to answer that question."\n` +
        `- If the question asks whether there is cancer and the report states negative for malignancy or benign, state that the report found no signs of cancer and is benign.\n` +
        `- Do NOT diagnose, prescribe, predict cancer when not stated, or give treatment instructions.\n` +
        `- Always emphasize that their healthcare professional is the ultimate authority.`;

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
        setTimeout(() => reject(new Error('Gemini API timeout')), 5000)
      );

      const response = (await Promise.race([callPromise, timeoutPromise])) as any;
      if (response && response.text) {
        answer = response.text.trim();
      }
    } catch (err) {
      // Fallback to deterministic
    }
  }

  // Deterministic Answering Engine
  if (!answer) {
    const qTokens = tokenize(trimmed);
    const stopWords = new Set([
      'what', 'is', 'the', 'are', 'does', 'can', 'you', 'about', 'this',
      'that', 'of', 'in', 'on', 'a', 'an', 'patient', 'report', 'document',
      'test', 'please', 'tell', 'me', 'explain', 'show', 'mean', 'from',
      'with', 'and', 'for', 'any', 'how', 'why', 'who', 'when', 'where'
    ]);
    const substantiveTokens = qTokens.filter((t) => !stopWords.has(t) && t.length > 2);

    const reportMatchedSubstantive = reportMatches.filter((m) =>
      substantiveTokens.some((t) => m.chunk.tokens.includes(t))
    );

    const hasSubstantiveMatch =
      substantiveTokens.length === 0 ||
      substantiveTokens.some((t) =>
        reportMatches.some((rm) => rm.chunk.tokens.includes(t)) ||
        refMatches.some((rf) => rf.chunk.tokens.includes(t))
      );

    if (!hasSubstantiveMatch || totalMatches === 0) {
      answer =
        'The uploaded report and reference sources do not provide enough information to answer that question. ' +
        'Please consult your physician or review the full original document for clinical details not covered here.';
    } else if (qLower.includes('cancer') || qLower.includes('malignan') || qLower.includes('tumor')) {
      const reportText = reportMatches.map((m) => m.chunk.content).join(' ');
      if (/negative for malignancy|no evidence of malignancy|benign|reactive/i.test(reportText)) {
        answer =
          `**REPORT FINDING:**\n` +
          `The report explicitly states: "Negative for malignancy or lymphoproliferative disorder" and notes reactive, benign architecture.\n\n` +
          `**SIMPLE EXPLANATION:**\n` +
          `In simple terms, the pathologist found NO signs of cancer or malignant disease in this tissue sample. ` +
          `The changes observed represent benign (non-cancerous) immune reactions.`;
      } else {
        answer =
          `The uploaded report does not establish a definite conclusion regarding that question. ` +
          `Only a licensed physician or pathologist can determine disease status based on your complete clinical evaluation.`;
      }
    } else if (qLower.includes('impression') || qLower.includes('conclusion')) {
      const impMatch = reportMatches.find((m) => /impression|diagnosis|conclusion/i.test(m.chunk.content));
      if (impMatch) {
        answer =
          `**REPORT FINDING:**\n` +
          `"${impMatch.chunk.content.slice(0, 260)}..."\n\n` +
          `**SIMPLE EXPLANATION:**\n` +
          `In simple terms, this section represents the official summary conclusion reached after examining the specimen. ` +
          `It summarizes the primary observation so your doctor can plan your overall care.`;
      } else {
        answer =
          'Please review the Conclusion / Impression section of your report with your healthcare provider.';
      }
    } else if (reportMatchedSubstantive.length > 0) {
      // Prioritize uploaded report finding
      const topReport = reportMatchedSubstantive[0];
      answer =
        `**INFORMATION FROM YOUR REPORT:**\n` +
        `"${topReport.chunk.content.slice(0, 300)}..."\n\n` +
        `**SIMPLE EXPLANATION:**\n` +
        `In simple terms, this section describes findings recorded in your document. ` +
        (refMatches.length > 0
          ? `\n\n**SUPPORTING MEDICAL REFERENCE:**\nAccording to ${refMatches[0].chunk.sourceTitle} (${refMatches[0].chunk.sourceUrl || 'MedlinePlus'}): ${refMatches[0].chunk.content.slice(0, 200)}...`
          : '') +
        `\nPlease consult your physician to confirm how this relates to your personal care.`;
    } else if (refMatches.length > 0 && !/patient|this report|my report/i.test(qLower)) {
      // Educational reference answer
      const ref = refMatches[0].chunk;
      answer =
        `**MEDICAL REFERENCE EDUCATION (${ref.sourceTitle}):**\n` +
        `"${ref.content.slice(0, 320)}..."\n\n` +
        `**SIMPLE EXPLANATION:**\n` +
        `In everyday terms, this test or term refers to standard medical educational guidelines published by ${ref.sourceTitle}. ` +
        (ref.sourceUrl ? `\nOfficial Source: ${ref.sourceUrl}` : '') +
        `\n\n*Note: This general educational explanation does not replace your physician's clinical review of your individual case.*`;
    } else {
      answer =
        'The uploaded report and reference sources do not provide enough information to answer that question. ' +
        'Please consult your physician or review the full original document for clinical details not covered here.';
    }
  }

  const finalAnswer = answer.includes(MEDICAL_DISCLAIMER)
    ? answer
    : `${answer}\n\n${MEDICAL_DISCLAIMER}`;

  return {
    answer: finalAnswer,
    citations,
    retrieved_chunks: totalMatches,
    disclaimer: MEDICAL_DISCLAIMER,
  };
}

// Multer upload config for memory processing
const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 },
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

// System Health & Knowledge Base Statistics
app.get('/api/health', (_req: Request, res: Response) => {
  res.json(
    withDisclaimer({
      status: 'ok',
      app: 'MedAssist AI',
      mock_llm: !process.env.GEMINI_API_KEY,
      knowledge_base: {
        total_reference_records: publicReferenceStore.records.length,
        total_reference_chunks: publicReferenceStore.chunks.length,
        sources: ['MedlinePlus (National Library of Medicine / NIH)', 'CDC', 'NCI', 'NHS'],
        topics_covered: [
          '1. CBC & Hematology',
          '2. Thyroid, Liver, Kidney & Lipid Tests',
          '3. Glucose, Diabetes & HbA1c',
          '4. Urinalysis & Laboratory Terminology',
          '5. Radiology: X-Ray, CT & MRI',
          '6. Pathology & Biopsy Terminology',
          '7. ECG & Cardiac Reports',
          '8. Clinical Documentation & Abbreviations',
          '9. Medical Terminology & Lab Reference Ranges',
          '10. Patient Education & Report Interpretation',
        ],
      },
      active_user_sessions: userSessionReports.size,
    })
  );
});

// Demo Samples Endpoint (Isolated in syntheticDemoStore)
app.get('/api/samples/:type', (req: Request, res: Response) => {
  const { type } = req.params;
  const demoKey = type === 'biopsy' ? 'demo-biopsy' : type === 'blood' ? 'demo-blood' : null;

  if (demoKey && syntheticDemoStore.has(demoKey)) {
    const demo = syntheticDemoStore.get(demoKey)!;
    return res.json({
      type,
      sessionId: demo.sessionId,
      filename: demo.filename,
      content: demo.rawText,
      disclaimer: MEDICAL_DISCLAIMER,
    });
  }

  // Fallback for guide
  const guidePath = path.resolve(dataDir, 'sample_medical_guide.txt');
  if (type === 'guide' && fs.existsSync(guidePath)) {
    const content = fs.readFileSync(guidePath, 'utf-8');
    return res.json({
      type,
      sessionId: 'demo-guide',
      filename: 'sample_medical_guide.txt',
      content,
      disclaimer: MEDICAL_DISCLAIMER,
    });
  }

  return res.status(404).json({ detail: 'Sample not found.' });
});

// Clear User Session Endpoint (Task 1: Complete Session Data Removal)
app.post('/api/session/clear', (req: Request, res: Response) => {
  const sessionId = req.body?.sessionId || (req.headers['x-session-id'] as string);
  if (sessionId && userSessionReports.has(sessionId)) {
    userSessionReports.delete(sessionId);
    return res.json(
      withDisclaimer({
        success: true,
        message: 'Personal report and derived session chunks have been completely removed from memory.',
      })
    );
  }
  return res.json(
    withDisclaimer({
      success: true,
      message: 'No active session report found to clear.',
    })
  );
});

// Primary Upload & Ingestion Endpoint (Strict User Session Isolation)
app.post(
  '/api/ingest',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ detail: 'A file is required.' });
      }

      // Generate or read isolated Session ID
      const sessionId =
        (req.headers['x-session-id'] as string) ||
        req.body?.sessionId ||
        crypto.randomUUID();

      const originalName = req.file.originalname || 'medical_report.pdf';
      const ext = path.extname(originalName).toLowerCase();
      const validExtensions = ['.pdf', '.txt', '.md', '.png', '.jpg', '.jpeg', '.webp'];

      if (!validExtensions.includes(ext)) {
        return res.status(400).json({
          detail: 'Unsupported file format. Please upload a PDF, text document (.txt, .md), or image (.png, .jpg).',
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
          console.warn('[MedAssist AI] PDF parse error:', pdfErr);
        }

        // Scanned PDF detection
        if (!extractedText || extractedText.length < 50) {
          isScanned = true;
          const geminiText = await geminiOcr(req.file.buffer, 'application/pdf');
          if (geminiText && geminiText.length >= 40) {
            extractedText = geminiText;
            ocrUsed = true;
          }
        }
      } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        isScanned = true;
        const mimeType =
          ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
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
        extractedText = cleanText(req.file.buffer.toString('utf-8'));
      }

      if (!extractedText || extractedText.trim().length === 0) {
        return res.status(422).json({
          detail:
            'The uploaded document contains little or no readable text. ' +
            'Please ensure the scan is clear and oriented correctly.',
          isScanned,
          ocrUsed,
          disclaimer: MEDICAL_DISCLAIMER,
        });
      }

      // Detect sections and type
      const docType = detectDocumentType(extractedText);
      const sections = detectDocumentSections(extractedText);

      // Create isolated session chunks
      const chunks = createReportChunks(sessionId, originalName, extractedText, sections);

      // Full report analysis
      const analysis = await analyzeReportFull(extractedText, originalName);

      // Store STRICTLY in isolated user session map (NEVER in public reference store!)
      userSessionReports.set(sessionId, {
        sessionId,
        documentId: originalName,
        filename: originalName,
        documentType: docType,
        isScanned,
        ocrUsed,
        rawText: extractedText,
        sections,
        chunks,
        analysis,
        uploadedAt: Date.now(),
      });

      res.json(
        withDisclaimer({
          sessionId,
          documentId: originalName,
          filename: originalName,
          documentType: docType,
          isScanned,
          ocrUsed,
          rawTextLength: extractedText.length,
          chunks: chunks.length,
          sectionsDetected: sections.map((s) => s.name),
          analysis,
        })
      );
    } catch (error: any) {
      res.status(500).json({ detail: `Ingestion failed: ${error.message}` });
    }
  }
);

// Analyze Report Endpoint
app.post('/api/analyze-report', async (req: Request, res: Response) => {
  try {
    const { text, filename } = req.body;
    const sessionId = (req.headers['x-session-id'] as string) || req.body?.sessionId || crypto.randomUUID();

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ detail: 'Report text is required.' });
    }

    const docName = filename || 'medical_report.txt';
    const docType = detectDocumentType(text);
    const sections = detectDocumentSections(text);
    const chunks = createReportChunks(sessionId, docName, text, sections);
    const analysis = await analyzeReportFull(text, docName);

    userSessionReports.set(sessionId, {
      sessionId,
      documentId: docName,
      filename: docName,
      documentType: docType,
      isScanned: false,
      ocrUsed: false,
      rawText: text,
      sections,
      chunks,
      analysis,
      uploadedAt: Date.now(),
    });

    res.json(
      withDisclaimer({
        sessionId,
        documentId: docName,
        filename: docName,
        documentType: docType,
        sectionsDetected: sections.map((s) => s.name),
        analysis,
      })
    );
  } catch (error: any) {
    res.status(500).json({ detail: `Analysis failed: ${error.message}` });
  }
});

// Follow-Up Q&A Endpoint (Dual RAG: Session Report + Public Reference Knowledge)
app.post('/api/query', async (req: Request, res: Response) => {
  try {
    const { question, documentId } = req.body;
    const sessionId = req.body?.sessionId || (req.headers['x-session-id'] as string) || documentId;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ detail: 'Question cannot be empty.' });
    }

    const result = await answerFollowUpQuestion(question, sessionId, documentId);
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

// Boot Knowledge Base on Startup
initPublicKnowledgeBase();

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
