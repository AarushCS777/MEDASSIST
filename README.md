# MedAssist AI

MedAssist AI is an **academic healthcare-document understanding assistant** built with **Node.js, Express, and TypeScript**. It specializes in explaining complex medical documents—such as **biopsy and histopathology reports, blood and lab test panels, and imaging reports**—in simple, everyday English for patients.

> **DISCLAIMER: MedAssist AI is an academic prototype for reference only, not certified for diagnosis or treatment. All outputs must be validated by a licensed healthcare professional.**

## Features

- **Node.js & Express Architecture**: Pure TypeScript full-stack application with `server.ts` entrypoint.
- **Root-Level `public/` Entry Point**: Static dashboard hosted at `public/index.html` with clean relative assets.
- **Document Understanding Engine**: Section detection for surgical pathology, biopsy, CBC/CMP lab work, and clinical reports.
- **Plain-English Medical Translation**: Compares verbatim pathologist findings with clear, everyday explanations.
- **Important Medical Terms Glossary**: Curated glossary translating complex terminology into simple definitions.
- **Multimodal OCR Fallback**: Transcribes scanned PDF documents and images (`.png`, `.jpg`, `.jpeg`, `.webp`).
- **Grounded Q&A & Safety Guardrails**: Answers patient follow-up questions with source citations; declines unestablished diagnoses.
- **Vercel-Ready**: Preconfigured with `vercel.json` for zero-configuration serverless deployment.

## Project Structure

```text
├── api/
│   └── index.ts                 # Vercel serverless entrypoint
├── data/
│   ├── sample_biopsy_report.txt # Synthetic cervical lymph node biopsy
│   ├── sample_blood_report.txt  # Synthetic complete blood & lipid test
│   └── sample_medical_guide.txt # Reference clinical guideline & glossary
├── public/
│   ├── index.html               # Main frontend dashboard entrypoint
│   ├── style.css                # Healthcare application styling
│   └── app.js                   # Client-side orchestration and Q&A
├── tests/
│   └── verify_medassist.ts      # Automated verification test suite
├── package.json                 # Authoritative project configuration
├── server.ts                    # Backend server & API routes
├── tsconfig.json                # TypeScript configuration
├── vercel.json                  # Vercel deployment configuration
└── README.md
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```env
PORT=3000
HOST=0.0.0.0
GEMINI_API_KEY=your_gemini_api_key_optional
```

*Note: If no API key is provided, MedAssist AI operates in deterministic local mode using its built-in medical dictionary and expert rules.*

### 3. Run Development Server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### 4. Build & Test

```bash
npm run build
npm test
```

## Vercel Deployment

Deploy directly from the repository root to Vercel:

```bash
vercel
```

No manual workarounds or custom output directories are required. `vercel.json` is configured to use `@vercel/node` with `server.ts` as the backend entrypoint.
