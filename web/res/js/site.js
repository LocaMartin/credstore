const workerBase = "https://credstore.locamartin.workers.dev";
const googleClientId = "7346060566-39riegeih7sclmbcfenvqg9l2ggn0fnh.apps.googleusercontent.com";
let currentLicense = "";
let adminToken = "";
let pendingCertificateAttachment = null;
let certificatePreviewUrl = "";
let certificatePreviewTimer = 0;
let adminBugReports = [];
const markdownEditors = new Map();

function formData(form) {
  form.querySelectorAll("textarea[data-markdown-editor]").forEach((textarea) => {
    const editor = markdownEditors.get(textarea);
    if (editor) textarea.value = editor.value();
  });
  return Object.fromEntries(new FormData(form).entries());
}

function authHeaders() {
  return adminToken ? { authorization: `Bearer ${adminToken}` } : {};
}

async function postJson(path, body, extraHeaders = {}) {
  const response = await fetch(`${workerBase}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function readFileAsDataUrl(file) {
  if (!file) return "";
  if (file.size > 1024 * 1024) throw new Error("Screenshot must be 1 MB or smaller.");
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Screenshot could not be read."));
    reader.readAsDataURL(file);
  });
}

async function readProofImageAsDataUrl(file) {
  if (!file) return "";
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    throw new Error("Proof image must be PNG or JPG only.");
  }
  return await readFileAsDataUrl(file);
}

function readAttachmentAsDataUrl(file) {
  return readFileAsDataUrl(file);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderList(elementId, items, kind) {
  const element = document.getElementById(elementId);
  if (!element) return;
  if (kind === "bug") {
    renderAdminBugReports(element, items);
    return;
  }
  if (!items.length) {
    element.className = "list empty";
    element.textContent = "No records.";
    return;
  }
  element.className = "list";
  element.innerHTML = items
    .map((item) => {
      const screenshot = item.screenshot
        ? `<a href="${item.screenshot}" target="_blank" rel="noreferrer">Open screenshot</a>`
        : "";
      const message = item.message || item.note || "";
      const renderedMessage = kind === "bug" ? renderMarkdown(message) : escapeHtml(message);
      return `<article class="record">
        <strong>${escapeHtml(item.title || item.name || item.company || item.email || item.id)}</strong>
        <span>${escapeHtml(item.email || item.buyerEmail || "")}</span>
        <span>${escapeHtml(item.severity || item.transactionId || item.paymentReference || "")}</span>
        <div class="markdown-content">${renderedMessage}</div>
        ${item.response ? `<div class="admin-note markdown-content">${renderMarkdown(item.response)}</div>` : ""}
        ${screenshot}
        <small>Chat messages: ${(item.chat || []).length}</small>
        <small>ID: ${escapeHtml(item.id || "")}</small>
        <small>Status: ${escapeHtml(item.status || "new")} ${kind ? `- ${kind}` : ""} ${escapeHtml(item.createdAt || "")}</small>
      </article>`;
    })
    .join("");
}

function reportHackerName(item) {
  return item.name || item.hunterName || item.email || "Reporter";
}

function reportStatus(item) {
  return item.status || "new";
}

function reportSeverity(item) {
  return item.severity || "Informational";
}

function fillFormField(form, name, value) {
  const field = form?.elements?.[name];
  if (field) field.value = value || "";
}

function renderAdminBugReports(element, items) {
  adminBugReports = Array.isArray(items) ? items : [];
  if (!adminBugReports.length) {
    element.className = "vdp-report-list empty";
    element.textContent = "No VDP reports.";
    return;
  }

  element.className = "vdp-report-list";
  element.innerHTML = adminBugReports
    .map((item) => {
      const id = escapeHtml(item.id || "");
      return `<article class="vdp-report-row">
        <button type="button" data-report-action="hacker" data-report-id="${id}">
          <span class="vdp-report-label">Hacker</span>
          <span class="vdp-report-value">${escapeHtml(reportHackerName(item))}</span>
        </button>
        <button type="button" data-report-action="report" data-report-id="${id}">
          <span class="vdp-report-label">Bug report title</span>
          <span class="vdp-report-value">${escapeHtml(item.title || "Untitled report")}</span>
        </button>
        <span class="vdp-report-cell vdp-report-status">
          <span class="vdp-report-label">Report status</span>
          <span class="vdp-report-value">${escapeHtml(reportStatus(item))}</span>
        </span>
        <span class="vdp-report-cell vdp-report-severity">
          <span class="vdp-report-label">Severity</span>
          <span class="vdp-report-value">${escapeHtml(reportSeverity(item))}</span>
        </span>
      </article>`;
    })
    .join("");

  element.querySelectorAll("[data-report-action]").forEach((button) => {
    button.addEventListener("click", () => {
      selectAdminBugReport(button.dataset.reportId, button.dataset.reportAction);
    });
  });
}

function fillAdminReportForms(item) {
  const id = item.id || "";
  const responseForm = document.getElementById("response-form");
  fillFormField(responseForm, "id", id);
  fillFormField(responseForm, "status", reportStatus(item));
  fillFormField(responseForm, "severity", reportSeverity(item));
  fillFormField(responseForm, "response", item.response || "");
  if (responseForm?.elements?.response) {
    markdownEditors.get(responseForm.elements.response)?.value(item.response || "");
  }

  const chatForm = document.getElementById("admin-chat-form");
  fillFormField(chatForm, "id", id);
  renderChat("admin-chat-thread", item.chat || []);

  const certificateForm = document.getElementById("certificate-form");
  fillFormField(certificateForm, "ticketId", id);
  fillFormField(certificateForm, "hunterName", reportHackerName(item));
  fillFormField(certificateForm, "cvssScore", item.cvssScore || "");
  fillFormField(certificateForm, "severity", reportSeverity(item));
  fillFormField(certificateForm, "title", item.title || "");
  fillFormField(certificateForm, "bugDescription", item.message || item.note || "");
  scheduleCertificatePreview(certificateForm);

  const hallForm = document.getElementById("hall-form");
  fillFormField(hallForm, "name", reportHackerName(item));
  fillFormField(hallForm, "severity", reportSeverity(item));
  fillFormField(hallForm, "cvssScore", item.cvssScore || "");
  fillFormField(hallForm, "affectedVersion", item.affectedVersion || "");
  fillFormField(hallForm, "title", item.title || "");
  fillFormField(hallForm, "profileUrl", item.profileUrl || "");
}

function selectAdminBugReport(id, action = "report") {
  const item = adminBugReports.find((report) => String(report.id || "") === String(id || ""));
  if (!item) return;

  const detail = document.getElementById("admin-vdp-detail");
  const title = document.getElementById("admin-vdp-title");
  const meta = document.getElementById("admin-vdp-meta");
  const severity = document.getElementById("admin-vdp-severity");
  const report = document.getElementById("admin-vdp-report");
  if (!detail || !report) return;

  detail.hidden = false;
  if (title) title.textContent = item.title || "Untitled report";
  if (meta) {
    meta.textContent = `${reportHackerName(item)} - ${item.email || "no email"} - ${item.id || "no report id"}`;
  }
  if (severity) severity.textContent = `${reportSeverity(item)} - ${reportStatus(item)}`;

  if (action === "hacker") {
    report.innerHTML = `<div class="report-contact-card">
      <div><span class="vdp-report-label">Mail ID</span><strong>${escapeHtml(item.email || "Not provided")}</strong></div>
      <div><span class="vdp-report-label">Report ID</span><strong>${escapeHtml(item.id || "Not provided")}</strong></div>
      <div><span class="vdp-report-label">Name</span><strong>${escapeHtml(reportHackerName(item))}</strong></div>
    </div>`;
  } else {
    report.innerHTML = renderMarkdown(item.message || item.note || "No report details.");
  }

  fillAdminReportForms(item);
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderHallEntries(elementId, items) {
  const element = document.getElementById(elementId);
  if (!element) return;
  if (!items.length) {
    element.className = "list empty";
    element.textContent = "No public entries yet.";
    return;
  }
  element.className = "list";
  element.innerHTML = items
    .map((item) => {
      const profile = item.profileUrl
        ? `<a href="${escapeHtml(item.profileUrl)}" target="_blank" rel="noreferrer">Researcher profile</a>`
        : "";
      return `<article class="record">
        <strong>${escapeHtml(item.name || item.hunterName || "Security Researcher")}</strong>
        <div class="record-meta">
          <span>${escapeHtml(item.severity || "Informational")}</span>
          ${item.cvssScore ? `<span>CVSS ${escapeHtml(item.cvssScore)}</span>` : ""}
          ${item.affectedVersion ? `<span>${escapeHtml(item.affectedVersion)}</span>` : ""}
        </div>
        <p>${escapeHtml(item.title || "Accepted CredStore security report")}</p>
        ${profile}
        <small>ID: ${escapeHtml(item.id || "")}</small>
      </article>`;
    })
    .join("");
}

function renderAdvisories(elementId, items) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const advisories = items.filter((item) => item.advisory !== false);
  if (!advisories.length) {
    element.className = "list empty";
    element.textContent = "No public advisories yet.";
    return;
  }
  element.className = "list advisory-list";
  element.innerHTML = advisories
    .map((item) => {
      const reporter = item.profileUrl
        ? `<a href="${escapeHtml(item.profileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.name || "Reporter")}</a>`
        : escapeHtml(item.name || "Security Researcher");
      return `<article class="record">
        <strong>${escapeHtml(item.title || "CredStore Security Advisory")}</strong>
        <div class="record-meta">
          <span>${escapeHtml(item.severity || "Informational")}</span>
          ${item.cvssScore ? `<span>CVSS ${escapeHtml(item.cvssScore)}</span>` : ""}
          ${item.affectedVersion ? `<span>Affected: ${escapeHtml(item.affectedVersion)}</span>` : ""}
        </div>
        <p><strong>Reporter:</strong> ${reporter}</p>
        <p><strong>Description:</strong> ${escapeHtml(item.message || "Validated vulnerability report.")}</p>
        <p><strong>Remediation:</strong> ${escapeHtml(item.remediation || "Remediation completed in a patched CredStore release.")}</p>
        <small>Advisory ID: ${escapeHtml(item.id || "")}</small>
      </article>`;
    })
    .join("");
}

function renderMarkdown(value) {
  if (window.marked && window.DOMPurify) {
    window.marked.setOptions({ breaks: true, gfm: true });
    return window.DOMPurify.sanitize(window.marked.parse(String(value || "")));
  }
  return escapeHtml(value)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\n/g, "<br />");
}

function wrapSelection(textarea, before, after = before) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || "text";
  textarea.setRangeText(`${before}${selected}${after}`, start, end, "select");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

function initMarkdownEditors() {
  document.querySelectorAll("textarea[data-markdown-editor]").forEach((textarea) => {
    if (textarea.dataset.editorReady) return;
    textarea.dataset.editorReady = "true";
    if (textarea.closest("#certificate-form")) return;
    if (window.EasyMDE) {
      const editor = new window.EasyMDE({
        element: textarea,
        autofocus: false,
        autosave: { enabled: false },
        forceSync: true,
        maxHeight: "360px",
        minHeight: "160px",
        nativeSpellcheck: true,
        placeholder: textarea.getAttribute("placeholder") || "Write Markdown...",
        renderingConfig: { codeSyntaxHighlighting: false, singleLineBreaks: false },
        shortcuts: { drawTable: null, toggleFullScreen: null, toggleSideBySide: null },
        spellChecker: false,
        status: ["lines", "words"],
        toolbar: [
          "bold",
          "italic",
          "heading",
          "|",
          "quote",
          "unordered-list",
          "ordered-list",
          "code",
          "link",
          "|",
          "preview",
          "guide",
        ],
      });
      markdownEditors.set(textarea, editor);
      return;
    }
    const toolbar = document.createElement("div");
    toolbar.className = "editor-toolbar";
    toolbar.innerHTML = `
      <button type="button" data-md="bold">Bold</button>
      <button type="button" data-md="italic">Italic</button>
      <button type="button" data-md="code">Code</button>
      <button type="button" data-md="link">Link</button>
      <button type="button" data-md="preview">Preview</button>
    `;
    const preview = document.createElement("div");
    preview.className = "markdown-preview";
    preview.hidden = true;
    textarea.before(toolbar);
    textarea.after(preview);
    toolbar.addEventListener("click", (event) => {
      const action = event.target?.dataset?.md;
      if (!action) return;
      if (action === "bold") wrapSelection(textarea, "**");
      if (action === "italic") wrapSelection(textarea, "*");
      if (action === "code") wrapSelection(textarea, "`");
      if (action === "link") wrapSelection(textarea, "[", "](https://example.com)");
      if (action === "preview") {
        preview.hidden = !preview.hidden;
        preview.innerHTML = renderMarkdown(textarea.value || "Nothing to preview.");
      }
    });
    textarea.addEventListener("input", () => {
      if (!preview.hidden) preview.innerHTML = renderMarkdown(textarea.value || "Nothing to preview.");
    });
  });
}

function renderChat(elementId, messages) {
  const element = document.getElementById(elementId);
  if (!element) return;
  if (!messages?.length) {
    element.className = "chat-thread empty";
    element.textContent = "No chat messages yet.";
    return;
  }
  element.className = "chat-thread";
  element.innerHTML = messages
    .map((message) => {
      const attachment = message.attachment
        ? `<a href="${message.attachment.data}" download="${escapeHtml(message.attachment.name)}">Download ${escapeHtml(message.attachment.name)}</a>`
        : "";
      return `<article class="chat-message">
        <strong>${escapeHtml(message.sender || "system")}</strong>
        <div>${renderMarkdown(message.message || "")}</div>
        ${attachment}
        <small>${escapeHtml(message.createdAt || "")}</small>
      </article>`;
    })
    .join("");
}

async function readChatAttachment(form) {
  const file = form.attachment?.files?.[0];
  if (!file) return {};
  const data = await readAttachmentAsDataUrl(file);
  return {
    attachmentName: file.name,
    attachmentData: data,
  };
}

function drawLogoQr(token) {
  currentLicense = token;
  const output = document.getElementById("license-output");
  if (output) output.textContent = token;
  const qr = document.getElementById("qr");
  if (!qr) return;
  qr.innerHTML = "";

  if (!window.QRCode) {
    qr.textContent = "QR engine failed to load.";
    return;
  }

  window.QRCode.toCanvas(token, { width: 336, margin: 3, errorCorrectionLevel: "M" }, (error, canvas) => {
    if (error) {
      qr.innerHTML = '<p class="muted small">QR generation failed. Copy the signed token below instead.</p>';
      return;
    }
    const context = canvas.getContext("2d");
    const logo = new Image();
    logo.onload = () => {
      const size = 48;
      const x = (canvas.width - size) / 2;
      const y = (canvas.height - size) / 2;
      context.fillStyle = "white";
      if (typeof context.roundRect === "function") {
        context.beginPath();
        context.roundRect(x - 8, y - 8, size + 16, size + 16, 14);
        context.fill();
      } else {
        context.fillRect(x - 8, y - 8, size + 16, size + 16);
      }
      context.drawImage(logo, x, y, size, size);
      qr.appendChild(canvas);
    };
    logo.onerror = () => qr.appendChild(canvas);
    logo.src = document.querySelector(".brand img")?.src || "/credstore/res/img/logo.svg";
  });
}

// PDF

let cachedLogoDataUrl = "";

async function loadLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const logoUrl = document.querySelector(".brand img")?.src || "/credstore/web/res/img/logo.svg";
    const response = await fetch(logoUrl);
    const svg = await response.text();
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    cachedLogoDataUrl = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 160;
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Logo rendering failed"));
      };
      image.src = objectUrl;
    });
  } catch {
    cachedLogoDataUrl = "";
  }
  return cachedLogoDataUrl;
}

function setPdfHexColor(pdf, hex, target = "fill") {
  const clean = hex.replace("#", "");
  const parts = clean.match(/.{2}/g)?.map((part) => parseInt(part, 16)) || [255, 255, 255];
  if (target === "draw") pdf.setDrawColor(parts[0], parts[1], parts[2]);
  else pdf.setFillColor(parts[0], parts[1], parts[2]);
}

function interpolateRgb(start, end, ratio) {
  return start.map((value, index) => Math.round(value + (end[index] - value) * ratio));
}

function drawWebsiteGradient(pdf, width, height) {
  const left = [88, 28, 135];
  const middle = [11, 16, 32];
  const right = [29, 78, 216];
  const step = 3;
  for (let x = 0; x <= width; x += step) {
    const ratio = x / width;
    const rgb = ratio < 0.52
      ? interpolateRgb(left, middle, ratio / 0.52)
      : interpolateRgb(middle, right, (ratio - 0.52) / 0.48);
    pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
    pdf.rect(x, 0, step + 1, height, "F");
  }
  pdf.setGState(new pdf.GState({ opacity: 0.22 }));
  setPdfHexColor(pdf, "#8b5cf6");
  pdf.circle(150, 70, 210, "F");
  setPdfHexColor(pdf, "#3b82f6");
  pdf.circle(760, 94, 190, "F");
  pdf.setGState(new pdf.GState({ opacity: 1 }));
}

function sanitizeCertificateText(value, fallback = "") {
  return String(value || fallback)
    .replace(/[#*_`>\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function certificateId(values) {
  const raw = sanitizeCertificateText(values.ticketId || values.id || "");
  if (raw) return raw.toUpperCase();
  const seed = `${values.hunterName || "researcher"}-${values.title || "report"}-${Date.now()}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `CS-VDP-${hash.toString(16).toUpperCase().padStart(8, "0")}`;
}

function renderCertificatePreview(blob, fileName) {
  const preview = document.getElementById("certificate-preview");
  const status = document.getElementById("certificate-preview-status");
  if (!preview) return;
  if (certificatePreviewUrl) URL.revokeObjectURL(certificatePreviewUrl);
  certificatePreviewUrl = URL.createObjectURL(blob);
  preview.innerHTML = "";
  const embedded = window.PDFObject?.embed?.(certificatePreviewUrl, "#certificate-preview", {
    fallbackLink: `<a href="${certificatePreviewUrl}" target="_blank" rel="noopener">Open ${fileName}</a>`,
    height: "620px",
    pdfOpenParams: {
      navpanes: 0,
      toolbar: 0,
      view: "FitH",
    },
  });
  if (!embedded) {
    const iframe = document.createElement("iframe");
    iframe.title = "Certificate PDF preview";
    iframe.src = `${certificatePreviewUrl}#toolbar=0&navpanes=0&view=FitH`;
    iframe.loading = "lazy";
    preview.append(iframe);
  }
  if (status) status.textContent = "PDF preview updated.";
}

function scheduleCertificatePreview(form) {
  if (!form) return;
  window.clearTimeout(certificatePreviewTimer);
  certificatePreviewTimer = window.setTimeout(() => {
    generateCertificatePdf(formData(form), { download: false, quiet: true }).catch(() => {
      const status = document.getElementById("certificate-preview-status");
      if (status) status.textContent = "PDF preview failed to generate.";
    });
  }, 300);
}

async function generateCertificatePdf(values, options = {}) {
  const shouldDownload = options.download !== false;
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    const message = "PDF engine is still loading. Try again in a moment.";
    if (!options.quiet) alert(message);
    const status = document.getElementById("certificate-status");
    if (status) status.textContent = message;
    return;
  }
  const status = document.getElementById("certificate-status");
  if (status && !options.quiet) status.textContent = "Generating premium certificate PDF...";
  const logoDataUrl = await loadLogoDataUrl();
  const id = certificateId(values);
  const hunterName = sanitizeCertificateText(values.hunterName, "Security Researcher");
  const bugTitle = sanitizeCertificateText(values.title, "Accepted CredStore Security Report");
  const bugDescription = sanitizeCertificateText(
    values.bugDescription,
    "Validated vulnerability report accepted by the CredStore Vulnerability Disclosure Program.",
  );
  const note = sanitizeCertificateText(
    values.note,
    "For responsible disclosure and helping improve CredStore security.",
  );
  const severity = sanitizeCertificateText(values.severity, "Informational");
  const cvssScore = sanitizeCertificateText(values.cvssScore, "N/A");
  const issuedAt = new Date().toISOString().slice(0, 10);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  drawWebsiteGradient(pdf, 842, 595);
  pdf.setGState(new pdf.GState({ opacity: 0.88 }));
  setPdfHexColor(pdf, "#0b1020");
  pdf.roundedRect(28, 28, 786, 539, 34, 34, "F");
  pdf.setGState(new pdf.GState({ opacity: 0.72 }));
  setPdfHexColor(pdf, "#18213a");
  pdf.roundedRect(50, 50, 742, 495, 26, 26, "F");
  pdf.setGState(new pdf.GState({ opacity: 1 }));

  setPdfHexColor(pdf, "#c4b5fd", "draw");
  pdf.setLineWidth(2);
  pdf.roundedRect(66, 66, 710, 463, 18, 18, "S");
  pdf.setLineWidth(0.8);
  pdf.line(92, 112, 750, 112);
  pdf.line(92, 482, 750, 482);
  pdf.setLineWidth(3);
  pdf.line(92, 92, 170, 92);
  pdf.line(672, 92, 750, 92);
  pdf.line(92, 504, 170, 504);
  pdf.line(672, 504, 750, 504);

  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, "PNG", 94, 78, 42, 42);
  }

  pdf.setTextColor(248, 250, 252);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("CredStore", logoDataUrl ? 146 : 94, 100);
  pdf.setFontSize(10);
  pdf.setTextColor(196, 181, 253);
  pdf.text(`Certificate ID: ${id}`, 560, 100, { maxWidth: 190 });

  pdf.setTextColor(196, 181, 253);
  pdf.setFontSize(14);
  pdf.text("CERTIFICATE OF APPRECIATION", 421, 152, { align: "center" });
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(42);
  pdf.text("Security Recognition", 421, 206, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  pdf.setTextColor(203, 213, 225);
  pdf.text("Presented to", 421, 242, { align: "center" });

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(34);
  pdf.text(hunterName, 421, 288, { align: "center", maxWidth: 610 });

  pdf.setFontSize(17);
  pdf.setTextColor(248, 250, 252);
  pdf.text(bugTitle, 421, 334, { align: "center", maxWidth: 620 });

  pdf.setFillColor(255, 255, 255);
  pdf.setGState(new pdf.GState({ opacity: 0.08 }));
  pdf.roundedRect(126, 360, 590, 78, 12, 12, "F");
  pdf.setGState(new pdf.GState({ opacity: 1 }));
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(226, 232, 240);
  pdf.text(pdf.splitTextToSize(bugDescription, 540), 151, 386);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(147, 197, 253);
  pdf.text(`Severity: ${severity}`, 151, 460);
  pdf.text(`CVSS: ${cvssScore}`, 332, 460);
  pdf.text(`Issued: ${issuedAt}`, 456, 460);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(203, 213, 225);
  pdf.text(pdf.splitTextToSize(note, 540), 151, 492);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(248, 250, 252);
  pdf.text("CredStore Vulnerability Disclosure Program", 94, 524);
  pdf.setTextColor(196, 181, 253);
  pdf.text("Zero-knowledge offline security project", 574, 524);

  const safeName = String(hunterName || "researcher")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const safeId = id.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const fileName = `credstore-certificate-${safeId || safeName}.pdf`;
  const rawPdfData = pdf.output("datauristring");
  pendingCertificateAttachment = {
    name: fileName,
    data: rawPdfData.replace(/^data:application\/pdf;filename=[^;]+;base64,/i, "data:application/pdf;base64,"),
  };
  const nameInput = document.querySelector("[name='attachmentName']");
  const dataInput = document.querySelector("[name='attachmentData']");
  if (nameInput && dataInput) {
    nameInput.value = pendingCertificateAttachment.name;
    dataInput.value = pendingCertificateAttachment.data;
  }
  renderCertificatePreview(pdf.output("blob"), fileName);
  if (status && !options.quiet) status.textContent = "PDF generated and attached to admin chat.";
  if (shouldDownload) pdf.save(fileName);
}

// Hall of fame

async function loadPublicHall() {
  const hall = document.getElementById("hall-public");
  const advisory = document.getElementById("advisory-public");
  if (!hall && !advisory) return;
  try {
    const response = await fetch(`${workerBase}/hall-of-fame`);
    const data = await response.json();
    renderHallEntries("hall-public", data.items || []);
    renderAdvisories("advisory-public", data.items || []);
  } catch {
    if (hall) hall.textContent = "Hall of fame is unavailable.";
    if (advisory) advisory.textContent = "Security advisories are unavailable.";
  }
}

async function loadAdmin() {
  if (!adminToken) return;
  const status = document.getElementById("admin-status");
  const selectedReportId = document.getElementById("response-form")?.elements?.id?.value || "";
  if (status) status.textContent = "Verifying admin access...";
  const response = await fetch(`${workerBase}/admin/items`, { headers: authHeaders() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Admin load failed.");
  document.body.classList.remove("is-forbidden");
  document.body.classList.add("is-admin");
  renderList("admin-feedback", data.feedback || [], "feedback");
  renderList("admin-complaints", data.complaints || [], "complaint");
  renderList("admin-bugs", data.bugs || [], "bug");
  renderList("admin-hall", data.hall || [], "hall");
  if (selectedReportId) selectAdminBugReport(selectedReportId, "report");
  if (status) status.textContent = `Signed in as ${data.adminEmail}.`;
}

function initKeyPage() {
  const licenseForm = document.getElementById("license-form");
  if (!licenseForm) return;
  const provider = licenseForm.paymentProvider;
  const ref = licenseForm.paymentReference;
  const syncLicenseKind = () => {
    if (licenseForm.kind.value === "trial") {
      provider.value = "trial";
      ref.required = false;
      ref.placeholder = "Not required for free trial";
    } else {
      if (provider.value === "trial") provider.value = "upi";
      ref.required = false;
      ref.placeholder = "UPI/PayPal/Card/Crypto transaction ID";
    }
  };
  licenseForm.kind?.addEventListener("change", syncLicenseKind);
  document.querySelectorAll("[data-payment-provider]").forEach((button) => {
    button.addEventListener("click", () => {
      provider.value = button.dataset.paymentProvider;
      if (licenseForm.kind.value === "trial") licenseForm.kind.value = "lifetime";
      syncLicenseKind();
    });
  });
  syncLicenseKind();
  licenseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("license-status");
    if (status) status.textContent = "Generating signed license...";
    try {
      const data = await postJson("/licenses", formData(event.currentTarget));
      drawLogoQr(data.license);
      if (status) status.textContent = data.message || "License generated. QR includes CredStore logo.";
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "License generation failed.";
    }
  });
  document.getElementById("copy-license")?.addEventListener("click", async () => {
    if (!currentLicense) return;
    await navigator.clipboard.writeText(currentLicense);
    const status = document.getElementById("license-status");
    if (status) status.textContent = "License copied.";
  });
  document.getElementById("download-license")?.addEventListener("click", () => {
    if (!currentLicense) return;
    const blob = new Blob([currentLicense], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "credstore-license.txt";
    link.click();
    URL.revokeObjectURL(url);
  });
}

function initFncPage() {
  document.getElementById("contact-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById("contact-status");
    if (status) status.textContent = "Sending...";
    try {
      const data = await postJson("/contact", formData(form));
      if (status) status.textContent = `Feedback received. Ticket: ${data.id || "created"}`;
      localStorage.setItem("credstore_last_ticket_id", data.id || "");
      form.reset();
      markdownEditors.get(form.message)?.value("");
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Message failed.";
    }
  });

  document.getElementById("complaint-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById("complaint-status");
    if (status) status.textContent = "Submitting...";
    try {
      const values = formData(form);
      values.screenshot = await readFileAsDataUrl(form.screenshot?.files?.[0]);
      const data = await postJson("/complaints", values);
      if (status) status.textContent = `Complaint received. Ticket: ${data.id || values.transactionId}`;
      localStorage.setItem("credstore_last_ticket_id", data.id || "");
      form.reset();
      markdownEditors.get(form.message)?.value("");
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Complaint failed.";
    }
  });
  initPublicTicketChat();
}

function initVdpPage() {
  loadPublicHall();
  document.getElementById("bug-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById("bug-status");
    if (status) status.textContent = "Submitting report...";
    try {
      const values = formData(form);
      values.screenshot = await readProofImageAsDataUrl(form.screenshot?.files?.[0]);
      const data = await postJson("/bugs", values);
      if (status) status.textContent = `Report submitted. Ticket: ${data.id}. Save this ID for follow-up.`;
      localStorage.setItem("credstore_last_ticket_id", data.id || "");
      form.reset();
      markdownEditors.get(form.message)?.value("");
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Bug report failed.";
    }
  });
  initPublicTicketChat();
}

function initTabs() {
  document.querySelectorAll("[data-tabs]").forEach((tabs) => {
    const buttons = Array.from(tabs.querySelectorAll("[data-tab-target]"));
    const panels = Array.from(tabs.querySelectorAll("[data-tab-panel]"));
    if (!buttons.length || !panels.length) return;

    const activeButton = () => buttons.find((button) => button.classList.contains("is-active"));

    const activate = (name) => {
      let selectedButton = null;
      buttons.forEach((button) => {
        const active = button.dataset.tabTarget === name;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
        if (active) selectedButton = button;
      });
      panels.forEach((panel) => {
        const active = panel.dataset.tabPanel === name;
        panel.classList.toggle("is-active", active);
        panel.hidden = !active;
        panel.style.display = active ? "" : "none";
      });
      selectedButton?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
      setTimeout(() => {
        markdownEditors.forEach((editor) => editor.codemirror?.refresh?.());
      }, 0);
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => activate(button.dataset.tabTarget));
    });

    const hashTarget = {
      "#submit": "submit",
      "#program-rules": "rules",
      "#rules": "rules",
      "#ticket-chat": "chat",
      "#chat": "chat",
      "#hall-of-fame": "hall",
      "#hall": "hall",
      "#advisories": "advisories",
      "#advisory": "advisories",
    }[window.location.hash];
    const initial = buttons.find((button) => button.dataset.tabTarget === hashTarget) || activeButton() || buttons[0];
    activate(initial.dataset.tabTarget);
  });

  document.querySelectorAll("[data-tab-jump]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = link.dataset.tabJump;
      const button = document.querySelector(`[data-tab-target="${target}"]`);
      if (!button) return;
      event.preventDefault();
      button.click();
      document.querySelector("[data-tabs]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", link.getAttribute("href") || window.location.pathname);
    });
  });
}

function setStaticPageTitle() {
  if (document.body.classList.contains("admin-page")) {
    document.title = "CredStore Admin";
    return;
  }
  if (document.title.includes("Vulnerability") || document.querySelector(".brand strong")?.textContent?.includes("VDP")) {
    document.title = "CredStore VDP";
  }
}

function safeInit(name, callback) {
  try {
    callback();
  } catch (error) {
    console.error(`CredStore ${name} init failed`, error);
  }
}

function initPublicTicketChat() {
  const chatForm = document.getElementById("ticket-chat-form");
  if (!chatForm) return;
  if (chatForm.ticketId && !chatForm.ticketId.value) {
    chatForm.ticketId.value = localStorage.getItem("credstore_last_ticket_id") || "";
  }
  document.getElementById("ticket-chat-load")?.addEventListener("click", async () => {
    const status = document.getElementById("ticket-chat-status");
    try {
      const response = await fetch(
        `${workerBase}/tickets/chat?id=${encodeURIComponent(chatForm.ticketId.value)}&email=${encodeURIComponent(chatForm.email.value)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chat load failed.");
      renderChat("ticket-chat-thread", data.messages || []);
      if (status) status.textContent = `Ticket status: ${data.status || "new"}`;
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Chat load failed.";
    }
  });
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("ticket-chat-status");
    try {
      const attachment = await readChatAttachment(chatForm);
      const data = await postJson("/tickets/chat", {
        id: chatForm.ticketId.value,
        email: chatForm.email.value,
        message: markdownEditors.get(chatForm.message)?.value() || chatForm.message.value,
        ...attachment,
      });
      renderChat("ticket-chat-thread", data.messages || []);
      chatForm.message.value = "";
      markdownEditors.get(chatForm.message)?.value("");
      if (chatForm.attachment) chatForm.attachment.value = "";
      if (status) status.textContent = "Message sent.";
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Message failed.";
    }
  });
}

function initAdminPage() {
  if (!document.getElementById("google-login")) return;
  document.body.classList.add("is-forbidden");
  if (!window.google?.accounts?.id) return;
  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: async (response) => {
      adminToken = response.credential;
      try {
        await loadAdmin();
      } catch (error) {
        const status = document.getElementById("admin-status");
        if (status) status.textContent = error instanceof Error ? error.message : "403 admin access denied.";
      }
    },
  });
  window.google.accounts.id.renderButton(document.getElementById("google-login"), {
    theme: "filled_black",
    size: "large",
    text: "signin_with",
  });
  document.getElementById("admin-refresh")?.addEventListener("click", () => loadAdmin().catch(() => {}));
  document.getElementById("search-transaction")?.addEventListener("click", async () => {
    const query = document.getElementById("transaction-search").value.trim();
    if (!query || !adminToken) return;
    const response = await fetch(`${workerBase}/admin/search?transactionId=${encodeURIComponent(query)}`, {
      headers: authHeaders(),
    });
    const data = await response.json();
    renderList("admin-complaints", response.ok ? data.items || [] : [], "transaction search");
  });
  const certificateForm = document.getElementById("certificate-form");
  certificateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await generateCertificatePdf(formData(certificateForm));
  });
  certificateForm?.addEventListener("input", () => scheduleCertificatePreview(certificateForm));
  certificateForm?.addEventListener("change", () => scheduleCertificatePreview(certificateForm));
  scheduleCertificatePreview(certificateForm);
  document.getElementById("response-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formData(form);
    const status = document.getElementById("response-status");
    try {
      await postJson("/admin/response", values, authHeaders());
      if (status) status.textContent = "Response saved.";
      await loadAdmin();
      selectAdminBugReport(values.id, "report");
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Response save failed.";
    }
  });
  document.getElementById("save-template")?.addEventListener("click", async () => {
    const status = document.getElementById("admin-status");
    try {
      await postJson("/admin/certificate-template", formData(document.getElementById("certificate-form")), authHeaders());
      if (status) status.textContent = "Certificate template saved.";
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Template save failed.";
    }
  });
  document.getElementById("hall-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("hall-status");
    try {
      await postJson("/admin/hall-of-fame", formData(event.currentTarget), authHeaders());
      if (status) status.textContent = "Hall of fame entry published.";
      event.currentTarget.reset();
      markdownEditors.get(event.currentTarget.message)?.value("");
      markdownEditors.get(event.currentTarget.remediation)?.value("");
      await loadAdmin();
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Publish failed.";
    }
  });
  document.getElementById("admin-chat-load")?.addEventListener("click", async () => {
    const form = document.getElementById("admin-chat-form");
    const status = document.getElementById("admin-chat-status");
    try {
      const response = await fetch(`${workerBase}/admin/ticket/chat?id=${encodeURIComponent(form.id.value)}`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Admin chat load failed.");
      renderChat("admin-chat-thread", data.messages || []);
      if (status) status.textContent = `Ticket status: ${data.status || "new"}`;
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Admin chat load failed.";
    }
  });
  document.getElementById("admin-chat-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById("admin-chat-status");
    try {
      const values = formData(form);
      const data = await postJson("/admin/ticket/chat", values, authHeaders());
      renderChat("admin-chat-thread", data.messages || []);
      const item = adminBugReports.find((report) => String(report.id || "") === String(values.id || ""));
      if (item) item.chat = data.messages || [];
      form.message.value = "";
      form.attachmentName.value = "";
      form.attachmentData.value = "";
      markdownEditors.get(form.message)?.value("");
      pendingCertificateAttachment = null;
      if (status) status.textContent = "Admin chat message sent.";
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Admin chat message failed.";
    }
  });
}

window.addEventListener("load", () => {
  safeInit("tabs", initTabs);
  safeInit("title", setStaticPageTitle);
  safeInit("markdown", initMarkdownEditors);
  safeInit("key page", initKeyPage);
  safeInit("feedback page", initFncPage);
  safeInit("vdp page", initVdpPage);
  safeInit("admin page", initAdminPage);
});
