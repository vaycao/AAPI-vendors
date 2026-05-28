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

    elements.statusMessage.textContent =
      state.vendors.length === 0
        ? "No vendors found in vendors.csv yet."
        : `${state.vendors.length} vendor${state.vendors.length === 1 ? "" : "s"} shown`;
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
    "interview_url",
    "interview_caption",
  ];

  keys.forEach((key) => {
    vendor[key] = typeof row[key] === "string" ? row[key].trim() : "";
  });

  vendor.id = vendor.id || `vendor-${index + 1}`;
  vendor.featured = parseFeatured(vendor.featured);
  vendor.websiteUrl = normalizeUrl(vendor.website, "website");
  vendor.instagramUrl = normalizeUrl(vendor.instagram, "instagram");
  vendor.dateLabel = formatDate(vendor.date_supported);
  vendor.photoCandidates = resolvePhotoCandidates(vendor.photo, vendor.name);
  vendor.photoFallback = fallbackPhoto(vendor.name);
  vendor.interviewVideoId = extractYouTubeId(vendor.interview_url);
  vendor.interviewEmbedUrl = vendor.interviewVideoId
    ? `https://www.youtube.com/embed/${vendor.interviewVideoId}`
    : "";

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
  if (!rawDate) return "";
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

function resolvePhotoCandidates(photoValue, vendorName) {
  const trimmed = String(photoValue || "").trim();
  if (!trimmed) {
    return [fallbackPhoto(vendorName)];
  }

  if (/^(https?:\/\/|data:|\/|\.)/i.test(trimmed) || trimmed.includes("/")) {
    return [trimmed];
  }

  // Support both the intended images/ folder and existing root-level filenames.
  return [`images/${trimmed}`, trimmed];
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
    button.textContent = option;
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
  const card = document.createElement("article");
  card.className = "vendor-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `View details for ${vendor.name}`);

  const openDetails = () => openVendorModal(vendor, card);
  card.addEventListener("click", openDetails);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetails();
    }
  });

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
  photo.alt = `${vendor.name} photo`;
  photo.loading = "lazy";
  photo.addEventListener("load", () => {
    tuneCardImagePresentation(photo, photoWrap);
  });
  setImageSourceWithFallback(photo, vendor.photoCandidates, vendor.photoFallback);
  photoWrap.appendChild(photo);

  const body = document.createElement("div");
  body.className = "card-body";

  const name = document.createElement("h3");
  name.className = "card-headline";
  name.textContent = vendor.name;

  body.append(name);

  if (vendor.tagline) {
    const tagline = document.createElement("p");
    tagline.className = "card-tagline";
    tagline.textContent = vendor.tagline;
    body.appendChild(tagline);
  }

  if (vendor.interviewEmbedUrl) {
    const interviewLink = document.createElement("a");
    interviewLink.href = "#";
    interviewLink.className = "card-interview-link";
    interviewLink.innerHTML = "Watch Interview <span class=\"card-interview-icon\" aria-hidden=\"true\">-&gt;</span>";
    interviewLink.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openVendorModal(vendor, interviewLink);
      scrollModalToInterview();
    });
    body.appendChild(interviewLink);
  }

  const meta = document.createElement("div");
  meta.className = "card-meta";
  [vendor.category, vendor.neighborhood]
    .filter(Boolean)
    .forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "meta-chip";
      chip.textContent = value;
      meta.appendChild(chip);
    });

  if (meta.childElementCount > 0) {
    body.appendChild(meta);
  }

  card.append(photoWrap, body);
  return card;
}

function openVendorModal(vendor, triggerElement) {
  lastFocusedElement = triggerElement || document.activeElement;

  const subtitleHtml = vendor.tagline
    ? `<p class="modal-subtitle">${escapeHtml(vendor.tagline)}</p>`
    : "";

  const storyHtml = vendor.origin_story
    ? `<p class="modal-story">${escapeHtml(vendor.origin_story)}</p>`
    : "";

  const detailItems = [
    ["Owner", vendor.owner_name],
    ["Heritage", vendor.heritage],
    ["Category", vendor.category],
    ["Neighborhood", vendor.neighborhood],
    ["Date Supported", vendor.dateLabel],
  ].filter(([, value]) => Boolean(value));

  const detailsHtml =
    detailItems.length > 0
      ? `<dl class="modal-grid">${detailItems
          .map(
            ([label, value]) => `
              <div class="modal-detail">
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(value)}</dd>
              </div>`
          )
          .join("")}</dl>`
      : "";

  const linksHtml = [
    vendor.websiteUrl
      ? `<a href="${escapeHtml(vendor.websiteUrl)}" target="_blank" rel="noopener noreferrer">Website</a>`
      : "",
    vendor.instagramUrl
      ? `<a href="${escapeHtml(vendor.instagramUrl)}" target="_blank" rel="noopener noreferrer">Instagram</a>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const videoCaptionHtml = vendor.interview_caption
    ? `<p class="modal-video-caption">${escapeHtml(vendor.interview_caption)}</p>`
    : "";

  const videoHtml = vendor.interviewEmbedUrl
    ? `<section class="modal-video-section">
        ${videoCaptionHtml}
        <iframe
          class="modal-video-frame"
          src="${escapeHtml(vendor.interviewEmbedUrl)}"
          title="YouTube interview with ${escapeHtml(vendor.name)}"
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </section>`
    : "";

  elements.modalContent.innerHTML = `
    <img class="modal-photo" alt="${escapeHtml(vendor.name)} photo" />
    <h2 id="modalVendorName" class="modal-title">${escapeHtml(vendor.name)}</h2>
    ${subtitleHtml}
    ${videoHtml}
    ${storyHtml}
    ${detailsHtml}
    ${linksHtml ? `<div class="modal-links">${linksHtml}</div>` : ""}
  `;

  const modalImage = elements.modalContent.querySelector(".modal-photo");
  modalImage.addEventListener("load", () => {
    tuneModalImagePresentation(modalImage);
  });
  setImageSourceWithFallback(modalImage, vendor.photoCandidates, vendor.photoFallback);

  elements.modal.classList.add("is-open");
  elements.modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function scrollModalToInterview() {
  requestAnimationFrame(() => {
    const interviewSection = elements.modalContent.querySelector(".modal-video-section");
    if (interviewSection instanceof HTMLElement) {
      interviewSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
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

function extractYouTubeId(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) return "";

  const maybeId = input.match(/^[A-Za-z0-9_-]{11}$/);
  if (maybeId) return maybeId[0];

  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch (error) {
    return "";
  }

  const host = parsed.hostname.toLowerCase();
  let id = "";

  if (host === "youtu.be" || host.endsWith(".youtu.be")) {
    id = parsed.pathname.split("/").filter(Boolean)[0] || "";
  } else if (host.includes("youtube.com")) {
    if (parsed.pathname === "/watch") {
      id = parsed.searchParams.get("v") || "";
    } else if (parsed.pathname.startsWith("/embed/")) {
      id = parsed.pathname.split("/")[2] || "";
    }
  }

  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return "";
  }

  return id;
}

function setImageSourceWithFallback(imageElement, candidates, fallbackSrc) {
  const queue = [...new Set((candidates || []).filter(Boolean))];
  let index = 0;

  const loadAtIndex = () => {
    if (index < queue.length) {
      imageElement.src = queue[index];
      return;
    }

    imageElement.src = fallbackSrc;
  };

  imageElement.addEventListener("error", () => {
    index += 1;
    loadAtIndex();
  });

  loadAtIndex();
}

function tuneCardImagePresentation(imageElement, container) {
  const width = imageElement.naturalWidth || 0;
  const height = imageElement.naturalHeight || 1;
  const ratio = width / height;

  container.dataset.ratio = "standard";
  imageElement.classList.remove("vendor-photo--contain");

  if (ratio < 0.9) {
    container.dataset.ratio = "portrait";
    imageElement.classList.add("vendor-photo--contain");
  } else if (ratio > 1.7) {
    container.dataset.ratio = "wide";
  }
}

function tuneModalImagePresentation(imageElement) {
  const width = imageElement.naturalWidth || 0;
  const height = imageElement.naturalHeight || 1;
  const ratio = width / height;

  imageElement.classList.remove("modal-photo--contain");
  if (ratio < 1.1) {
    imageElement.classList.add("modal-photo--contain");
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
