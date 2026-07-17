const workerBase = "https://credstore.locamartin.workers.dev";
const googleClientId = "7346060566-39riegeih7sclmbcfenvqg9l2ggn0fnh.apps.googleusercontent.com";
let currentLicense = "";
let adminToken = "";
let pendingCertificateAttachment = null;
const markdownEditors = new WeakMap();

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
      return `<article class="record">
        <strong>${escapeHtml(item.title || item.name || item.company || item.email || item.id)}</strong>
        <span>${escapeHtml(item.email || item.buyerEmail || "")}</span>
        <span>${escapeHtml(item.severity || item.transactionId || item.paymentReference || "")}</span>
        <p>${escapeHtml(item.message || item.note || "")}</p>
        ${item.response ? `<p class="admin-note">${escapeHtml(item.response)}</p>` : ""}
        ${screenshot}
        <small>Chat messages: ${(item.chat || []).length}</small>
        <small>ID: ${escapeHtml(item.id || "")}</small>
        <small>Status: ${escapeHtml(item.status || "new")} ${kind ? `- ${kind}` : ""} ${escapeHtml(item.createdAt || "")}</small>
      </article>`;
    })
    .join("");
}

function renderMarkdown(value) {
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

function generateCertificatePdf(values) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    alert("PDF engine is still loading. Try again in a moment.");
    return;
  }
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  pdf.setFillColor(15, 10, 35);
  pdf.rect(0, 0, 842, 595, "F");
  pdf.setFillColor(91, 33, 182);
  pdf.roundedRect(44, 44, 754, 507, 28, 28, "F");
  pdf.setFillColor(255, 255, 255);
  pdf.setGState(new pdf.GState({ opacity: 0.08 }));
  pdf.roundedRect(62, 62, 718, 471, 22, 22, "F");
  pdf.setGState(new pdf.GState({ opacity: 1 }));
  pdf.setTextColor(248, 250, 252);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("CredStore", 92, 98);
  pdf.setFontSize(34);
  pdf.text("Security Recognition Certificate", 92, 155);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  pdf.setTextColor(221, 214, 254);
  pdf.text("This certificate recognizes responsible vulnerability disclosure by", 92, 198);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(30);
  pdf.text(values.hunterName || "Security Researcher", 92, 248, { maxWidth: 650 });
  pdf.setFontSize(20);
  pdf.text(values.title || "Accepted CredStore Security Report", 92, 314, { maxWidth: 650 });
  pdf.setFontSize(15);
  pdf.setTextColor(196, 181, 253);
  pdf.text(`Severity: ${values.severity || "Informational"}`, 92, 360);
  pdf.setTextColor(226, 232, 240);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text(values.note || "For responsible disclosure and helping improve CredStore security.", 92, 400, {
    maxWidth: 630,
  });
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.text("CredStore Vulnerability Disclosure Program", 92, 500);
  pdf.setTextColor(196, 181, 253);
  pdf.text(new Date().toISOString().slice(0, 10), 660, 500);
  const fileName = `credstore-certificate-${String(values.hunterName || "researcher").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
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
  const status = document.getElementById("certificate-status");
  if (status) status.textContent = "PDF generated and attached to admin chat.";
  pdf.save(fileName);
}

// Hall of fame

async function loadPublicHall() {
  try {
    const response = await fetch(`${workerBase}/hall-of-fame`);
    const data = await response.json();
    renderList("hall-public", data.items || [], "public");
  } catch {
    const hall = document.getElementById("hall-public");
    if (hall) hall.textContent = "Hall of fame is unavailable.";
  }
}

async function loadAdmin() {
  if (!adminToken) return;
  const status = document.getElementById("admin-status");
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
      values.screenshot = await readFileAsDataUrl(form.screenshot?.files?.[0]);
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
  document.getElementById("certificate-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    generateCertificatePdf(formData(event.currentTarget));
  });
  document.getElementById("response-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("response-status");
    try {
      await postJson("/admin/response", formData(event.currentTarget), authHeaders());
      if (status) status.textContent = "Response saved.";
      await loadAdmin();
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
    const status = document.getElementById("admin-chat-status");
    try {
      const values = formData(event.currentTarget);
      const data = await postJson("/admin/ticket/chat", values, authHeaders());
      renderChat("admin-chat-thread", data.messages || []);
      event.currentTarget.message.value = "";
      event.currentTarget.attachmentName.value = "";
      event.currentTarget.attachmentData.value = "";
      pendingCertificateAttachment = null;
      if (status) status.textContent = "Admin chat message sent.";
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Admin chat message failed.";
    }
  });
}

window.addEventListener("load", () => {
  initMarkdownEditors();
  initKeyPage();
  initFncPage();
  initVdpPage();
  initAdminPage();
});
