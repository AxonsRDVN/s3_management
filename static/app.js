/* ═══════════════════════════════════════════════════════
   S3 File Manager — Refined Dashboard JS
   ═══════════════════════════════════════════════════════ */

// ─── DOM References ────────────────────────────────────
const form = document.querySelector("#uploadForm");
const input = document.querySelector("#fileInput");
const fileName = document.querySelector("#fileName");
const fileSelectionBar = document.querySelector("#fileSelectionBar");
const result = document.querySelector("#result");
const button = document.querySelector("#uploadButton");
const progressBar = document.querySelector("#progressBar");
const progressPercent = document.querySelector("#progressPercent");
const progressStage = document.querySelector("#progressStage");
const progressDetail = document.querySelector("#progressDetail");
const uploadProgressCard = document.querySelector("#uploadProgressCard");
const dropzone = document.querySelector("#dropzone");

const refreshFilesButton = document.querySelector("#refreshFilesButton");
const createFolderButton = document.querySelector("#createFolderButton");
const trashButton = document.querySelector("#trashButton");

const selectAllButton = document.querySelector("#selectAllButton");
const selectedCountLabel = document.querySelector("#selectedCountLabel");
const selectPageButton = document.querySelector("#selectPageButton");
const deleteSelectedButton = document.querySelector("#deleteSelectedButton");
const downloadSelectedButton = document.querySelector("#downloadSelectedButton");
const exportSelectedButton = document.querySelector("#exportSelectedButton");
const exportExpirySelect = document.querySelector("#exportExpirySelect");
const transcodeSelectedButton = document.querySelector("#transcodeSelectedButton");

const transcodeProgress = document.querySelector("#transcodeProgress");
const transcodeProgressBar = document.querySelector("#transcodeProgressBar");
const transcodePercent = document.querySelector("#transcodePercent");
const transcodeStage = document.querySelector("#transcodeStage");
const transcodeDetail = document.querySelector("#transcodeDetail");

const deleteAllButton = document.querySelector("#deleteAllButton");
const fileList = document.querySelector("#fileList");
const fileListMeta = document.querySelector("#fileListMeta");
const fileNameSearch = document.querySelector("#fileNameSearch");
const mediaTypeFilter = document.querySelector("#mediaTypeFilter");
const sortBySelect = document.querySelector("#sortBySelect");
const extensionFilter = document.querySelector("#extensionFilter");
const minSizeFilter = document.querySelector("#minSizeFilter");
const maxSizeFilter = document.querySelector("#maxSizeFilter");
const dateFromFilter = document.querySelector("#dateFromFilter");
const dateToFilter = document.querySelector("#dateToFilter");
const clearFiltersButton = document.querySelector("#clearFiltersButton");
const activeFilterCount = document.querySelector("#activeFilterCount");
const pagination = document.querySelector("#pagination");
const breadcrumbs = document.querySelector("#breadcrumbs");
const folderList = document.querySelector("#folderList");
const folderSection = document.querySelector("#folderSection");
const trashPanel = document.querySelector("#trashPanel");
const trashList = document.querySelector("#trashList");
const closeTrashButton = document.querySelector("#closeTrashButton");
const bulkBar = document.querySelector("#bulkBar");
const advancedSearch = document.querySelector("#advancedSearch");
const advancedToggleBtn = document.querySelector("#advancedToggleBtn");
const closeAdvancedBtn = document.querySelector("#closeAdvancedBtn");
const hamburgerBtn = document.querySelector("#hamburgerBtn");
const appSidebar = document.querySelector("#appSidebar");
const sidebarOverlay = document.querySelector("#sidebarOverlay");
const toastContainer = document.querySelector("#toastContainer");
const sidebarTrashBtn = document.querySelector("#sidebarTrashBtn");

// ─── State ─────────────────────────────────────────────
let progressSource = null;
let allFiles = [];
let selectedKeys = new Set();
let currentPage = 1;
let currentPageSize = 10;
let transcodeSource = null;
let transcodeRunning = false;
let currentDirectory = "";
let currentFolders = [];
let sidebarFilter = "files"; // files | images | videos | documents | trash

const videoExtensions = new Set(["mp4", "mov", "avi", "mkv", "webm", "m4v", "mpeg", "mpg", "3gp"]);
const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tif", "tiff", "avif", "heic"]);
const documentExtensions = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "rtf", "odt"]);

// ─── Utilities ─────────────────────────────────────────
function getMediaType(file) {
  const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
  if (videoExtensions.has(ext)) return "video";
  if (imageExtensions.has(ext)) return "image";
  if (documentExtensions.has(ext)) return "document";
  return "other";
}

function getFileExtension(name) {
  return name.includes(".") ? name.split(".").pop().toLowerCase() : "";
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function makeProgressId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value) {
  const d = new Date(value);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getDate();
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year} · ${hours}:${mins}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ─── Toast Notifications ───────────────────────────────
function showToast(message, type = "info", duration = 4000) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" type="button">×</button>
  `;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  const close = () => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  };
  toast.querySelector(".toast-close").addEventListener("click", close);
  setTimeout(close, duration);
}

// ─── Modal System ──────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

function confirmDialog(title, bodyHtml) {
  return new Promise((resolve) => {
    document.getElementById("confirmModalTitle").textContent = title;
    document.getElementById("confirmModalBody").innerHTML = bodyHtml;
    openModal("confirmModal");
    const cleanup = () => {
      closeModal("confirmModal");
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      closeBtn.removeEventListener("click", onCancel);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const ok = document.getElementById("confirmModalOk");
    const cancel = document.getElementById("confirmModalCancel");
    const closeBtn = document.getElementById("confirmModalClose");
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    closeBtn.addEventListener("click", onCancel);
  });
}

function promptDialog(title, description, defaultValue = "") {
  return new Promise((resolve) => {
    document.getElementById("promptModalTitle").textContent = title;
    document.getElementById("promptModalDesc").textContent = description;
    const inp = document.getElementById("promptModalInput");
    inp.value = defaultValue;
    openModal("promptModal");
    setTimeout(() => { inp.focus(); inp.select(); }, 100);
    const cleanup = () => {
      closeModal("promptModal");
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      closeBtn.removeEventListener("click", onCancel);
      inp.removeEventListener("keydown", onKey);
    };
    const onOk = () => { cleanup(); resolve(inp.value); };
    const onCancel = () => { cleanup(); resolve(null); };
    const onKey = (e) => { if (e.key === "Enter") onOk(); if (e.key === "Escape") onCancel(); };
    const ok = document.getElementById("promptModalOk");
    const cancel = document.getElementById("promptModalCancel");
    const closeBtn = document.getElementById("promptModalClose");
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    closeBtn.addEventListener("click", onCancel);
    inp.addEventListener("keydown", onKey);
  });
}

// ─── File Type Helpers ─────────────────────────────────
function getFileTypeIcon(file) {
  const ext = getFileExtension(file.name);
  const type = getMediaType(file);
  if (type === "image") return `<div class="file-type-icon image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
  if (type === "video") return `<div class="file-type-icon video"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div>`;
  if (ext === "pdf") return `<div class="file-type-icon pdf">PDF</div>`;
  if (["xls", "xlsx", "csv"].includes(ext)) return `<div class="file-type-icon excel">XLS</div>`;
  if (["doc", "docx"].includes(ext)) return `<div class="file-type-icon word">DOC</div>`;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return `<div class="file-type-icon zip">ZIP</div>`;
  return `<div class="file-type-icon generic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></div>`;
}

function getFileTypeBadge(file) {
  const type = getMediaType(file);
  const ext = getFileExtension(file.name).toUpperCase() || "FILE";
  const cls = type === "image" ? "image" : type === "video" ? "video" : type === "document" ? "document" : "other";
  return `<span class="file-type-badge ${cls}">${ext}</span>`;
}

// ─── Filtering ─────────────────────────────────────────
function getFilteredFiles() {
  const type = mediaTypeFilter.value;
  const searchTerm = fileNameSearch.value.trim().toLocaleLowerCase("vi");
  const extensions = extensionFilter.value.toLocaleLowerCase("vi").split(/[\s,;]+/).map((v) => v.replace(/^\./, "").trim()).filter(Boolean);
  const minSize = minSizeFilter.value === "" ? null : Number(minSizeFilter.value) * 1024 * 1024;
  const maxSize = maxSizeFilter.value === "" ? null : Number(maxSizeFilter.value) * 1024 * 1024;
  const dateFrom = dateFromFilter.value ? new Date(`${dateFromFilter.value}T00:00:00`).getTime() : null;
  const dateTo = dateToFilter.value ? new Date(`${dateToFilter.value}T23:59:59.999`).getTime() : null;

  let filtered = allFiles.filter((file) => {
    const searchableText = `${file.name} ${file.key}`.toLocaleLowerCase("vi");
    const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    const modifiedAt = new Date(file.last_modified).getTime();
    const matchesType = type === "all" || getMediaType(file) === type;
    return matchesType
      && (!searchTerm || searchableText.includes(searchTerm))
      && (extensions.length === 0 || extensions.includes(ext))
      && (minSize === null || file.size >= minSize)
      && (maxSize === null || file.size <= maxSize)
      && (dateFrom === null || modifiedAt >= dateFrom)
      && (dateTo === null || modifiedAt <= dateTo);
  });

  if (sidebarFilter === "images") filtered = filtered.filter((f) => getMediaType(f) === "image");
  else if (sidebarFilter === "videos") filtered = filtered.filter((f) => getMediaType(f) === "video");
  else if (sidebarFilter === "documents") filtered = filtered.filter((f) => getMediaType(f) === "document");

  const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });
  const sorters = {
    "date-desc": (a, b) => new Date(b.last_modified) - new Date(a.last_modified),
    "date-asc": (a, b) => new Date(a.last_modified) - new Date(b.last_modified),
    "name-asc": (a, b) => collator.compare(a.name, b.name),
    "name-desc": (a, b) => collator.compare(b.name, a.name),
    "size-desc": (a, b) => b.size - a.size,
    "size-asc": (a, b) => a.size - b.size,
  };
  return filtered.sort(sorters[sortBySelect.value] || sorters["date-desc"]);
}

function applyListFilters() {
  currentPage = 1;
  const controls = [extensionFilter, minSizeFilter, maxSizeFilter, dateFromFilter, dateToFilter];
  const count = controls.filter((c) => c.value !== "").length;
  activeFilterCount.textContent = count ? `(${count})` : "";
  renderFileList();
  deleteAllButton.disabled = getFilteredFiles().length === 0;
}

function getCurrentPageFiles() {
  const files = getFilteredFiles();
  const start = (currentPage - 1) * currentPageSize;
  return files.slice(start, start + currentPageSize);
}

// ─── Result / Progress ─────────────────────────────────
function setResult(type, html) {
  result.hidden = false;
  result.className = `result-message ${type}`;
  result.style.display = "block";
  result.innerHTML = html;
  if (type === "ok") showToast(html.replace(/<[^>]*>/g, ""), "success");
  else if (type === "error") showToast(html.replace(/<[^>]*>/g, ""), "error");
}

function setProgress(value) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  if (percent > 0) uploadProgressCard.classList.add("visible");
  uploadProgressCard.style.display = "block";
}

function setProgressText(stage, detail = "") {
  progressStage.textContent = stage;
  progressDetail.textContent = detail;
}

function showSelectedFile() {
  const files = [...input.files];
  if (files.length > 0) {
    const total = files.reduce((sum, f) => sum + f.size, 0);
    fileName.textContent = `${files.length} file(s) selected (${formatBytes(total)})`;
    fileSelectionBar.style.display = "flex";
  } else {
    fileSelectionBar.style.display = "none";
  }
}

// ─── Render Breadcrumbs & Folders ───────────────────────
function renderFolders() {
  const parts = currentDirectory.split("/").filter(Boolean);
  const homeSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  let html = `<button type="button" data-dir="">${homeSvg} My Files</button>`;
  parts.forEach((part, i) => {
    html += `<span class="breadcrumb-sep">/</span>`;
    html += `<button type="button" data-dir="${escapeHtml(parts.slice(0, i + 1).join("/"))}">${escapeHtml(part)}</button>`;
  });
  breadcrumbs.innerHTML = html;

  if (currentFolders.length > 0) {
    folderSection.style.display = "";
    folderList.innerHTML = currentFolders.map((folder) => `
      <div class="folder-card" data-folder="${escapeHtml(folder.name)}">
        <div class="folder-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="folder-card-details">
          <span class="folder-card-name" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</span>
          <span class="folder-card-meta">${formatBytes(folder.size || 0)} · ${folder.file_count || 0} file${folder.file_count === 1 ? "" : "s"}</span>
        </div>
      </div>
    `).join("");
  } else {
    folderSection.style.display = "none";
  }
}

// ─── Selection State ───────────────────────────────────
function syncSelectionState() {
  const selectedCount = selectedKeys.size;
  selectedCountLabel.textContent = `${selectedCount} selected`;

  if (selectedCount > 0) {
    bulkBar.classList.add("visible");
  } else {
    bulkBar.classList.remove("visible");
  }

  const filteredFiles = getFilteredFiles();
  const allSelected = filteredFiles.length > 0 && filteredFiles.every((f) => selectedKeys.has(f.key));
  const pageFiles = getCurrentPageFiles();
  const pageSelected = pageFiles.length > 0 && pageFiles.every((f) => selectedKeys.has(f.key));

  selectAllButton.textContent = allSelected ? "Deselect All" : "Select All";
  selectPageButton.textContent = pageSelected ? "Deselect Page" : "Select Page";
  selectPageButton.disabled = pageFiles.length === 0;
  deleteSelectedButton.disabled = selectedCount === 0;
  downloadSelectedButton.disabled = selectedCount === 0;
  exportSelectedButton.disabled = selectedCount === 0;

  const selectedVideos = [...selectedKeys].filter((key) => {
    const file = allFiles.find((item) => item.key === key);
    return file && getMediaType(file) === "video";
  });
  transcodeSelectedButton.disabled = transcodeRunning || selectedVideos.length === 0;
}

// ─── Render Pagination ─────────────────────────────────
function renderPagination(totalPages) {
  if (totalPages <= 1) {
    pagination.style.display = "none";
    return;
  }
  pagination.style.display = "flex";

  const pages = [];
  for (let page = 1; page <= totalPages; page += 1) {
    if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1) {
      pages.push(`<button type="button" class="page-btn ${page === currentPage ? "active" : ""}" data-page="${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`);
    } else if (pages.at(-1) !== '<span class="page-gap">…</span>') {
      pages.push('<span class="page-gap">…</span>');
    }
  }

  pagination.innerHTML = `
    <div class="pagination-info">${getFilteredFiles().length} items · Page ${currentPage} of ${totalPages}</div>
    <div class="pagination-nav">
      <button type="button" class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      ${pages.join("")}
      <button type="button" class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="pagination-size">
      Show
      <select id="pageSizeSelect">
        <option value="5" ${currentPageSize === 5 ? "selected" : ""}>5</option>
        <option value="10" ${currentPageSize === 10 ? "selected" : ""}>10</option>
        <option value="20" ${currentPageSize === 20 ? "selected" : ""}>20</option>
        <option value="50" ${currentPageSize === 50 ? "selected" : ""}>50</option>
      </select>
      per page
    </div>
  `;
}

// ─── Render File List (Table) ──────────────────────────
function renderFileList() {
  const files = getFilteredFiles();
  const totalPages = Math.max(1, Math.ceil(files.length / currentPageSize));
  currentPage = Math.min(currentPage, totalPages);
  const pageFiles = getCurrentPageFiles();

  fileListMeta.textContent = files.length ? `${files.length} item${files.length !== 1 ? "s" : ""}` : "0 items";

  if (files.length === 0) {
    fileList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
        </div>
        <div class="empty-state-title">No files found</div>
        <div class="empty-state-desc">Upload files or adjust your search filters.</div>
      </div>
    `;
    renderPagination(0);
    syncSelectionState();
    return;
  }

  let html = `
    <table class="file-table">
      <thead>
        <tr>
          <th><input type="checkbox" class="file-checkbox" id="headerCheckbox" ${pageFiles.every((f) => selectedKeys.has(f.key)) && pageFiles.length > 0 ? "checked" : ""}></th>
          <th>Name</th>
          <th>Type</th>
          <th>Size</th>
          <th>Modified</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const file of pageFiles) {
    const isSelected = selectedKeys.has(file.key);
    html += `
      <tr class="${isSelected ? "selected" : ""}" data-key="${escapeHtml(file.key)}">
        <td><input class="file-checkbox" type="checkbox" data-key="${escapeHtml(file.key)}" ${isSelected ? "checked" : ""}></td>
        <td>
          <div class="file-name-cell">
            ${getFileTypeIcon(file)}
            <div class="file-name-text">
              <span class="file-name-primary" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
              <span class="file-name-secondary" title="${escapeHtml(file.key)}">${escapeHtml(file.key)}</span>
            </div>
          </div>
        </td>
        <td class="file-type-td">${getFileTypeBadge(file)}</td>
        <td class="file-size-td"><span class="file-size-cell">${formatBytes(file.size)}</span></td>
        <td class="file-date-td"><span class="file-date-cell">${formatDate(file.last_modified)}</span></td>
        <td>
          <div class="file-actions-cell">
            <a class="file-action-btn view-btn" href="/play?key=${encodeURIComponent(file.key)}" target="_blank" rel="noreferrer" data-tooltip="${getMediaType(file) === 'video' ? 'Phát video' : 'Xem'}">
              ${getMediaType(file) === 'video' 
                ? `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"/></svg>` 
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`}
            </a>
            ${getMediaType(file) === 'video' ? `
            <button class="file-action-btn convert-action" type="button" data-key="${escapeHtml(file.key)}" data-tooltip="Chuyển đổi Video">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            </button>
            ` : ''}
            <a class="file-action-btn download-btn" href="/download?key=${encodeURIComponent(file.key)}" data-tooltip="Download">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </a>
            <button class="file-action-btn share-action" type="button" data-key="${escapeHtml(file.key)}" data-tooltip="Copy Link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
            <button class="file-action-btn move-action" type="button" data-key="${escapeHtml(file.key)}" data-name="${escapeHtml(file.name)}" data-tooltip="Rename">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </button>
            <button class="file-action-btn delete-action" type="button" data-key="${escapeHtml(file.key)}" data-tooltip="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  html += `</tbody></table>`;
  fileList.innerHTML = html;

  renderPagination(totalPages);
  syncSelectionState();
}

// ─── Global Full-Screen Loader Helpers ──────────────────
const globalLoader = document.querySelector("#globalLoader");
const globalLoaderText = document.querySelector("#globalLoaderText");

function showGlobalLoading(text = "Loading...") {
  if (globalLoaderText) globalLoaderText.textContent = text;
  if (globalLoader) {
    globalLoader.hidden = false;
    requestAnimationFrame(() => globalLoader.classList.add("visible"));
  }
}

function hideGlobalLoading() {
  if (globalLoader) {
    globalLoader.classList.remove("visible");
    setTimeout(() => { globalLoader.hidden = true; }, 200);
  }
}

// ─── Data Loading ──────────────────────────────────────
async function loadFiles() {
  fileListMeta.textContent = "Loading...";
  refreshFilesButton.classList.add("is-loading");
  refreshFilesButton.disabled = true;
  showGlobalLoading("Loading files...");

  fileList.innerHTML = `
    <div class="skeleton-row"><div class="skeleton skeleton-checkbox"></div><div class="skeleton skeleton-icon"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div><div class="skeleton skeleton-text short"></div></div>
    <div class="skeleton-row"><div class="skeleton skeleton-checkbox"></div><div class="skeleton skeleton-icon"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div><div class="skeleton skeleton-text short"></div></div>
    <div class="skeleton-row"><div class="skeleton skeleton-checkbox"></div><div class="skeleton skeleton-icon"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div><div class="skeleton skeleton-text short"></div></div>
  `;

  deleteSelectedButton.disabled = true;
  downloadSelectedButton.disabled = true;
  exportSelectedButton.disabled = true;
  deleteAllButton.disabled = true;

  try {
    const response = await fetch(`/files?directory=${encodeURIComponent(currentDirectory)}`);
    const payload = await response.json();

    if (!payload.ok) {
      fileListMeta.textContent = payload.message || "Error loading files";
      return;
    }

    allFiles = payload.files;
    currentFolders = payload.folders || [];
    renderFolders();
    const remainingKeys = new Set(allFiles.map((f) => f.key));
    selectedKeys = new Set([...selectedKeys].filter((key) => remainingKeys.has(key)));

    // Update storage summary dynamically
    const totalBytes = payload.total_size || 0;
    const totalFiles = payload.total_files || 0;
    const storageUsedElem = document.querySelector("#totalStorageUsed");
    const storageCountElem = document.querySelector("#totalStorageCount");
    if (storageUsedElem) storageUsedElem.textContent = formatBytes(totalBytes);
    if (storageCountElem) storageCountElem.textContent = `${totalFiles} file${totalFiles !== 1 ? "s" : ""} in folder`;

    currentPage = 1;
    renderFileList();
  } catch (error) {
    fileListMeta.textContent = "Server error";
  } finally {
    refreshFilesButton.classList.remove("is-loading");
    refreshFilesButton.disabled = false;
    deleteAllButton.disabled = allFiles.length === 0;
    hideGlobalLoading();
  }
}

// ─── Delete Files ──────────────────────────────────────
async function deleteFiles(keys) {
  if (!keys.length) return;

  const label = keys.length === 1 ? "this file" : `${keys.length} files`;
  const listHtml = keys.length <= 5
    ? `<ul style="margin:10px 0 0;padding-left:20px;font-size:13px;color:var(--text-secondary)">${keys.map((k) => `<li style="margin-bottom:3px">${escapeHtml(k.split("/").pop())}</li>`).join("")}</ul>`
    : `<p style="margin:10px 0 0;font-size:13px;color:var(--text-secondary)">${keys.length} files will be moved to Trash.</p>`;

  const confirmed = await confirmDialog(
    `Move ${label} to trash?`,
    `<p>Are you sure you want to move ${label} to trash?</p>${listHtml}`
  );
  if (!confirmed) return;

  deleteSelectedButton.disabled = true;
  deleteAllButton.disabled = true;
  showGlobalLoading(`Moving ${keys.length} file(s) to Trash...`);

  try {
    const response = await fetch("/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
    });
    const payload = await response.json();

    if (!payload.ok) {
      setResult("error", payload.message || "Failed to delete files.");
      return;
    }

    setResult("ok", `Moved ${payload.deleted || keys.length} file(s) to trash.`);
    keys.forEach((k) => selectedKeys.delete(k));
    await loadFiles();
  } catch (error) {
    showToast(error.message || "Error deleting files", "error");
  } finally {
    hideGlobalLoading();
  }
}

async function deleteFile(key) {
  await deleteFiles([key]);
}

// ─── Event Listeners ───────────────────────────────────

// Upload
input.addEventListener("change", showSelectedFile);

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("is-dragging");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragging");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("is-dragging");
  if (e.dataTransfer.files.length > 0) {
    input.files = e.dataTransfer.files;
    showSelectedFile();
  }
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const files = [...input.files];
  if (!files.length) {
    setResult("error", "Please select files before uploading.");
    return;
  }

  button.disabled = true;
  button.innerHTML = `Uploading 0/${files.length}...`;
  result.hidden = true;
  result.style.display = "none";

  (async () => {
    const failures = [];
    for (let i = 0; i < files.length; i += 1) {
      button.innerHTML = `Uploading ${i + 1}/${files.length}...`;
      const data = new FormData();
      data.append("progress_id", makeProgressId());
      data.append("directory", currentDirectory);
      data.append("file", files[i]);
      try {
        const response = await fetch("/upload", { method: "POST", body: data });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.message || "Upload failed");
        setProgress(((i + 1) / files.length) * 100);
        setProgressText("Uploading files", `${i + 1}/${files.length}: ${files[i].name}`);
      } catch (error) {
        failures.push(`${files[i].name}: ${error.message}`);
      }
    }
    button.disabled = false;
    button.innerHTML = `Start Upload`;
    input.value = "";
    showSelectedFile();
    setResult(
      failures.length ? "error" : "ok",
      failures.length
        ? `Upload finished with errors:<br>${failures.map(escapeHtml).join("<br>")}`
        : `Successfully uploaded ${files.length} file(s).`
    );
    loadFiles();
  })();
});

// Refresh
refreshFilesButton.addEventListener("click", loadFiles);

// Select All
selectAllButton.addEventListener("click", () => {
  const filteredFiles = getFilteredFiles();
  if (filteredFiles.length === 0) return;

  const allSelected = filteredFiles.every((f) => selectedKeys.has(f.key));
  if (allSelected) {
    filteredFiles.forEach((f) => selectedKeys.delete(f.key));
  } else {
    filteredFiles.forEach((f) => selectedKeys.add(f.key));
  }
  fileList.querySelectorAll(".file-checkbox[data-key]").forEach((cb) => {
    cb.checked = selectedKeys.has(cb.dataset.key);
  });
  syncSelectionState();
});

// Select Page
selectPageButton.addEventListener("click", () => {
  const pageFiles = getCurrentPageFiles();
  if (pageFiles.length === 0) return;

  const pageSelected = pageFiles.every((f) => selectedKeys.has(f.key));
  pageFiles.forEach((f) => {
    if (pageSelected) selectedKeys.delete(f.key);
    else selectedKeys.add(f.key);
  });
  fileList.querySelectorAll(".file-checkbox[data-key]").forEach((cb) => {
    cb.checked = selectedKeys.has(cb.dataset.key);
  });
  syncSelectionState();
});

// Delete Selected
deleteSelectedButton.addEventListener("click", () => {
  deleteFiles([...selectedKeys]);
});

// Download Selected
downloadSelectedButton.addEventListener("click", () => {
  if (selectedKeys.size === 0) return;
  const downloadForm = document.createElement("form");
  downloadForm.method = "POST";
  downloadForm.action = "/download-multiple";
  downloadForm.hidden = true;
  selectedKeys.forEach((key) => {
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = "keys";
    field.value = key;
    downloadForm.appendChild(field);
  });
  document.body.appendChild(downloadForm);
  downloadForm.submit();
  downloadForm.remove();
});

// Export Excel
exportSelectedButton.addEventListener("click", () => {
  if (selectedKeys.size === 0) return;
  const exportForm = document.createElement("form");
  exportForm.method = "POST";
  exportForm.action = "/export-selected";
  exportForm.hidden = true;
  selectedKeys.forEach((key) => {
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = "keys";
    field.value = key;
    exportForm.appendChild(field);
  });
  const expiryField = document.createElement("input");
  expiryField.type = "hidden";
  expiryField.name = "expires_in";
  expiryField.value = exportExpirySelect.value;
  exportForm.appendChild(expiryField);
  document.body.appendChild(exportForm);
  exportForm.submit();
  exportForm.remove();
});

// Transcode Function
async function transcodeVideos(keys) {
  if (!keys.length || transcodeRunning) return;

  const progressId = makeProgressId();
  transcodeRunning = true;
  transcodeProgress.hidden = false;
  transcodeProgressBar.style.width = "0%";
  transcodePercent.textContent = "0%";
  transcodeStage.textContent = "Đang gửi danh sách video...";
  transcodeDetail.textContent = `${keys.length} video`;
  syncSelectionState();

  try {
    const response = await fetch("/transcode-multiple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress_id: progressId, keys }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.message || "Không thể bắt đầu chuyển đổi.");

    transcodeSource = new EventSource(`/progress/${progressId}`);
    transcodeSource.onmessage = (event) => {
      const progress = JSON.parse(event.data);
      transcodeProgressBar.style.width = `${progress.percent}%`;
      transcodePercent.textContent = `${progress.percent}%`;
      transcodeStage.textContent = progress.stage;
      transcodeDetail.textContent = progress.detail || "";
      if (progress.done) {
        transcodeSource.close();
        transcodeSource = null;
        transcodeRunning = false;
        syncSelectionState();
        const failures = progress.failed || [];
        setResult(
          failures.length ? "error" : "ok",
          failures.length
            ? `Chuyển đổi ${progress.completed}/${progress.total} video.<br>${failures.map((item) => `<strong>${escapeHtml(item.key)}</strong><br>${escapeHtml(item.message)}`).join("<br><br>")}`
            : `Đã chuyển đổi thành công ${progress.completed}/${progress.total} video sang định dạng tương thích trình duyệt.`
        );
      }
    };
    transcodeSource.onerror = () => {
      transcodeSource.close();
      transcodeSource = null;
      transcodeRunning = false;
      syncSelectionState();
    };
  } catch (error) {
    transcodeRunning = false;
    transcodeStage.textContent = "Chuyển đổi thất bại";
    transcodeDetail.textContent = error.message;
    setResult("error", escapeHtml(error.message));
    syncSelectionState();
  }
}

// Transcode Selected
transcodeSelectedButton.addEventListener("click", () => {
  const keys = [...selectedKeys].filter((key) => {
    const file = allFiles.find((item) => item.key === key);
    return file && getMediaType(file) === "video";
  });
  transcodeVideos(keys);
});

// Delete All
deleteAllButton.addEventListener("click", () => {
  const keys = getFilteredFiles().map((f) => f.key);
  deleteFiles(keys);
});

// Filters
mediaTypeFilter.addEventListener("change", () => {
  currentPage = 1;
  renderFileList();
  deleteAllButton.disabled = getFilteredFiles().length === 0;
});

sortBySelect.addEventListener("change", applyListFilters);
[extensionFilter, minSizeFilter, maxSizeFilter, dateFromFilter, dateToFilter].forEach((control) => {
  control.addEventListener("input", applyListFilters);
});

clearFiltersButton.addEventListener("click", () => {
  fileNameSearch.value = "";
  mediaTypeFilter.value = "all";
  sortBySelect.value = "date-desc";
  [extensionFilter, minSizeFilter, maxSizeFilter, dateFromFilter, dateToFilter].forEach((c) => { c.value = ""; });
  applyListFilters();
  fileNameSearch.focus();
});

fileNameSearch.addEventListener("input", () => {
  currentPage = 1;
  renderFileList();
  deleteAllButton.disabled = getFilteredFiles().length === 0;
});

// Advanced Search Toggle
advancedToggleBtn.addEventListener("click", () => {
  advancedSearch.classList.toggle("open");
});

if (closeAdvancedBtn) {
  closeAdvancedBtn.addEventListener("click", () => {
    advancedSearch.classList.remove("open");
  });
}

// Pagination (event delegation)
pagination.addEventListener("click", (e) => {
  const pageButton = e.target.closest("[data-page]");
  if (!pageButton || pageButton.disabled) return;
  currentPage = Number(pageButton.dataset.page);
  renderFileList();
});

pagination.addEventListener("change", (e) => {
  if (e.target.id === "pageSizeSelect") {
    currentPageSize = Number(e.target.value);
    currentPage = 1;
    renderFileList();
  }
});

// File List Events (delegation)
fileList.addEventListener("click", (e) => {
  // Header checkbox
  const headerCb = e.target.closest("#headerCheckbox");
  if (headerCb) {
    const pageFiles = getCurrentPageFiles();
    pageFiles.forEach((f) => {
      if (headerCb.checked) selectedKeys.add(f.key);
      else selectedKeys.delete(f.key);
    });
    fileList.querySelectorAll(".file-checkbox[data-key]").forEach((cb) => {
      cb.checked = selectedKeys.has(cb.dataset.key);
    });
    syncSelectionState();
    return;
  }

  // Share / copy link
  const shareButton = e.target.closest(".share-action");
  if (shareButton) {
    shareButton.disabled = true;
    fetch("/share-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: shareButton.dataset.key, expires_in: 86400 }),
    })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(async ({ response, payload }) => {
        if (!response.ok || !payload.ok) throw new Error(payload.message || "Could not create link.");
        try {
          await navigator.clipboard.writeText(payload.url);
          showToast("Download link copied to clipboard (valid 24h)", "success");
        } catch {
          window.prompt("Copy download link (valid 24h):", payload.url);
        }
      })
      .catch((error) => showToast(error.message, "error"))
      .finally(() => { shareButton.disabled = false; });
    return;
  }

  // Rename / move
  const moveButton = e.target.closest(".move-action");
  if (moveButton) {
    const currentName = currentDirectory ? `${currentDirectory}/${moveButton.dataset.name}` : moveButton.dataset.name;
    promptDialog("Rename / Move File", "Enter new path (relative to root):", currentName).then((destination) => {
      if (destination && destination.trim()) {
        fetch("/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: moveButton.dataset.key, destination: destination.trim() }),
        })
          .then((response) => response.json().then((payload) => ({ response, payload })))
          .then(({ response, payload }) => {
            if (!response.ok || !payload.ok) throw new Error(payload.message);
            setResult("ok", `Moved to ${escapeHtml(payload.key)}.`);
            loadFiles();
          })
          .catch((error) => setResult("error", escapeHtml(error.message)));
      }
    });
    return;
  }

  // Convert single video
  const convertButton = e.target.closest(".convert-action");
  if (convertButton) {
    transcodeVideos([convertButton.dataset.key]);
    return;
  }

  // Delete single
  const deleteButton = e.target.closest(".delete-action");
  if (deleteButton) {
    deleteFile(deleteButton.dataset.key);
    return;
  }
});

// File checkbox change
fileList.addEventListener("change", (e) => {
  if (!e.target.matches(".file-checkbox[data-key]")) return;
  const key = e.target.dataset.key;
  if (e.target.checked) selectedKeys.add(key);
  else selectedKeys.delete(key);
  syncSelectionState();
  const row = e.target.closest("tr");
  if (row) row.classList.toggle("selected", e.target.checked);
});

// Breadcrumbs
breadcrumbs.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-dir]");
  if (!btn) return;
  currentDirectory = btn.dataset.dir;
  selectedKeys.clear();
  loadFiles();
});

// Folder list
folderList.addEventListener("click", (e) => {
  const folder = e.target.closest("[data-folder]");
  if (!folder) return;
  currentDirectory = [currentDirectory, folder.dataset.folder].filter(Boolean).join("/");
  selectedKeys.clear();
  loadFiles();
});

// ─── Sidebar Navigation Helper ─────────────────────────
function setActiveSidebarItem(targetValue) {
  document.querySelectorAll("[data-sidebar]").forEach((b) => {
    if (b.dataset.sidebar === targetValue) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });
}

// Create folder (using modal)
createFolderButton.addEventListener("click", async () => {
  const name = await promptDialog("Create New Folder", "Enter folder name:");
  if (!name) return;
  showGlobalLoading(`Creating folder "${name}"...`);
  try {
    const response = await fetch("/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory: currentDirectory, name }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) return setResult("error", escapeHtml(payload.message || "Could not create folder."));
    setResult("ok", `Created folder "${escapeHtml(name)}".`);
    await loadFiles();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    hideGlobalLoading();
  }
});

// Trash
trashButton.addEventListener("click", openTrashPanel);
if (sidebarTrashBtn) sidebarTrashBtn.addEventListener("click", openTrashPanel);

// ─── Trash State & Functions ───────────────────────────
let selectedTrashKeys = new Set();
let allTrashItems = [];

const emptyTrashButton = document.querySelector("#emptyTrashButton");
const trashBulkBar = document.querySelector("#trashBulkBar");
const trashSelectedCountLabel = document.querySelector("#trashSelectedCountLabel");
const restoreSelectedTrashBtn = document.querySelector("#restoreSelectedTrashBtn");
const deleteSelectedTrashBtn = document.querySelector("#deleteSelectedTrashBtn");

function syncTrashSelectionState() {
  const count = selectedTrashKeys.size;
  if (trashSelectedCountLabel) trashSelectedCountLabel.textContent = `${count} selected`;
  if (trashBulkBar) {
    if (count > 0) trashBulkBar.style.display = "flex";
    else trashBulkBar.style.display = "none";
  }
}

async function openTrashPanel() {
  selectedTrashKeys.clear();
  syncTrashSelectionState();
  setActiveSidebarItem("trash");

  // Hide main view components to make Trash a distinct view
  breadcrumbs.style.display = "none";
  form.style.display = "none";
  folderSection.style.display = "none";
  document.querySelector("#fileSection").style.display = "none";

  // Show trash panel
  trashPanel.hidden = false;
  trashPanel.style.display = "block";
  trashList.innerHTML = '<div class="empty-state"><div class="empty-state-title">Loading trash...</div></div>';
  showGlobalLoading("Loading Trash...");

  try {
    const response = await fetch("/trash");
    const payload = await response.json();
    if (!payload.ok) return trashList.innerHTML = `<div class="empty-state"><div class="empty-state-title">${escapeHtml(payload.message)}</div></div>`;

    allTrashItems = payload.items || [];

    if (emptyTrashButton) {
      emptyTrashButton.disabled = allTrashItems.length === 0;
    }

    if (allTrashItems.length === 0) {
      trashList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>
          <div class="empty-state-title">Trash is empty</div>
          <div class="empty-state-desc">Deleted files will appear here.</div>
        </div>
      `;
      return;
    }

    trashList.innerHTML = `
      <table class="file-table">
        <thead>
          <tr>
            <th style="width:44px;text-align:center"><input type="checkbox" class="file-checkbox" id="trashHeaderCheckbox"></th>
            <th style="text-align:left">Name</th>
            <th>Size</th>
            <th>Modified</th>
            <th style="width:180px;text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${allTrashItems.map((item) => `
            <tr data-trash-key="${escapeHtml(item.trash_key)}">
              <td style="text-align:center"><input type="checkbox" class="file-checkbox trash-checkbox" data-trash-key="${escapeHtml(item.trash_key)}"></td>
              <td><span class="file-name-primary" title="${escapeHtml(item.trash_key)}">${escapeHtml(item.original)}</span></td>
              <td class="file-size-td"><span class="file-size-cell">${formatBytes(item.size)}</span></td>
              <td class="file-date-td"><span class="file-date-cell">${formatDate(item.last_modified)}</span></td>
              <td>
                <div class="file-actions-cell">
                  <button class="toolbar-btn primary restore-action" data-trash-key="${escapeHtml(item.trash_key)}" type="button" style="height:30px;font-size:12px">Restore</button>
                  <button class="toolbar-btn danger delete-perm-action" data-trash-key="${escapeHtml(item.trash_key)}" data-name="${escapeHtml(item.original)}" type="button" style="height:30px;font-size:12px">Delete</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (error) {
    trashList.innerHTML = `<div class="empty-state"><div class="empty-state-title">Error loading trash</div></div>`;
  } finally {
    hideGlobalLoading();
  }
}

function closeTrashPanel() {
  trashPanel.hidden = true;
  trashPanel.style.display = "none";
  selectedTrashKeys.clear();
  syncTrashSelectionState();

  // Restore main view components
  breadcrumbs.style.display = "";
  form.style.display = "";
  document.querySelector("#fileSection").style.display = "";
  renderFolders();

  // Reset active sidebar to My Files
  setActiveSidebarItem("files");
  sidebarFilter = "files";
  mediaTypeFilter.value = "all";
  renderFileList();
}

closeTrashButton.addEventListener("click", closeTrashPanel);

// Empty Trash Button
if (emptyTrashButton) {
  emptyTrashButton.addEventListener("click", async () => {
    if (allTrashItems.length === 0) return;
    const confirmed = await confirmDialog(
      "Empty Trash?",
      `<p style="color:var(--danger)"><strong>Warning:</strong> Are you sure you want to permanently delete all ${allTrashItems.length} item(s) in Trash? This action cannot be undone.</p>`,
      "Empty Trash",
      true
    );
    if (!confirmed) return;

    showGlobalLoading("Emptying Trash...");
    try {
      const response = await fetch("/trash/empty", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Failed to empty trash.");
      showToast(`Emptied trash (${payload.deleted} file(s) permanently deleted).`, "success");
      await openTrashPanel();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      hideGlobalLoading();
    }
  });
}

// Bulk Restore Trash
if (restoreSelectedTrashBtn) {
  restoreSelectedTrashBtn.addEventListener("click", async () => {
    const keys = [...selectedTrashKeys];
    if (!keys.length) return;

    showGlobalLoading(`Restoring ${keys.length} file(s)...`);
    try {
      const response = await fetch("/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trash_keys: keys }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Failed to restore files.");
      showToast(`Restored ${payload.restored} file(s).`, "success");
      await openTrashPanel();
      loadFiles();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      hideGlobalLoading();
    }
  });
}

// Bulk Delete Permanently Trash
if (deleteSelectedTrashBtn) {
  deleteSelectedTrashBtn.addEventListener("click", async () => {
    const keys = [...selectedTrashKeys];
    if (!keys.length) return;
    const confirmed = await confirmDialog(
      `Permanently delete ${keys.length} item(s)?`,
      `<p style="color:var(--danger)">These items will be <strong>permanently deleted</strong> from Amazon S3 and cannot be recovered.</p>`,
      "Delete Permanently",
      true
    );
    if (!confirmed) return;

    showGlobalLoading(`Permanently deleting ${keys.length} file(s)...`);
    try {
      const response = await fetch("/trash/delete-permanent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trash_keys: keys }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Failed to delete files.");
      showToast(`Permanently deleted ${payload.deleted} file(s).`, "success");
      await openTrashPanel();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      hideGlobalLoading();
    }
  });
}

// Trash List Table Interactions
trashList.addEventListener("click", async (e) => {
  // Checkbox select all
  const headerCb = e.target.closest("#trashHeaderCheckbox");
  if (headerCb) {
    allTrashItems.forEach((item) => {
      if (headerCb.checked) selectedTrashKeys.add(item.trash_key);
      else selectedTrashKeys.delete(item.trash_key);
    });
    trashList.querySelectorAll(".trash-checkbox").forEach((cb) => {
      cb.checked = selectedTrashKeys.has(cb.dataset.trashKey);
    });
    syncTrashSelectionState();
    return;
  }

  // Restore single
  const restoreBtn = e.target.closest(".restore-action");
  if (restoreBtn) {
    const key = restoreBtn.dataset.trashKey;
    showGlobalLoading("Restoring file...");
    try {
      const response = await fetch("/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trash_key: key }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Restore failed.");
      showToast(`Restored file to original location.`, "success");
      await openTrashPanel();
      loadFiles();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      hideGlobalLoading();
    }
    return;
  }

  // Delete permanently single
  const permBtn = e.target.closest(".delete-perm-action");
  if (permBtn) {
    const key = permBtn.dataset.trashKey;
    const name = permBtn.dataset.name || "this file";
    const confirmed = await confirmDialog(
      `Permanently delete "${name}"?`,
      `<p style="color:var(--danger)">This file will be <strong>permanently deleted</strong> from Amazon S3 and cannot be recovered.</p>`,
      "Delete Permanently",
      true
    );
    if (!confirmed) return;

    showGlobalLoading(`Deleting ${name}...`);
    try {
      const response = await fetch("/trash/delete-permanent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trash_key: key }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Delete failed.");
      showToast(`Permanently deleted ${name}.`, "success");
      await openTrashPanel();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      hideGlobalLoading();
    }
    return;
  }
});

trashList.addEventListener("change", (e) => {
  if (!e.target.matches(".trash-checkbox")) return;
  const key = e.target.dataset.trashKey;
  if (e.target.checked) selectedTrashKeys.add(key);
  else selectedTrashKeys.delete(key);
  syncTrashSelectionState();
  const row = e.target.closest("tr");
  if (row) row.classList.toggle("selected", e.target.checked);
});

// ─── Sidebar Navigation ───────────────────────────────
document.querySelectorAll("[data-sidebar]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const value = btn.dataset.sidebar;

    // Instantly set active highlight on clicked sidebar button
    setActiveSidebarItem(value);

    if (value === "trash") {
      openTrashPanel();
      return;
    }

    // Hide trash view if open
    trashPanel.hidden = true;
    trashPanel.style.display = "none";
    breadcrumbs.style.display = "";
    form.style.display = "";
    document.querySelector("#fileSection").style.display = "";
    renderFolders();

    sidebarFilter = value;

    if (value === "files") mediaTypeFilter.value = "all";
    else if (value === "images") mediaTypeFilter.value = "image";
    else if (value === "videos") mediaTypeFilter.value = "video";
    else if (value === "documents") mediaTypeFilter.value = "all";

    currentPage = 1;
    renderFileList();
    closeSidebar();
  });
});

// ─── Hamburger / Sidebar Toggle ────────────────────────
function openSidebar() {
  appSidebar.classList.add("open");
  sidebarOverlay.style.display = "block";
  requestAnimationFrame(() => sidebarOverlay.classList.add("visible"));
}

function closeSidebar() {
  appSidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
  setTimeout(() => { sidebarOverlay.style.display = "none"; }, 300);
}

hamburgerBtn.addEventListener("click", () => {
  if (appSidebar.classList.contains("open")) closeSidebar();
  else openSidebar();
});

sidebarOverlay.addEventListener("click", closeSidebar);

// ─── Init ──────────────────────────────────────────────
loadFiles();

// ─── Hamburger / Sidebar Toggle ────────────────────────
function openSidebar() {
  appSidebar.classList.add("open");
  sidebarOverlay.style.display = "block";
  requestAnimationFrame(() => sidebarOverlay.classList.add("visible"));
}

function closeSidebar() {
  appSidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
  setTimeout(() => { sidebarOverlay.style.display = "none"; }, 300);
}

hamburgerBtn.addEventListener("click", () => {
  if (appSidebar.classList.contains("open")) closeSidebar();
  else openSidebar();
});

sidebarOverlay.addEventListener("click", closeSidebar);

// ─── Init ──────────────────────────────────────────────
loadFiles();
