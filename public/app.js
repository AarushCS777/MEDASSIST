const DISCLAIMER =
  "DISCLAIMER: MedAssist AI is an academic prototype for reference only, " +
  "not certified for diagnosis or treatment. All outputs must be validated " +
  "by a licensed healthcare professional.";

const $ = (id) => document.getElementById(id);

let currentDocumentId = null;

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({ detail: "Invalid server response." }));
  if (!response.ok) {
    throw new Error(data.detail || `Request failed (${response.status})`);
  }
  return data;
}

function setBusy(button, busy, text) {
  if (!button) return;
  button.disabled = busy;
  if (busy) {
    button.dataset.original = button.textContent;
    button.textContent = text;
  } else {
    button.textContent = button.dataset.original || button.textContent;
  }
}

// Navigation Tabs
document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    button.classList.add("active");
    const targetPanel = $(button.dataset.tab);
    if (targetPanel) targetPanel.classList.add("active");
  });
});

// Health check
async function checkHealth() {
  try {
    const data = await api("/api/health");
    const badge = $("healthBadge");
    if (badge) {
      badge.textContent = data.status === "ok" ? "● System Online" : "System Issue";
      badge.style.color = "#86efac";
      badge.title = `${data.total_documents || 0} documents indexed`;
    }
  } catch (error) {
    const badge = $("healthBadge");
    if (badge) {
      badge.textContent = "● Offline (Local Fallback)";
      badge.style.color = "#fcd34d";
    }
  }
}

// Render Document Analysis
function renderAnalysis(data) {
  currentDocumentId = data.documentId || data.filename;

  const container = $("analysisContainer");
  if (!container) return;
  container.classList.remove("hidden");

  // File info
  $("reportFilename").textContent = data.filename || "Uploaded Report";
  $("reportTypeBadge").textContent = data.documentType || "Clinical Document";

  const subinfo = $("reportSubinfo");
  if (subinfo) {
    const scanNotice = data.ocrUsed
      ? "Scanned report detected • OCR applied"
      : "Standard text extraction";
    subinfo.textContent = `${scanNotice} • ${data.sectionsDetected?.length || 0} sections recognized`;
  }

  const ocrBadge = $("ocrBadge");
  if (ocrBadge) {
    if (data.ocrUsed) {
      ocrBadge.classList.remove("hidden");
      ocrBadge.textContent = "OCR Applied";
      ocrBadge.style.color = "#38bdf8";
      ocrBadge.style.borderColor = "#0284c7";
    } else {
      ocrBadge.classList.add("hidden");
    }
  }

  const analysis = data.analysis || {};

  // 1. Simple Summary
  $("summaryText").textContent =
    analysis.summary || "Summary could not be generated from the document.";

  // 2. Impression / Conclusion
  const imp = analysis.impression || {};
  $("impressionReportSays").textContent =
    imp.reportSays || "No explicit Impression or Conclusion section found.";
  $("impressionSimpleExplanation").textContent =
    imp.simpleExplanation || "Consult your physician for diagnosis interpretation.";

  // 3. Important Findings
  const findingsList = $("keyFindingsList");
  findingsList.innerHTML = "";
  const findings = analysis.whatReportSays || [];
  if (findings.length === 0) {
    findingsList.innerHTML = `<li class="text-slate-400">Review findings with treating physician.</li>`;
  } else {
    findings.forEach((finding) => {
      const li = document.createElement("li");
      li.className = "flex items-start gap-2 leading-relaxed";
      li.innerHTML = `<span class="text-sky-400 mt-1">•</span> <span>${escapeHtml(finding)}</span>`;
      findingsList.appendChild(li);
    });
  }

  // 4. Important Terms Table
  const termsBody = $("termsTableBody");
  termsBody.innerHTML = "";
  const terms = analysis.termsExplained || [];
  if (terms.length === 0) {
    termsBody.innerHTML = `<tr><td colspan="2" class="text-slate-400 p-4 text-center">No specialized medical terminology flagged.</td></tr>`;
  } else {
    terms.forEach((t) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="font-semibold text-sky-300 align-top">${escapeHtml(t.term)}</td>
        <td class="text-slate-300 align-top">${escapeHtml(t.explanation)}</td>
      `;
      termsBody.appendChild(tr);
    });
  }

  // 5. What This Report Does NOT Tell Us
  $("whatNotToldText").textContent =
    analysis.whatReportDoesNotTellUs ||
    "This report by itself does not establish a complete medical diagnosis or treatment plan.";

  // 6. Questions for Doctor
  const qList = $("questionsList");
  qList.innerHTML = "";
  const questions = analysis.questionsForDoctor || [];
  questions.forEach((q) => {
    const li = document.createElement("li");
    li.className = "flex items-start gap-2 leading-relaxed";
    li.innerHTML = `<span class="text-emerald-400 mt-1">✓</span> <span>"${escapeHtml(q)}"</span>`;
    qList.appendChild(li);
  });

  // 7. Sections Details
  const secDetails = $("sectionsDetails");
  if (secDetails) {
    secDetails.innerHTML = "";
    if (data.sectionsDetected && data.sectionsDetected.length > 0) {
      const secDiv = document.createElement("div");
      secDiv.innerHTML = `<strong>Recognized Document Sections:</strong> ${data.sectionsDetected.map((s) => `<span class="pill text-xs m-1">${escapeHtml(s)}</span>`).join(" ")}`;
      secDetails.appendChild(secDiv);
    }
    const sourceDiv = document.createElement("div");
    sourceDiv.innerHTML = `<strong>Primary Source:</strong> ${escapeHtml(data.filename)} (${data.rawTextLength || 0} characters analyzed)`;
    secDetails.appendChild(sourceDiv);
  }

  // Scroll to results smoothly
  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

// File Upload
async function handleFileUpload(file) {
  if (!file) return;

  const status = $("uploadStatus");
  status.textContent = `Analyzing ${file.name} (reading document, detecting sections, explaining terms)…`;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const result = await api("/api/ingest", {
      method: "POST",
      body: formData,
    });
    status.textContent = `✓ Document analyzed successfully!`;
    renderAnalysis(result);
  } catch (error) {
    status.textContent = `Analysis note: ${error.message}`;
    console.error("Upload error:", error);
  }
}

// Drop zone event listeners
const dropZone = $("dropZone");
const fileInput = $("fileInput");

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  });
}

if (dropZone) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragging");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });
}

// Sample buttons
async function loadSample(sampleType) {
  const status = $("uploadStatus");
  status.textContent = `Loading ${sampleType} sample report…`;
  try {
    const sample = await api(`/api/samples/${sampleType}`);
    const analysis = await api("/api/analyze-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: sample.content,
        filename: sample.filename,
      }),
    });
    status.textContent = `✓ Loaded and analyzed ${sample.filename}`;
    renderAnalysis(analysis);
  } catch (err) {
    status.textContent = `Error loading sample: ${err.message}`;
  }
}

$("btnSampleBiopsy")?.addEventListener("click", () => loadSample("biopsy"));
$("btnSampleBlood")?.addEventListener("click", () => loadSample("blood"));
$("btnSampleGuide")?.addEventListener("click", () => loadSample("guide"));

// Copy Doctor Questions Button
$("btnCopyQuestions")?.addEventListener("click", () => {
  const listItems = document.querySelectorAll("#questionsList li");
  const texts = Array.from(listItems).map((li) => li.textContent.trim());
  if (texts.length === 0) return;

  const content =
    "Questions for my Doctor (from MedAssist AI):\n\n" +
    texts.join("\n") +
    "\n\n" +
    DISCLAIMER;

  navigator.clipboard.writeText(content).then(() => {
    const btn = $("btnCopyQuestions");
    const orig = btn.textContent;
    btn.textContent = "✓ Copied to clipboard!";
    setTimeout(() => {
      btn.textContent = orig;
    }, 2500);
  });
});

// Jump to Inline Ask
$("btnAskAboutThis")?.addEventListener("click", () => {
  const inlineCard = $("inlineQaCard");
  if (inlineCard) {
    inlineCard.scrollIntoView({ behavior: "smooth" });
    $("inlineQuestionInput")?.focus();
  }
});

// Chat Message Renderer
function addChatMessage(containerId, role, text, citations = []) {
  const container = $(containerId);
  if (!container) return;

  const el = document.createElement("div");
  el.className = `chat ${role}`;

  // Formatted text
  const textDiv = document.createElement("div");
  textDiv.innerHTML = formatMarkdown(text);
  el.appendChild(textDiv);

  if (citations && citations.length > 0) {
    const citeBox = document.createElement("div");
    citeBox.className = "citations";
    citeBox.innerHTML = `<strong>Information from your report:</strong>`;

    citations.forEach((c, idx) => {
      const citeRow = document.createElement("div");
      citeRow.className = "mt-1.5 text-xs text-slate-400";
      citeRow.textContent = `[${idx + 1}] ${c.source}: "${c.excerpt}"`;
      citeBox.appendChild(citeRow);
    });

    el.appendChild(citeBox);
  }

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

// Inline Q&A handler
async function handleInlineQuestion(questionText) {
  const q = questionText.trim();
  if (!q) return;

  addChatMessage("inlineChatWindow", "user", q);
  const input = $("inlineQuestionInput");
  if (input) input.value = "";

  const btn = $("btnInlineAsk");
  setBusy(btn, true, "Searching report…");

  try {
    const response = await api("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: q,
        documentId: currentDocumentId,
      }),
    });
    addChatMessage(
      "inlineChatWindow",
      "assistant",
      response.answer,
      response.citations || []
    );
  } catch (err) {
    addChatMessage(
      "inlineChatWindow",
      "assistant",
      `Error: ${err.message}\n\n${DISCLAIMER}`
    );
  } finally {
    setBusy(btn, false);
  }
}

$("btnInlineAsk")?.addEventListener("click", () => {
  const q = $("inlineQuestionInput")?.value || "";
  handleInlineQuestion(q);
});

$("inlineQuestionInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    $("btnInlineAsk")?.click();
  }
});

// Inline suggestion chips
document.querySelectorAll("#inlineQaCard .suggestion-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const prompt = chip.dataset.prompt;
    if (prompt) {
      handleInlineQuestion(prompt);
    }
  });
});

// Tab 2: General Q&A Assistant
async function handleGeneralQuestion(questionText) {
  const q = questionText.trim();
  if (!q) return;

  addChatMessage("chatWindow", "user", q);
  const input = $("questionInput");
  if (input) input.value = "";

  const btn = $("askButton");
  setBusy(btn, true, "Searching…");

  try {
    const response = await api("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    addChatMessage(
      "chatWindow",
      "assistant",
      response.answer,
      response.citations || []
    );
  } catch (err) {
    addChatMessage(
      "chatWindow",
      "assistant",
      `Error: ${err.message}\n\n${DISCLAIMER}`
    );
  } finally {
    setBusy(btn, false);
  }
}

$("askButton")?.addEventListener("click", () => {
  const q = $("questionInput")?.value || "";
  handleGeneralQuestion(q);
});

$("questionInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    $("askButton")?.click();
  }
});

document.querySelectorAll(".qa-prompt").forEach((chip) => {
  chip.addEventListener("click", () => {
    const prompt = chip.dataset.prompt;
    if (prompt) {
      handleGeneralQuestion(prompt);
    }
  });
});

// Tab 3 & 4 Text Tasks
async function runTextEndpoint(btnId, inputId, outputId, endpoint, busyText) {
  const text = $(inputId)?.value.trim();
  if (!text) {
    $(outputId).textContent = "Please enter some medical report text.";
    return;
  }
  const btn = $(btnId);
  setBusy(btn, true, busyText);

  try {
    const data = await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    $(outputId).textContent = data.result || "No output returned.";
  } catch (err) {
    $(outputId).textContent = `Error: ${err.message}\n\n${DISCLAIMER}`;
  } finally {
    setBusy(btn, false);
  }
}

$("summaryButton")?.addEventListener("click", () =>
  runTextEndpoint(
    "summaryButton",
    "summaryInput",
    "summaryOutput",
    "/api/summarize",
    "Generating Plain Summary…"
  )
);

$("noteButton")?.addEventListener("click", () =>
  runTextEndpoint(
    "noteButton",
    "noteInput",
    "noteOutput",
    "/api/structure-note",
    "Structuring Clinical Note…"
  )
);

$("educationButton")?.addEventListener("click", () =>
  runTextEndpoint(
    "educationButton",
    "educationInput",
    "educationOutput",
    "/api/patient-education",
    "Drafting Patient Guide…"
  )
);

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMarkdown(str) {
  if (!str) return "";
  let escaped = escapeHtml(str);
  // Bold
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Headers
  escaped = escaped.replace(/^### (.*$)/gim, '<h4 class="font-bold text-sky-300 mt-2">$1</h4>');
  escaped = escaped.replace(/^## (.*$)/gim, '<h3 class="font-bold text-sky-400 mt-3 text-base">$1</h3>');
  escaped = escaped.replace(/^# (.*$)/gim, '<h2 class="font-bold text-sky-400 mt-3 text-lg">$1</h2>');
  // Newlines
  escaped = escaped.replace(/\n/g, "<br>");
  return escaped;
}

// Initial call
checkHealth();
