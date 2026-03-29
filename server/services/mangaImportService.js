const { load } = require("cheerio");
const httpError = require("../utils/httpError");
const {
  ensureCloudinaryConfigured,
  uploadBuffer,
} = require("./cloudinaryUploadService");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const IMAGE_FOLDER = "truyen_online/chapters";
const SCAN_TIMEOUT_MS = 90_000;
const IMAGE_TIMEOUT_MS = 60_000;
const MAX_IMPORT_IMAGES_PER_BATCH = 10;
const CONTENT_SELECTORS = [
  ".list-image",
  "#chapter-content",
  "#chapter",
  ".chapter-content",
  ".chapter-reader",
  ".reading-content",
  ".reading-detail",
  ".page-chapter",
  ".chapter-pages",
  ".read-content",
  ".entry-content",
  "article",
  "main",
];
const IMAGE_ATTRIBUTE_NAMES = [
  "src",
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-url",
  "data-image",
  "data-echo",
  "data-cfsrc",
  "data-fallback-src",
];
const POSITIVE_HINTS =
  /(chapter|chap|chuong|manga|comic|truyen|page|reader|reading|content|image|img|lazy|read|list-image)/i;
const CHAPTER_IMAGE_URL_HINTS =
  /(\/upload\/chaps?\/|\/chapter(?:s)?\/|\/chap(?:ter)?-\d+\/|\/comic\/|\/manga\/|\/truyen\/)/i;
const CHAPTER_IMAGE_CLASS_HINTS =
  /\b(list-image|page-image|chapter-image|reader-image|img-thumbnail|w-100)\b/i;
const NEGATIVE_HINTS =
  /(logo|icon|avatar|banner|ads?|cover|background|sprite|emoji|button|spinner|loading|header|footer|comment|user|author|profile)/i;
const THUMBNAIL_URL_HINTS = /(\/thumbs?\/|[_-]thumb(?:nail)?\b)/i;

let cachedPuppeteer = undefined;

function sanitizeMessage(message, fallback = "Unknown error.") {
  if (!message || !String(message).trim()) {
    return fallback;
  }

  return String(message).replace(/[\r\n]+/g, " ").trim();
}

function normalizeHttpUrl(value, errorMessage) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    throw httpError(400, errorMessage);
  }

  try {
    const url = new URL(rawValue);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Unsupported protocol");
    }
    return url.toString();
  } catch (_error) {
    throw httpError(400, errorMessage);
  }
}

function getFetchHeaders(extraHeaders = {}) {
  return {
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
    ...extraHeaders,
  };
}

function getTextFromCheerio($, selectors = []) {
  for (const selector of selectors) {
    const value =
      selector.startsWith("meta:")
        ? $(selector.slice("meta:".length)).attr("content")
        : $(selector).first().text();

    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function pickTitle($, fallback = "manga-chapter") {
  const rawTitle =
    getTextFromCheerio($, [
      'meta:meta[property="og:title"]',
      'meta:meta[name="twitter:title"]',
      "h1",
      "title",
    ]) || fallback;

  return sanitizeImportedTitle(rawTitle) || fallback;
}

function sanitizeImportedTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*[|\\-]\s*Doc truyen.*$/i, "")
    .replace(/\s*[|\\-]\s*Read manga.*$/i, "")
    .replace(/\s*[|\\-]\s*NetTruyen.*$/i, "")
    .replace(/\s*[|\\-]\s*BlogTruyen.*$/i, "")
    .trim();
}

function pickLargestSrcsetCandidate(value) {
  const entries = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    return "";
  }

  return entries[entries.length - 1].split(/\s+/)[0] || "";
}

function normalizeImageUrl(value, baseUrl) {
  const rawValue = String(value || "").trim();
  if (!rawValue || rawValue.startsWith("data:") || rawValue.startsWith("blob:")) {
    return null;
  }

  try {
    const url = new URL(rawValue, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return url.toString();
  } catch (_error) {
    return null;
  }
}

function isLikelyPageImage(candidate, preferredScope) {
  const metaText = [candidate.alt, candidate.className, candidate.id]
    .filter(Boolean)
    .join(" ");
  const combinedText = [candidate.url, metaText].filter(Boolean).join(" ");

  let score = preferredScope ? 20 : 0;

  if (POSITIVE_HINTS.test(combinedText)) {
    score += 15;
  }

  if (CHAPTER_IMAGE_URL_HINTS.test(candidate.url)) {
    score += 18;
  }

  if (CHAPTER_IMAGE_CLASS_HINTS.test(candidate.className)) {
    score += 10;
  }

  if (NEGATIVE_HINTS.test([candidate.url, candidate.alt, candidate.id].filter(Boolean).join(" "))) {
    score -= 25;
  }

  if (THUMBNAIL_URL_HINTS.test(candidate.url)) {
    score -= 15;
  }

  if (/\.svg(?:$|[?#])/i.test(candidate.url)) {
    score -= 100;
  }

  if (
    /\/(?:\d{2,4}|page[-_ ]?\d+)\.(?:jpe?g|png|gif|webp|avif|bmp)(?:$|[?#])/i.test(candidate.url)
  ) {
    score += 8;
  }

  if (candidate.width > 0 && candidate.height > 0 && candidate.width < 120 && candidate.height < 120) {
    score -= 20;
  }

  if (candidate.alt && /(page|trang|chuong|chapter)/i.test(candidate.alt)) {
    score += 8;
  }

  return score >= (preferredScope ? -5 : 5);
}

function collectCandidates($, roots, baseUrl, preferredScope = false) {
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (input, meta = {}) => {
    const url = normalizeImageUrl(input, baseUrl);
    if (!url || seen.has(url)) {
      return;
    }

    const candidate = {
      url,
      alt: String(meta.alt || "").trim(),
      className: String(meta.className || "").trim(),
      id: String(meta.id || "").trim(),
      width: Number(meta.width || 0),
      height: Number(meta.height || 0),
    };

    if (!isLikelyPageImage(candidate, preferredScope)) {
      return;
    }

    seen.add(url);
    candidates.push(url);
  };

  roots.each((_, rootElement) => {
    const root = $(rootElement);
    const elements = [];

    if (root.is("img") || root.is("source")) {
      elements.push(rootElement);
    }

    elements.push(...root.find("img, source").toArray());

    for (const element of elements) {
      const node = $(element);
      const meta = {
        alt: node.attr("alt"),
        className: node.attr("class"),
        id: node.attr("id"),
        width: node.attr("width"),
        height: node.attr("height"),
      };

      for (const attributeName of IMAGE_ATTRIBUTE_NAMES) {
        pushCandidate(node.attr(attributeName), meta);
      }

      pushCandidate(pickLargestSrcsetCandidate(node.attr("srcset")), meta);
      pushCandidate(pickLargestSrcsetCandidate(node.attr("data-srcset")), meta);
    }

    root.find("noscript").each((__, noscriptElement) => {
      const html = $(noscriptElement).html();
      if (!html) {
        return;
      }

      const $noscript = load(html);
      $noscript("img, source").each((___, element) => {
        const node = $noscript(element);
        const meta = {
          alt: node.attr("alt"),
          className: node.attr("class"),
          id: node.attr("id"),
          width: node.attr("width"),
          height: node.attr("height"),
        };

        for (const attributeName of IMAGE_ATTRIBUTE_NAMES) {
          pushCandidate(node.attr(attributeName), meta);
        }

        pushCandidate(pickLargestSrcsetCandidate(node.attr("srcset")), meta);
        pushCandidate(pickLargestSrcsetCandidate(node.attr("data-srcset")), meta);
      });
    });
  });

  return candidates;
}

function extractImagesFromHtml(html, pageUrl, titleOverride = "") {
  const $ = load(String(html || ""));
  let images = [];

  for (const selector of CONTENT_SELECTORS) {
    const roots = $(selector);
    if (!roots.length) {
      continue;
    }

    const scopedImages = collectCandidates($, roots, pageUrl, true);
    if (scopedImages.length >= 3) {
      images = scopedImages;
      break;
    }

    if (images.length === 0 && scopedImages.length > 0) {
      images = scopedImages;
    }
  }

  if (images.length === 0) {
    images = collectCandidates($, $("img, source"), pageUrl, false);
  }

  return {
    title: titleOverride || pickTitle($, "manga-chapter"),
    images,
  };
}

async function loadOptionalPuppeteer() {
  if (cachedPuppeteer !== undefined) {
    return cachedPuppeteer;
  }

  try {
    cachedPuppeteer = require("puppeteer");
  } catch (_error) {
    cachedPuppeteer = null;
  }

  return cachedPuppeteer;
}

async function scanWithFetch(url) {
  const response = await fetch(url, {
    headers: getFetchHeaders(),
    redirect: "follow",
    signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw httpError(502, `Khong the quet anh: Nguon tra ve HTTP ${response.status}.`);
  }

  const html = await response.text();
  return extractImagesFromHtml(html, response.url || url);
}

async function scanWithPuppeteer(url) {
  const puppeteer = await loadOptionalPuppeteer();
  if (!puppeteer) {
    return scanWithFetch(url);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
    });
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: SCAN_TIMEOUT_MS,
    });
    await page.waitForSelector("img", { timeout: 5000 }).catch(() => {});

    const [html, pageTitle, finalUrl] = await Promise.all([
      page.content(),
      page.title(),
      Promise.resolve(page.url()),
    ]);

    return extractImagesFromHtml(html, finalUrl || url, sanitizeImportedTitle(pageTitle));
  } finally {
    await browser.close();
  }
}

async function scanRemoteMangaSource({ url, usePuppeteer = false }) {
  const normalizedUrl = normalizeHttpUrl(url, "Loi: URL nguon khong hop le.");
  const puppeteerAvailable = Boolean(await loadOptionalPuppeteer());

  const result =
    usePuppeteer && puppeteerAvailable
      ? await scanWithPuppeteer(normalizedUrl)
      : await scanWithFetch(normalizedUrl);

  return {
    title: sanitizeImportedTitle(result.title) || "manga-chapter",
    totalImages: result.images.length,
    images: result.images,
    puppeteerAvailable,
  };
}

async function downloadRemoteImage(imageUrl, sourceUrl) {
  const response = await fetch(imageUrl, {
    headers: getFetchHeaders({
      Referer: sourceUrl,
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    }),
    redirect: "follow",
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Tai anh that bai, HTTP ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("File anh rong.");
  }

  return {
    data: bytes,
    contentType: response.headers.get("content-type") || "",
    finalUrl: response.url || imageUrl,
  };
}

function getImageExtension(imageUrl, contentType) {
  const normalizedContentType = String(contentType || "").toLowerCase();
  if (normalizedContentType.startsWith("image/")) {
    const extension = normalizedContentType
      .slice("image/".length)
      .split(";")[0]
      .trim();

    if (extension === "jpeg") {
      return "jpg";
    }

    if (["jpg", "png", "gif", "webp", "avif", "bmp"].includes(extension)) {
      return extension;
    }
  }

  try {
    const pathname = new URL(imageUrl).pathname;
    const extension = pathname.split(".").pop()?.toLowerCase() || "";
    if (extension === "jpeg") {
      return "jpg";
    }
    if (["jpg", "png", "gif", "webp", "avif", "bmp"].includes(extension)) {
      return extension;
    }
  } catch (_error) {
    // Ignore malformed URLs and use the default extension below.
  }

  return "jpg";
}

function buildFilename(index, imageUrl, contentType) {
  return `imported_page_${String(index + 1).padStart(3, "0")}.${getImageExtension(
    imageUrl,
    contentType,
  )}`;
}

async function importRemoteMangaPages({ sourceUrl, imageUrls }) {
  ensureCloudinaryConfigured();

  const normalizedSourceUrl = normalizeHttpUrl(
    sourceUrl,
    "Loi: URL trang nguon khong hop le.",
  );
  const normalizedImageUrls = Array.from(
    new Set(
      (Array.isArray(imageUrls) ? imageUrls : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  if (normalizedImageUrls.length === 0) {
    throw httpError(400, "Loi: Khong co anh nao de import.");
  }

  if (normalizedImageUrls.length > MAX_IMPORT_IMAGES_PER_BATCH) {
    throw httpError(
      400,
      `Loi: Moi lan chi import toi da ${MAX_IMPORT_IMAGES_PER_BATCH} anh.`,
    );
  }

  const urls = [];
  const failures = [];

  for (const [index, rawImageUrl] of normalizedImageUrls.entries()) {
    try {
      const normalizedImageUrl = normalizeHttpUrl(
        rawImageUrl,
        "Loi: Co URL anh khong hop le.",
      );
      const downloadedImage = await downloadRemoteImage(
        normalizedImageUrl,
        normalizedSourceUrl,
      );
      const uploadResult = await uploadBuffer(downloadedImage.data, {
        folder: IMAGE_FOLDER,
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
        filename_override: buildFilename(
          index,
          downloadedImage.finalUrl || normalizedImageUrl,
          downloadedImage.contentType,
        ),
      });

      if (uploadResult?.secure_url) {
        urls.push(uploadResult.secure_url);
        continue;
      }

      failures.push({
        index,
        url: normalizedImageUrl,
        message: "Cloudinary khong tra ve secure_url.",
      });
    } catch (error) {
      failures.push({
        index,
        url: rawImageUrl,
        message: sanitizeMessage(error.message),
      });
    }
  }

  return { urls, failures };
}

module.exports = {
  importRemoteMangaPages,
  scanRemoteMangaSource,
};
