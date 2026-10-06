const DISCLAIMER = "DISCLAIMER: MedAssist AI is an academic prototype for reference only, not certified for diagnosis or treatment. All outputs must be validated by a licensed healthcare professional.";

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({ detail: "Invalid server response." }));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

function setBusy(button, busy, text) {
  button.disabled = busy;
  if (busy) {
    button.dataset.original = button.textContent;
    button.textContent = text;
  } else {
    button.textContent = button.dataset.original || button.textContent;
  }
}

function addChat(role, text, citations = []) {
  const el = document.createElement("div");
  el.className = `chat ${role}`;
  el.textContent = text;
  if (citations.length) {
    const box = document.createElement("div");
    box.className = "citations";
    box.innerHTML = "<strong>Retrieved sources</strong>";
    citations.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "mt-2";
      row.textContent = `${i + 1}. ${c.source} — page ${c.page}: ${c.excerpt}`;
      box.appendChild(row);
    });
    el.appendChild(box);
  }
  $("chatWindow").appendChild(el);
  $("chatWindow").scrollTop = $("chatWindow").scrollHeight;
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    button.classList.add("active");
    $(button.dataset.tab).classList.add("active");
  });
});

async function healthCheck() {
  try {
    const data = await api("/api/health");
    $("healthBadge").textContent = data.status === "ok" ? "● API online" : "API issue";
    $("healthBadge").style.color = "#86efac";
  } catch (error) {
    $("healthBadge").textContent = "● API offline";
    $("healthBadge").style.color = "#fca5a5";
  }
}

async function uploadFile(file) {
  if (!file) return;
  $("uploadStatus").textContent = `Indexing ${file.name}…`;
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await api("/api/ingest", { method: "POST", body: form });
    $("uploadStatus").textContent = `Indexed ${data.chunks} chunks from ${data.documents} source document(s).`;
  } catch (error) {
    $("uploadStatus").textContent = `Upload failed: ${error.message}`;
  }
}

const dropZone = $("dropZone");
$("fileInput").addEventListener("change", (e) => uploadFile(e.target.files[0]));
["dragenter", "dragover"].forEach((event) => dropZone.addEventListener(event, (e) => {
  e.preventDefault();
  dropZone.classList.add("dragging");
}));
["dragleave", "drop"].forEach((event) => dropZone.addEventListener(event, (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragging");
}));
dropZone.addEventListener("drop", (e) => uploadFile(e.dataTransfer.files[0]));

$("askButton").addEventListener("click", async () => {
  const question = $("questionInput").value.trim();
  if (!question) return;
  addChat("user", question);
  $("questionInput").value = "";
  const button = $("askButton");
  setBusy(button, true, "Searching…");
  try {
    const data = await api("/api/query", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ question })
    });
    addChat("assistant", data.answer, data.citations || []);
  } catch (error) {
    addChat("assistant", `Error: ${error.message}\n\n${DISCLAIMER}`);
  } finally {
    setBusy(button, false);
  }
});

$("questionInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("askButton").click();
});

async function runTextTask(buttonId, inputId, outputId, endpoint, busyText) {
  const text = $(inputId).value.trim();
  if (!text) {
    $(outputId).textContent = "Please enter some text.";
    return;
  }
  const button = $(buttonId);
  setBusy(button, true, busyText);
  try {
    const data = await api(endpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ text })
    });
    $(outputId).textContent = data.result;
  } catch (error) {
    $(outputId).textContent = `Error: ${error.message}\n\n${DISCLAIMER}`;
  } finally {
    setBusy(button, false);
  }
}

$("summaryButton").addEventListener("click", () =>
  runTextTask("summaryButton", "summaryInput", "summaryOutput", "/api/summarize", "Summarizing…")
);
$("noteButton").addEventListener("click", () =>
  runTextTask("noteButton", "noteInput", "noteOutput", "/api/structure-note", "Structuring…")
);
$("educationButton").addEventListener("click", () =>
  runTextTask("educationButton", "educationInput", "educationOutput", "/api/patient-education", "Drafting…")
);

healthCheck();
