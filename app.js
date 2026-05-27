const CSV_PATH = "vendors.csv";

const state = {
  vendors: [],
  selectedCategory: "All",
  selectedNeighborhood: "All",
};

const elements = {
  categoryFilters: document.getElementById("categoryFilters"),
  neighborhoodFilters: document.getElementById("neighborhoodFilters"),
  vendorGrid: document.getElementById("vendorGrid"),
  statusMessage: document.getElementById("statusMessage"),
  modal: document.getElementById("vendorModal"),
  modalContent: document.getElementById("modalContent"),
};

const fallbackPhotoCache = new Map();
let lastFocusedElement = null;

init();

async function init() {
  setupModalEvents();
  await loadVendors();
  renderFilters();
  renderVendors();
}

async function loadVendors() {
  try {
    const response = await fetch(CSV_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const csvText = await response.text();
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
    });

    if (parsed.errors.length > 0) {
      console.warn("CSV parsing completed with warnings:", parsed.errors);
    }

    state.vendors = parsed.data
      .map(normalizeVendor)
      .filter((vendor) => vendor && vendor.name)
      .sort(sortVendors);

    if (state.vendors.length === 0) {
      elements.statusMessage.textContent =
        "No vendors found in vendors.csv yet.";
    } else {
      elements.statusMessage.textContent = "";
    }
  } catch (error) {
    console.error("Unable to load vendor data:", error);
    elements.statusMessage.textContent =
      "Could not load vendors.csv. Make sure it is in the repository root.";
  }
}

function normalizeVendor(row, index) {
  const vendor = {};
  const keys = [
    "id",
    "name",
    "category",
    "neighborhood",
    "tagline",
    "origin_story",
    "owner_name",
    "heritage",
    "photo",
    "website",
    "instagram",
    "date_supported",
    "featured",
  ];

  keys.forEach((key) => {
    vendor[key] = typeof row[key] === "string" ? row[key].trim() : "";
  });

  vendor.id = vendor.id || `vendor-${index + 1}`;
  vendor.featured = parseFeatured(vendor.featured);
  vendor.photoSrc = resolvePhoto(vendor.photo, vendor.name);
  vendor.websiteUrl = normalizeUrl(vendor.website, "website");
  vendor.instagramUrl = normalizeUrl(vendor.instagram, "instagram");
  vendor.dateLabel = formatDate(vendor.date_supported);

  return vendor;
}

function parseFeatured(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["true", "yes", "1", "featured", "y"].includes(normalized);
}

function normalizeUrl(rawValue, type) {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  if (type === "instagram") {
    if (value.startsWith("@")) {
      return `https://instagram.com/${value.slice(1)}`;
    }
    if (!value.includes("instagram.com") && !value.startsWith("http")) {
      return `https://instagram.com/${value.replace(/^@/, "")}`;
    }
  }

  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function formatDate(rawDate) {
  if (!rawDate) return "Not specified";
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return rawDate;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sortVendors(a, b) {
  if (a.featured !== b.featured) {
    return Number(b.featured) - Number(a.featured);
  }

  const dateA = Date.parse(a.date_supported) || 0;
  const dateB = Date.parse(b.date_supported) || 0;
  if (dateA !== dateB) return dateB - dateA;

  return a.name.localeCompare(b.name);
}

function resolvePhoto(photoValue, vendorName) {
  const trimmed = String(photoValue || "").trim();
  if (!trimmed) {
    return fallbackPhoto(vendorName);
  }
  if (/^(https?:\/\/|data:|\/|\.)/i.test(trimmed) || trimmed.includes("/")) {
    return trimmed;
  }
  return `images/${trimmed}`;
}

function fallbackPhoto(name) {
  const key = (name || "Vendor").slice(0, 20);
  if (fallbackPhotoCache.has(key)) {
    return fallbackPhotoCache.get(key);
  }
  const initials = key
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
  const safeInitials = initials || "V";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f7c79f"/><stop offset="100%" stop-color="#f3e1c6"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#88523a" font-size="140" font-family="Arial, sans-serif">${safeInitials}</text></svg>`;
  const dataUri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  fallbackPhotoCache.set(key, dataUri);
  return dataUri;
}

function filteredVendors() {
  return state.vendors.filter((vendor) => {
    const categoryMatch =
      state.selectedCategory === "All" ||
      vendor.category === state.selectedCategory;
    const neighborhoodMatch =
      state.selectedNeighborhood === "All" ||
      vendor.neighborhood === state.selectedNeighborhood;
    return categoryMatch && neighborhoodMatch;
  });
}

function uniqueValues(field) {
  const set = new Set();
  state.vendors.forEach((vendor) => {
    if (vendor[field]) {
      set.add(vendor[field]);
    }
  });
  return [...set].sort((a, b) => a.localeCompare(b));
}

function renderFilters() {
  renderPillGroup({
    mount: elements.categoryFilters,
    selected: state.selectedCategory,
    options: ["All", ...uniqueValues("category")],
    onChange: (value) => {
      state.selectedCategory = value;
      renderFilters();
      renderVendors();
    },
  });

  renderPillGroup({
    mount: elements.neighborhoodFilters,
    selected: state.selectedNeighborhood,
    options: ["All", ...uniqueValues("neighborhood")],
    onChange: (value) => {
      state.selectedNeighborhood = value;
      renderFilters();
      renderVendors();
    },
  });
}

function renderPillGroup({ mount, selected, options, onChange }) {
  mount.innerHTML = "";
  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pill";
    button.textContent = option || "Uncategorized";
    button.setAttribute("aria-pressed", option === selected ? "true" : "false");
    button.addEventListener("click", () => onChange(option));
    mount.appendChild(button);
  });
}

function renderVendors() {
  const vendors = filteredVendors();
  elements.vendorGrid.innerHTML = "";

  if (state.vendors.length > 0 && vendors.length === 0) {
    elements.statusMessage.textContent =
      "No vendors match these filters. Try broadening your selection.";
  } else if (state.vendors.length > 0) {
    elements.statusMessage.textContent = `${vendors.length} vendor${
      vendors.length === 1 ? "" : "s"
    } shown`;
  }

  vendors.forEach((vendor) => {
    elements.vendorGrid.appendChild(createVendorCard(vendor));
  });
}

function createVendorCard(vendor) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "vendor-card";
  card.setAttribute("aria-label", `View details for ${vendor.name}`);
  card.addEventListener("click", () => openVendorModal(vendor, card));

  const photoWrap = document.createElement("div");
  photoWrap.className = "photo-wrap";

  if (vendor.featured) {
    const featuredBadge = document.createElement("span");
    featuredBadge.className = "featured-badge";
    featuredBadge.textContent = "Featured";
    photoWrap.appendChild(featuredBadge);
  }

  const photo = document.createElement("img");
  photo.className = "vendor-photo";
  photo.src = vendor.photoSrc;
  photo.alt = `${vendor.name} photo`;
  photo.loading = "lazy";
  photo.addEventListener("error", () => {
    photo.src = fallbackPhoto(vendor.name);
  });
  photoWrap.appendChild(photo);

  const body = document.createElement("div");
  body.className = "card-body";

  const name = document.createElement("h3");
  name.className = "card-headline";
  name.textContent = vendor.name;

  const tagline = document.createElement("p");
  tagline.className = "card-tagline";
  tagline.textContent = vendor.tagline || "A local favorite worth discovering.";

  const meta = document.createElement("div");
  meta.className = "card-meta";
  [vendor.category, vendor.neighborhood].filter(Boolean).forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "meta-chip";
    chip.textContent = value;
    meta.appendChild(chip);
  });

  body.append(name, tagline, meta);
  card.append(photoWrap, body);
  return card;
}

function openVendorModal(vendor, triggerElement) {
  lastFocusedElement = triggerElement || document.activeElement;
  const websiteLink = vendor.websiteUrl
    ? `<a href="${escapeHtml(vendor.websiteUrl)}" target="_blank" rel="noopener noreferrer">Website</a>`
    : "";
  const instagramLink = vendor.instagramUrl
    ? `<a href="${escapeHtml(vendor.instagramUrl)}" target="_blank" rel="noopener noreferrer">Instagram</a>`
    : "";

  elements.modalContent.innerHTML = `
    <img class="modal-photo" src="${escapeHtml(vendor.photoSrc)}" alt="${escapeHtml(
      vendor.name
    )} photo" />
    <h2 id="modalVendorName" class="modal-title">${escapeHtml(vendor.name)}</h2>
    <p class="modal-subtitle">${escapeHtml(
      vendor.tagline || "Rooted in community."
    )}</p>
    <p class="modal-story">${escapeHtml(
      vendor.origin_story || "Origin story coming soon."
    )}</p>

    <dl class="modal-grid">
      <div class="modal-detail">
        <dt>Owner</dt>
        <dd>${escapeHtml(vendor.owner_name || "Not listed")}</dd>
      </div>
      <div class="modal-detail">
        <dt>Heritage</dt>
        <dd>${escapeHtml(vendor.heritage || "Not listed")}</dd>
      </div>
      <div class="modal-detail">
        <dt>Category</dt>
        <dd>${escapeHtml(vendor.category || "Not listed")}</dd>
      </div>
      <div class="modal-detail">
        <dt>Neighborhood</dt>
        <dd>${escapeHtml(vendor.neighborhood || "Not listed")}</dd>
      </div>
      <div class="modal-detail">
        <dt>Date Supported</dt>
        <dd>${escapeHtml(vendor.dateLabel)}</dd>
      </div>
    </dl>

    <div class="modal-links">${websiteLink}${instagramLink}</div>
  `;

  const modalImage = elements.modalContent.querySelector(".modal-photo");
  modalImage.addEventListener("error", () => {
    modalImage.src = fallbackPhoto(vendor.name);
  });

  elements.modal.classList.add("is-open");
  elements.modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  elements.modal.classList.remove("is-open");
  elements.modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  elements.modalContent.innerHTML = "";
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function setupModalEvents() {
  elements.modal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.modal.classList.contains("is-open")) {
      closeModal();
    }
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
