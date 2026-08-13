const form = document.querySelector("#uploadForm");
const input = document.querySelector("#fileInput");
const fileName = document.querySelector("#fileName");
const result = document.querySelector("#result");
const button = document.querySelector("#uploadButton");
const progressBar = document.querySelector("#progressBar");
const progressPercent = document.querySelector("#progressPercent");
const progressStage = document.querySelector("#progressStage");
const progressDetail = document.querySelector("#progressDetail");
const dropzone = document.querySelector(".dropzone");
const refreshFilesButton = document.querySelector("#refreshFilesButton");
const selectAllButton = document.querySelector("#selectAllButton");
const selectPageButton = document.querySelector("#selectPageButton");
const deleteSelectedButton = document.querySelector("#deleteSelectedButton");
const downloadSelectedButton = document.querySelector("#downloadSelectedButton");
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
const pageSizeSelect = document.querySelector("#pageSizeSelect");
const pagination = document.querySelector("#pagination");

let progressSource = null;
let allFiles = [];
let selectedKeys = new Set();
let currentPage = 1;
let transcodeSource = null;
let transcodeRunning = false;

const videoExtensions = new Set(["mp4", "mov", "avi", "mkv", "webm", "m4v", "mpeg", "mpg", "3gp"]);
const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tif", "tiff", "avif", "heic"]);

function getMediaType(file) {
  const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
  if (videoExtensions.has(extension)) return "video";
  if (imageExtensions.has(extension)) return "image";
  return "other";
}

function getFilteredFiles() {
  const type = mediaTypeFilter.value;
  const searchTerm = fileNameSearch.value.trim().toLocaleLowerCase("vi");
  return allFiles.filter((file) => {
    const matchesType = type === "all" || getMediaType(file) === type;
    const matchesName = !searchTerm || file.name.toLocaleLowerCase("vi").includes(searchTerm);
    return matchesType && matchesName;
  });
}

function getCurrentPageFiles() {
  const files = getFilteredFiles();
  const pageSize = Number(pageSizeSelect.value);
  const start = (currentPage - 1) * pageSize;
  return files.slice(start, start + pageSize);
}

function setResult(type, html) {
  result.hidden = false;
  result.className = `result ${type}`;
  result.innerHTML = html;
}

function setProgress(value) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
}

function setProgressText(stage, detail = "") {
  progressStage.textContent = stage;
  progressDetail.textContent = detail;
}

function closeProgressStream() {
  if (progressSource) {
    progressSource.close();
    progressSource = null;
  }
}

function startProgressStream(progressId) {
  closeProgressStream();
  progressSource = new EventSource(`/progress/${progressId}`);

  progressSource.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    setProgress(payload.percent);
    setProgressText(payload.stage, payload.detail);

    if (payload.done) {
      closeProgressStream();
    }
  };

  progressSource.onerror = () => {
    closeProgressStream();
  };
}

function showSelectedFile() {
  const file = input.files[0];
  fileName.textContent = file ? `${file.name} (${formatBytes(file.size)})` : "Chua co file nao duoc chon";
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function makeProgressId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function syncSelectionState() {
  const selectedCount = selectedKeys.size;
  const filteredFiles = getFilteredFiles();
  const allSelected = filteredFiles.length > 0 && filteredFiles.every((file) => selectedKeys.has(file.key));
  const pageFiles = getCurrentPageFiles();
  const pageSelected = pageFiles.length > 0 && pageFiles.every((file) => selectedKeys.has(file.key));
  selectAllButton.textContent = allSelected ? "Bo chon tat ca" : "Chon tat ca";
  selectPageButton.textContent = pageSelected ? "Bỏ chọn trang hiện tại" : "Chọn trang hiện tại";
  selectPageButton.disabled = pageFiles.length === 0;
  deleteSelectedButton.disabled = selectedCount === 0;
  downloadSelectedButton.disabled = selectedCount === 0;
  const selectedVideos = [...selectedKeys].filter((key) => {
    const file = allFiles.find((item) => item.key === key);
    return file && getMediaType(file) === "video";
  });
  transcodeSelectedButton.disabled = transcodeRunning || selectedVideos.length === 0;
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }
  const pages = [];
  for (let page = 1; page <= totalPages; page += 1) {
    if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1) {
      pages.push(`<button type="button" class="page-button ${page === currentPage ? "active" : ""}" data-page="${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`);
    } else if (pages.at(-1) !== '<span class="page-gap">…</span>') {
      pages.push('<span class="page-gap">…</span>');
    }
  }
  pagination.innerHTML = `
    <button type="button" class="page-button" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Trước</button>
    ${pages.join("")}
    <button type="button" class="page-button" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>Sau</button>`;
}

function renderFileList() {
  const files = getFilteredFiles();
  const pageSize = Number(pageSizeSelect.value);
  const totalPages = Math.max(1, Math.ceil(files.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const pageFiles = getCurrentPageFiles();
  const labels = {all: "file", video: "video", image: "hình ảnh"};
  fileListMeta.textContent = files.length
    ? `${files.length} ${labels[mediaTypeFilter.value]} · trang ${currentPage}/${totalPages}`
    : `Không có ${labels[mediaTypeFilter.value]}`;

  if (files.length === 0) {
    fileList.innerHTML = '<div class="empty-state">Không có file phù hợp với lựa chọn này.</div>';
    renderPagination(0);
    syncSelectionState();
    return;
  }

  fileList.innerHTML = pageFiles
    .map(
      (file) => `
        <article class="file-row">
          <label class="file-select">
            <input class="file-checkbox" type="checkbox" data-key="${escapeHtml(file.key)}" ${selectedKeys.has(file.key) ? "checked" : ""}>
          </label>
          <div class="file-main">
            <strong title="${escapeHtml(file.key)}">${escapeHtml(file.name)}</strong>
            <span>${formatBytes(file.size)} - ${formatDate(file.last_modified)}</span>
            <small>${escapeHtml(file.key)}</small>
          </div>
          <div class="file-actions">
            <a class="file-action view-action" href="/play?key=${encodeURIComponent(file.key)}" target="_blank" rel="noreferrer">Xem</a>
            <a class="file-action download-action" href="/download?key=${encodeURIComponent(file.key)}">Tai ve</a>
            <button class="file-action delete-action" type="button" data-key="${escapeHtml(file.key)}">Xoa</button>
          </div>
        </article>
      `
    )
    .join("");

  renderPagination(totalPages);
  syncSelectionState();
}

async function loadFiles() {
  fileListMeta.textContent = "Dang tai danh sach...";
  fileList.innerHTML = "";
  refreshFilesButton.disabled = true;
  deleteSelectedButton.disabled = true;
  downloadSelectedButton.disabled = true;
  deleteAllButton.disabled = true;

  try {
    const response = await fetch("/files");
    const payload = await response.json();

    if (!payload.ok) {
      fileListMeta.textContent = payload.message || "Khong tai duoc danh sach file.";
      return;
    }

    allFiles = payload.files;
    const remainingKeys = new Set(allFiles.map((file) => file.key));
    selectedKeys = new Set([...selectedKeys].filter((key) => remainingKeys.has(key)));
    currentPage = 1;
    renderFileList();
  } catch (error) {
    fileListMeta.textContent = "Khong ket noi duoc toi server.";
  } finally {
    refreshFilesButton.disabled = false;
    deleteAllButton.disabled = allFiles.length === 0;
  }
}

async function deleteFiles(keys) {
  if (!keys.length) {
    return;
  }

  const label = keys.length === 1 ? "file nay" : `${keys.length} file`;
  const confirmed = window.confirm(`Xoa ${label}?\n${keys.join("\n")}`);
  if (!confirmed) {
    return;
  }

  const response = await fetch("/files", {
    method: "DELETE",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({keys}),
  });
  const payload = await response.json();

  if (!payload.ok) {
    setResult("error", payload.message || "Xoa file that bai.");
    return;
  }

  setResult("ok", `Da xoa ${payload.deleted || keys.length} file.`);
  await loadFiles();
}

async function deleteFile(key) {
  await deleteFiles([key]);
}

input.addEventListener("change", showSelectedFile);

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragging");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragging");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");

  if (event.dataTransfer.files.length > 0) {
    input.files = event.dataTransfer.files;
    showSelectedFile();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const file = input.files[0];
  if (!file) {
    setResult("error", "Vui long chon file truoc khi upload.");
    return;
  }

  const progressId = makeProgressId();
  const data = new FormData();
  data.append("progress_id", progressId);
  data.append("file", file);

  button.disabled = true;
  button.textContent = "Dang upload...";
  result.hidden = true;
  setProgress(0);
  setProgressText("Dang gui file len server", "");
  startProgressStream(progressId);

  const request = new XMLHttpRequest();
  request.open("POST", "/upload");

  request.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 15);
      setProgress(percent);
      setProgressText("Dang gui file len server", `${formatBytes(event.loaded)} / ${formatBytes(event.total)}`);
    }
  });

  request.addEventListener("load", () => {
    button.disabled = false;
    button.textContent = "Upload multipart";

    let payload;
    try {
      payload = JSON.parse(request.responseText);
    } catch {
      closeProgressStream();
      setResult("error", "Server tra ve du lieu khong hop le.");
      return;
    }

    if (!payload.ok) {
      closeProgressStream();
      setProgress(0);
      setProgressText("Upload loi", "");
      setResult("error", payload.message || "Upload that bai.");
      return;
    }

    closeProgressStream();
    setProgress(100);
    setProgressText("Upload hoan tat", `${payload.parts} part`);
    setResult(
      "ok",
      `<strong>Upload thanh cong</strong><br>
       Bucket: ${payload.bucket}<br>
       Key: ${payload.key}<br>
       Parts: ${payload.parts}<br>
       <a href="${payload.url}" target="_blank" rel="noreferrer">Mo presigned URL</a><br>
       <a href="/download?key=${encodeURIComponent(payload.key)}">Tai file ve</a>`
    );
    loadFiles();
  });

  request.addEventListener("error", () => {
    closeProgressStream();
    button.disabled = false;
    button.textContent = "Upload multipart";
    setProgress(0);
    setProgressText("Upload loi", "");
    setResult("error", "Khong ket noi duoc toi server.");
  });

  request.send(data);
});

refreshFilesButton.addEventListener("click", loadFiles);

selectAllButton.addEventListener("click", () => {
  const filteredFiles = getFilteredFiles();
  if (filteredFiles.length === 0) {
    return;
  }

  const allSelected = filteredFiles.every((file) => selectedKeys.has(file.key));
  if (allSelected) {
    filteredFiles.forEach((file) => selectedKeys.delete(file.key));
  } else {
    filteredFiles.forEach((file) => selectedKeys.add(file.key));
  }

  fileList.querySelectorAll(".file-checkbox").forEach((checkbox) => {
    checkbox.checked = selectedKeys.has(checkbox.dataset.key);
  });
  syncSelectionState();
});

selectPageButton.addEventListener("click", () => {
  const pageFiles = getCurrentPageFiles();
  if (pageFiles.length === 0) return;

  const pageSelected = pageFiles.every((file) => selectedKeys.has(file.key));
  pageFiles.forEach((file) => {
    if (pageSelected) {
      selectedKeys.delete(file.key);
    } else {
      selectedKeys.add(file.key);
    }
  });

  fileList.querySelectorAll(".file-checkbox").forEach((checkbox) => {
    checkbox.checked = selectedKeys.has(checkbox.dataset.key);
  });
  syncSelectionState();
});

deleteSelectedButton.addEventListener("click", () => {
  deleteFiles([...selectedKeys]);
});

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

transcodeSelectedButton.addEventListener("click", async () => {
  const keys = [...selectedKeys].filter((key) => {
    const file = allFiles.find((item) => item.key === key);
    return file && getMediaType(file) === "video";
  });
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
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({progress_id: progressId, keys}),
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
            ? `Đã chuyển đổi ${progress.completed}/${progress.total} video.<br>${failures.map((item) => `<strong>${escapeHtml(item.key)}</strong><br>${escapeHtml(item.message)}`).join("<br><br>")}`
            : `Đã xử lý thành công ${progress.completed}/${progress.total} video sang định dạng tương thích trình duyệt.`
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
    transcodeStage.textContent = "Không thể chuyển đổi";
    transcodeDetail.textContent = error.message;
    setResult("error", escapeHtml(error.message));
    syncSelectionState();
  }
});

deleteAllButton.addEventListener("click", () => {
  const keys = getFilteredFiles().map((file) => file.key);
  deleteFiles(keys);
});

mediaTypeFilter.addEventListener("change", () => {
  currentPage = 1;
  renderFileList();
  deleteAllButton.disabled = getFilteredFiles().length === 0;
});

fileNameSearch.addEventListener("input", () => {
  currentPage = 1;
  renderFileList();
  deleteAllButton.disabled = getFilteredFiles().length === 0;
});

pageSizeSelect.addEventListener("change", () => {
  currentPage = 1;
  renderFileList();
});

pagination.addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (!pageButton || pageButton.disabled) return;
  currentPage = Number(pageButton.dataset.page);
  renderFileList();
});

fileList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".delete-action");
  if (!deleteButton) {
    return;
  }
  deleteFile(deleteButton.dataset.key);
});

fileList.addEventListener("change", (event) => {
  if (!event.target.matches(".file-checkbox")) {
    return;
  }

  const key = event.target.dataset.key;
  if (event.target.checked) {
    selectedKeys.add(key);
  } else {
    selectedKeys.delete(key);
  }
  syncSelectionState();
});

loadFiles();
