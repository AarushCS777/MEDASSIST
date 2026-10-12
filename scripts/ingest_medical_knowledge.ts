import fs from 'fs';
import path from 'path';

export interface MedicalReferenceRecord {
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

const TOPIC_QUERIES: Array<{ topic: string; queries: string[] }> = [
  {
    topic: '1. CBC & Hematology',
    queries: ['cbc', 'complete blood count', 'hemoglobin test', 'white blood cell count', 'platelets test', 'anemia', 'red blood cells', 'blood count tests', 'hematocrit'],
  },
  {
    topic: '2. Thyroid, Liver, Kidney & Lipid Tests',
    queries: ['thyroid tests', 'liver function tests', 'kidney tests', 'cholesterol levels', 'lipid panel', 'creatinine test', 'blood urea nitrogen', 'alt blood test', 'ast test'],
  },
  {
    topic: '3. Glucose, Diabetes & HbA1c',
    queries: ['blood glucose test', 'a1c test', 'fasting blood sugar', 'diabetes diagnosis', 'glucose tolerance', 'prediabetes tests', 'hypoglycemia'],
  },
  {
    topic: '4. Urinalysis & Laboratory Terminology',
    queries: ['urinalysis', 'urine test', 'protein in urine', 'microscopic urinalysis', 'kidney urine tests', 'laboratory tests', 'how to read lab results'],
  },
  {
    topic: '5. Radiology: X-Ray, CT & MRI',
    queries: ['x-rays', 'ct scan', 'mri scan', 'ultrasound', 'diagnostic imaging', 'chest x-ray', 'abdominal ct scan'],
  },
  {
    topic: '6. Pathology & Biopsy Terminology',
    queries: ['biopsy', 'surgical pathology', 'fine needle aspiration', 'lymph node biopsy', 'skin biopsy', 'benign vs malignant', 'tumor biopsy'],
  },
  {
    topic: '7. ECG & Cardiac Reports',
    queries: ['electrocardiogram', 'ekg ecg', 'echocardiogram', 'cardiac tests', 'stress test heart', 'troponin test'],
  },
  {
    topic: '8. Clinical Documentation & Abbreviations',
    queries: ['hospital discharge', 'medical records', 'understanding medical terminology', 'health records', 'patient rights documentation'],
  },
  {
    topic: '9. Medical Terminology & Lab Reference Ranges',
    queries: ['lab test reference ranges', 'blood chemistry tests', 'comprehensive metabolic panel', 'electrolytes test', 'interpreting test results'],
  },
  {
    topic: '10. Patient Education & Report Interpretation',
    queries: ['talking with your doctor', 'questions to ask your doctor', 'patient health education', 'health literacy', 'diagnostic testing patient guide'],
  },
];

function cleanHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export async function fetchAllVerifiedRecords(): Promise<MedicalReferenceRecord[]> {
  const recordsByUrl = new Map<string, MedicalReferenceRecord>();
  const retrievalDate = new Date().toISOString().split('T')[0];

  console.log('[MedAssist Ingestion] Fetching official records from NLM MedlinePlus...');

  for (const group of TOPIC_QUERIES) {
    console.log(`[MedAssist Ingestion] Querying topic: ${group.topic}...`);
    for (const q of group.queries) {
      try {
        const endpoint = `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(q)}&retmax=20`;
        const res = await fetch(endpoint);
        if (!res.ok) continue;
        const xml = await res.text();

        const docMatches = xml.matchAll(/<document rank="\d+" url="([^"]+)">[\s\S]*?<content name="title">([\s\S]*?)<\/content>[\s\S]*?<content name="FullSummary">([\s\S]*?)<\/content>/g);

        for (const match of docMatches) {
          const docUrl = match[1].trim();
          const rawTitle = match[2];
          const rawSummary = match[3];

          const title = cleanHtml(rawTitle);
          const summary = cleanHtml(rawSummary);

          // Require reasonable length for quality educational record
          if (summary.length >= 100 && !recordsByUrl.has(docUrl)) {
            const id = `nlm-${recordsByUrl.size + 1}`;
            recordsByUrl.set(docUrl, {
              id,
              title,
              url: docUrl,
              source: 'MedlinePlus (National Library of Medicine / NIH)',
              topic: group.topic,
              retrievalDate,
              license: 'U.S. Government Public Domain / NLM Open Access Terms',
              summary,
              tokens: Array.from(new Set(tokenize(`${title} ${summary}`))),
            });
          }
        }
      } catch (err) {
        console.warn(`[MedAssist Ingestion] Error querying ${q}:`, err);
      }
    }
  }

  const results = Array.from(recordsByUrl.values());
  console.log(`[MedAssist Ingestion] Successfully collected ${results.length} unique verified medical records.`);
  return results;
}

async function main() {
  const records = await fetchAllVerifiedRecords();
  const outputPath = path.resolve('data', 'medical_knowledge_base.json');
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2), 'utf-8');
  console.log(`[MedAssist Ingestion] Written to ${outputPath} (${records.length} records)`);
}

if (process.argv[1]?.includes('ingest_medical_knowledge')) {
  main().catch((err) => {
    console.error('Fatal ingestion error:', err);
    process.exit(1);
  });
}
