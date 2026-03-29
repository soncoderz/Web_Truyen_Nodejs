const env = require("../config/env");

const SUMMARY_REGEX_FLAGS = "iu";
const PROPER_NAME_PATTERN =
  /\b[\p{Lu}][\p{L}\p{M}'\u2019-]*(?:\s+[\p{Lu}][\p{L}\p{M}'\u2019-]*){0,2}\b/gu;
const NON_NAME_TOKENS = new Set([
  "Anh",
  "Chi",
  "Co",
  "Cau",
  "Em",
  "Toi",
  "Minh",
  "Day",
  "Do",
  "Hay",
  "Neu",
  "Nhung",
  "Va",
  "Mot",
  "Roi",
  "Khong",
  "Chuong",
  "Chapter",
  "Summary",
  "Light",
  "Novel",
  "Manga",
]);

const GEMINI_SUMMARY_PROMPT = `
Ban la bien tap vien noi dung cho mot nen tang doc truyen.

Nhiem vu:
Hay viet tom tat bang tieng Viet cho DUNG MOT chapter duoc cung cap.

Quy tac bat buoc:
- Dau ra chi la MOT doan van ngan gon, 1 den 2 cau, toi da 220 ky tu.
- Cau 1 neu su kien, xung dot hoac dien bien chinh cua chapter.
- Cau 2 neu cam xuc, quyet dinh, chuyen bien hoac ket qua o cuoi chapter.
- Chi tap trung vao noi dung xay ra trong chapter hien tai.
- Chi su dung thong tin co trong du lieu duoc cung cap.
- Duoc phep tham khao mo ta ngan cua truyen de hieu boi canh, nhan vat va tinh huong, nhung khong duoc bien mo ta tong quan do thanh ban tom tat chapter.
- Khong gioi thieu lai boi canh, the gioi, xuat than nhan vat hay muc tieu dai han cua ca truyen.
- Neu chapter co ten rieng cua nhan vat, dia danh, to chuc hoac danh xung dac thu, hay giu nguyen cac ten do trong ban tom tat.
- Uu tien goi nhan vat bang ten rieng thay vi cach noi mo ho nhu "mot co gai", "mot chang trai", "mot nguoi".
- Khong dua vao kien thuc ben ngoai, ke ca khi biet ten truyen, nhan vat hoac boi canh.
- Khong chep nguyen van hoi thoai, cau noi hay doan van; phai dien dat lai bang loi tom tat.
- Khong dung markdown, khong gach dau dong, khong them tieu de.
- Khong mo dau bang cac cau dan nhap nhu "Duoi day la noi dung..." hoac "Chapter Summary".
- Khong mo dau bang "Boi canh", "Chuong nay" hoac mot cau gioi thieu dai dong.
- Neu du lieu den tu hinh anh, hay dua vao khung tranh, bong thoai va dien bien trong anh de tom tat dung chapter nay.
- Bo qua watermark, credit scan, ten website va moi noi dung khong lien quan.
- Khong bia, khong suy dien, khong them tinh tiet ngoai du lieu duoc cung cap.

Muc tieu:
Viet mot doan tom tat tu nhien, ro rang, de doc, giong loi bien tap vien, va phan anh dung trong tam cua chapter.

Khong chap nhan:
- Mot doan chi dang nhac lai mo ta tong quan cua truyen.
- Mot doan chi doi lai van xuoi cua chapter ma khong rut ra y chinh.
`;

const GEMINI_SUMMARY_REWRITE_PROMPT = `
Ban dang sua lai mot ban tom tat chapter chua dat yeu cau.

Hay viet lai thanh mot doan tom tat tieng Viet ngan gon, ro rang, 1 den 2 cau, toi da 220 ky tu.

Quy tac bat buoc:
- Chi giu y chinh cua chapter hien tai.
- Viet theo loi tom tat cua bien tap vien, uu tien ngoi thu ba.
- Neu trong du lieu co ten rieng quan trong, hay giu nguyen 1 den 3 ten rieng phu hop trong ban tom tat.
- Khong chep lai hoi thoai, khong de dau ngoac kep, khong de giong van ke chuyen nguyen ban.
- Khong mo dau bang mo ta phong canh dai dong hay tam trang keo dai.
- Khong mo dau bang "Boi canh" hay cach dan nhap tuong tu.
- Khong nhac lai mo ta tong quan cua ca truyen.
- Chi tra ve ban tom tat da viet lai, khong giai thich them.
`;

const SUMMARY_PREFIX_PATTERNS = [
  new RegExp("^tom\\s+tat\\s*:?\\s*", SUMMARY_REGEX_FLAGS),
  new RegExp("^chapter\\s+summary\\s*:?\\s*", SUMMARY_REGEX_FLAGS),
  new RegExp(
    "^(?:duoi|sau)\\s+day\\s+la\\s+(?:noi\\s+dung|phan\\s+noi\\s+dung|van\\s+ban)(?:\\s+van\\s+ban)?(?:\\s+duoc\\s+trich\\s+xuat)?\\s+tu\\s+hinh\\s+anh\\s+ban\\s+da\\s+gui\\s*:?\\s*",
    SUMMARY_REGEX_FLAGS,
  ),
  new RegExp("^(?:ocr|transcription|image\\s+transcription)\\s*:?\\s*", SUMMARY_REGEX_FLAGS),
];
const STORY_CONTEXT_PREFIX_PATTERNS = [
  /^dưới đây là nội dung văn bản từ hình ảnh bạn đã gửi:\s*/iu,
  /^duoi day la noi dung van ban tu hinh anh ban da gui:\s*/iu,
  /^ocr\s*:?\s*/iu,
  /^transcription\s*:?\s*/iu,
];
const CHAPTER_TITLE_PREFIX_PATTERNS = [
  /^đọc truyện\s*/iu,
  /^doc truyen\s*/iu,
  /^read manga\s*/iu,
  /^read chapter\s*/iu,
];
const CHAPTER_TITLE_SUFFIX_PATTERNS = [
  /\s*chương mới nhất$/iu,
  /\s*chuong moi nhat$/iu,
  /\s*chapter latest$/iu,
];

const GENERIC_FALLBACK_PATTERNS = [
  /^boi canh\s*:/iu,
  /\bgom\s+\d+\s+trang\s+manga\b/iu,
  /\btap trung vao dien bien(?:\s+rieng)? cua chuong nay\b/iu,
  /\bthay doi tam ly cua nhan vat trong chapter nay\b/iu,
];

function isMangaStory(story) {
  return String(story?.type || "").toUpperCase() === "MANGA";
}

function getAiConfig() {
  return env.aiSummary || {};
}

function getSummaryOutputLimit() {
  const configuredLimit = Number(getAiConfig().maxOutputChars || 420);
  if (!Number.isFinite(configuredLimit) || configuredLimit <= 0) {
    return 220;
  }

  return Math.min(configuredLimit, 220);
}

async function generateSummary(story, chapter) {
  const generatedSummary = await tryGenerateAiSummary(story, chapter);
  if (
    generatedSummary &&
    !looksLikePoorSummary(story, chapter, generatedSummary)
  ) {
    return generatedSummary;
  }

  if (generatedSummary) {
    const rewrittenSummary = await tryRewriteAiSummary(story, chapter, generatedSummary);
    if (
      rewrittenSummary &&
      !looksLikePoorSummary(story, chapter, rewrittenSummary)
    ) {
      return rewrittenSummary;
    }
  }

  return buildFallbackSummary(story, chapter);
}

async function buildDisplaySummary(story, chapter) {
  const storedSummary = normalizeSummary(chapter?.summary);
  if (storedSummary && !looksLikePoorSummary(story, chapter, storedSummary)) {
    return storedSummary;
  }

  return generateSummary(story, chapter);
}

async function tryGenerateAiSummary(story, chapter) {
  return requestAiSummary(GEMINI_SUMMARY_PROMPT, await buildUserParts(story, chapter));
}

async function tryRewriteAiSummary(story, chapter, draftSummary) {
  return requestAiSummary(
    GEMINI_SUMMARY_REWRITE_PROMPT,
    await buildRewriteParts(story, chapter, draftSummary),
  );
}

async function requestAiSummary(systemPrompt, userParts) {
  const config = getAiConfig();
  if (!config.enabled || !config.apiKey) {
    return null;
  }

  try {
    const payload = {
      system_instruction: {
        parts: [{ text: String(systemPrompt || "").trim() }],
      },
      contents: [
        {
          role: "user",
          parts: userParts,
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 120,
        responseMimeType: "text/plain",
      },
    };

    const response = await fetch(
      `${normalizeBaseUrl(config.baseUrl)}/models/${config.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.max(Number(config.timeoutSeconds || 40), 5) * 1000),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      console.warn(
        `Gemini summary API returned status ${response.status}: ${extractRemoteError(body)}`,
      );
      return null;
    }

    const root = await response.json();
    const summary = extractGeminiText(root?.candidates);
    if (!summary) {
      console.warn("Gemini summary API returned an empty summary.");
      return null;
    }

    return normalizeSummary(summary);
  } catch (error) {
    console.warn(`Unable to generate chapter summary with Gemini: ${error.message}`);
    return null;
  }
}

async function buildRewriteParts(story, chapter, draftSummary) {
  const parts = [];

  if (isMangaStory(story)) {
    const imageParts = await buildSampleImageParts(chapter?.pages);
    parts.push(...imageParts);
  }

  const builder = [];
  builder.push(buildContextPrompt(story, chapter));
  builder.push(`Ban tom tat nhap can viet lai: ${defaultText(draftSummary, "Khong co")}`);
  builder.push("Hay viet lai ban tom tat nay cho dung y chinh va gon hon.");
  parts.push({ text: builder.join("\n") });

  return parts;
}

async function buildUserParts(story, chapter) {
  const parts = [];

  if (isMangaStory(story)) {
    const imageParts = await buildSampleImageParts(chapter?.pages);
    parts.push(...imageParts);
  }

  parts.push({ text: buildContextPrompt(story, chapter) });
  return parts;
}

async function buildSampleImageParts(imageUrls) {
  const sampledImageUrls = sampleImageUrls(imageUrls);
  const imageParts = await Promise.all(sampledImageUrls.map((imageUrl) => buildInlineImagePart(imageUrl)));

  return imageParts
    .filter(Boolean)
    .map((imagePart) => ({
      inline_data: {
        mime_type: imagePart.mimeType,
        data: imagePart.base64Data,
      },
    }));
}

async function buildInlineImagePart(imageUrl) {
  if (!imageUrl) {
    return null;
  }

  const config = getAiConfig();

  try {
    const response = await fetch(String(imageUrl), {
      headers: {
        "User-Agent": "WebTuyenOnline/1.0",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(
        Math.min(Math.max(Number(config.timeoutSeconds || 40), 5), 20) * 1000,
      ),
    });

    if (!response.ok) {
      console.warn(
        `Skipping manga image ${imageUrl} because download returned HTTP ${response.status}.`,
      );
      return null;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
      console.warn(`Skipping manga image ${imageUrl} because the file was empty.`);
      return null;
    }

    if (bytes.length > Number(config.maxImageBytes || 2097152)) {
      console.warn(
        `Skipping manga image ${imageUrl} because it exceeded ${config.maxImageBytes} bytes.`,
      );
      return null;
    }

    return {
      base64Data: bytes.toString("base64"),
      mimeType: resolveImageMimeType(response.headers.get("content-type"), imageUrl),
    };
  } catch (error) {
    console.warn(`Unable to load manga image ${imageUrl} for Gemini summary: ${error.message}`);
    return null;
  }
}

function buildContextPrompt(story, chapter) {
  const builder = [];
  const chapterContextTitle = pickUsefulChapterTitle(story, chapter);
  builder.push(`Loai: ${isMangaStory(story) ? "Manga" : "Light Novel"}`);
  builder.push(`Tieu de truyen: ${defaultText(story?.title, "Khong co")}`);
  const storyContextSnippet = buildStoryContextSnippet(story?.description);
  if (storyContextSnippet) {
    builder.push(
      `Mo ta truyen de lay ngu canh (khong duoc chep lai y nguyen van): ${storyContextSnippet}`,
    );
  }
  builder.push(`Chuong: ${defaultText(chapter?.chapterNumber, "Khong ro")}`);
  if (chapterContextTitle) {
    builder.push(`Tieu de chuong: ${chapterContextTitle}`);
  }
  builder.push(
    "Hay dung mo ta truyen chi nhu ngu canh rat ngan, nhung ban tom tat cuoi cung phai noi ve dien bien cua chapter hien tai.",
  );
  builder.push(
    "Neu tieu de chuong co ve la tieu de SEO tu web scan thi hay bo qua, uu tien noi dung chapter va hinh anh cua chapter.",
  );

  const candidateProperNames = extractCandidateProperNames(story, chapter);
  if (candidateProperNames.length > 0) {
    builder.push(
      `Ten rieng uu tien giu nguyen neu xuat hien trong chapter: ${candidateProperNames.join(", ")}`,
    );
  }

  if (isMangaStory(story)) {
    builder.push(`So trang: ${Array.isArray(chapter?.pages) ? chapter.pages.length : 0}`);
    builder.push(
      "Hay doc theo thu tu tu dau den cuoi chapter. Chi tap trung vao nhan vat, xung dot va dien bien xuat hien trong cac trang cua chuong nay. Neu co bong thoai hoac chu trong tranh, hay hieu noi dung de tom tat lai ngan gon. Khong nhac den mo ta tong quan cua ca truyen.",
    );
    return builder.join("\n");
  }

  builder.push(
    `Noi dung chuong (trich doan dai dien dau, giua, cuoi): ${buildNovelChapterExcerpt(chapter?.content)}`,
  );
  return builder.join("\n");
}

function buildFallbackSummary(story, chapter) {
  return isMangaStory(story)
    ? buildMangaFallback(story, chapter)
    : buildNovelFallback(story, chapter);
}

function buildNovelFallback(story, chapter) {
  const chapterNumber = defaultText(chapter?.chapterNumber, "nay");
  const usefulTitle = pickUsefulChapterTitle(story, chapter);
  const focusName = extractCandidateProperNames(story, chapter)[0];

  if (usefulTitle) {
    return normalizeSummary(
      `Chuong ${chapterNumber} xoay quanh ${usefulTitle} va mo ra mot chuyen bien moi o cuoi chapter.`,
    );
  }

  if (focusName) {
    return normalizeSummary(
      `Chuong ${chapterNumber} tap trung vao ${focusName} khi mot tinh huong moi day cao xung dot.`,
    );
  }

  return normalizeSummary(`Chuong ${chapterNumber} day mach truyen tien them voi mot dien bien moi.`);
}

function buildMangaFallback(story, chapter) {
  const chapterNumber = defaultText(chapter?.chapterNumber, "nay");
  const usefulTitle = pickUsefulChapterTitle(story, chapter);
  const focusName = extractCandidateProperNames(story, chapter)[0];

  if (usefulTitle) {
    return normalizeSummary(
      `Chuong ${chapterNumber} xoay quanh ${usefulTitle} va de lai mot nut that moi o cuoi chapter.`,
    );
  }

  if (focusName) {
    return normalizeSummary(
      `Chuong ${chapterNumber} tap trung vao ${focusName} truoc mot dien bien moi trong manh truyen nay.`,
    );
  }

  return normalizeSummary(`Chuong ${chapterNumber} day nhanh dien bien chinh bang mot tinh huong moi.`);
}

function buildStoryContextSnippet(description) {
  const cleanedDescription = cleanStoryContextText(description);
  if (!cleanedDescription) {
    return "";
  }

  return truncate(cleanedDescription, 110);
}

function trimTrailingPunctuation(value) {
  return String(value || "").replace(/[\s.,;:!?]+$/g, "").trim();
}

function cleanStoryContextText(value) {
  let cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return "";
  }

  let updated = true;
  while (updated && cleaned) {
    updated = false;
    for (const pattern of STORY_CONTEXT_PREFIX_PATTERNS) {
      const nextValue = cleaned.replace(pattern, "").trim();
      if (nextValue !== cleaned) {
        cleaned = nextValue;
        updated = true;
      }
    }
  }

  cleaned = cleaned.replace(/^[\s"'“”]+/, "").replace(/[\s"'“”]+$/, "").trim();
  return cleaned;
}

function cleanChapterTitleText(value) {
  let cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return "";
  }

  for (const pattern of CHAPTER_TITLE_PREFIX_PATTERNS) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  for (const pattern of CHAPTER_TITLE_SUFFIX_PATTERNS) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  return cleaned || normalizeWhitespace(value);
}

function pickUsefulChapterTitle(story, chapter) {
  const cleanedTitle = cleanChapterTitleText(chapter?.title);
  if (!cleanedTitle) {
    return "";
  }

  if (/\b(?:chuong|chương|chapter)\s*\d+\b/iu.test(cleanedTitle)) {
    return "";
  }

  const normalizedTitle = normalizeComparableText(cleanedTitle);
  if (!normalizedTitle) {
    return "";
  }

  const normalizedStoryTitle = normalizeComparableText(story?.title);
  if (normalizedStoryTitle && normalizedTitle === normalizedStoryTitle) {
    return "";
  }

  return cleanedTitle;
}

function normalizeComparableText(value) {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sampleImageUrls(imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return [];
  }

  const maxImageSamples = Math.max(Number(getAiConfig().maxImageSamples || 4), 6);
  const normalizedUrls = imageUrls.filter((url) => typeof url === "string" && url.trim());

  if (normalizedUrls.length <= maxImageSamples) {
    return normalizedUrls;
  }

  const sampled = new Set();
  const lastIndex = normalizedUrls.length - 1;
  for (let index = 0; index < maxImageSamples; index += 1) {
    const sampleIndex = Math.round((index * lastIndex) / (maxImageSamples - 1));
    sampled.add(normalizedUrls[sampleIndex]);
  }

  return Array.from(sampled);
}

function extractParagraphs(content) {
  if (!content || !String(content).trim()) {
    return [];
  }

  const normalized = String(content).replace(/\r\n/g, "\n").trim();
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((text) => normalizeWhitespace(text))
    .map((text) => sanitizeNarrativeParagraph(text))
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return deduplicateParagraphs(paragraphs);
  }

  return deduplicateParagraphs(
    normalized
      .split("\n")
      .map((text) => normalizeWhitespace(text))
      .map((text) => sanitizeNarrativeParagraph(text))
      .filter(Boolean),
  );
}

function extractGeminiText(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return null;
  }

  const text = parts
    .map((part) => String(part?.text || "").trim())
    .filter(Boolean)
    .join(" ");

  return text || null;
}

function extractRemoteError(body) {
  if (!body || !String(body).trim()) {
    return "Unknown error.";
  }

  try {
    const json = JSON.parse(body);
    const message = json?.error?.message || json?.message;
    if (message) {
      return String(message);
    }
  } catch (_error) {
    // Ignore parse failures and fall back to the raw body.
  }

  return truncate(String(body).replace(/[\r\n]+/g, " ").trim(), 240);
}

function buildNovelChapterExcerpt(content) {
  const config = getAiConfig();
  const paragraphs = extractParagraphs(content);

  if (paragraphs.length === 0) {
    return truncate(
      sanitizeNarrativeParagraph(normalizeWhitespace(content)),
      config.maxContentChars || 12000,
    );
  }

  if (paragraphs.length <= 6) {
    return truncate(
      normalizeWhitespace(paragraphs.join(" ")),
      config.maxContentChars || 12000,
    );
  }

  const sampledParagraphs = [];
  const lastIndex = paragraphs.length - 1;

  for (let index = 0; index < 6; index += 1) {
    const paragraphIndex = Math.round((index * lastIndex) / 5);
    const paragraph = paragraphs[paragraphIndex];
    if (!sampledParagraphs.includes(paragraph)) {
      sampledParagraphs.push(paragraph);
    }
  }

  return truncate(
    normalizeWhitespace(sampledParagraphs.join(" ")),
    config.maxContentChars || 12000,
  );
}

function extractCandidateProperNames(story, chapter) {
  const scores = new Map();
  collectProperNames(pickUsefulChapterTitle(story, chapter), scores, 3);
  collectProperNames(chapter?.content, scores, 1);

  return Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([name]) => name)
    .slice(0, 6);
}

function collectProperNames(text, scores, weight) {
  if (!text || !String(text).trim()) {
    return;
  }

  const matches = String(text).matchAll(PROPER_NAME_PATTERN);
  for (const match of matches) {
    const candidate = normalizeWhitespace(match[0]);
    if (!isLikelyProperName(candidate)) {
      continue;
    }

    scores.set(candidate, (scores.get(candidate) || 0) + weight);
  }
}

function isLikelyProperName(candidate) {
  if (!candidate || !String(candidate).trim()) {
    return false;
  }

  const normalizedCandidate = normalizeWhitespace(candidate);
  if (normalizedCandidate.length < 3) {
    return false;
  }

  if (NON_NAME_TOKENS.has(normalizedCandidate)) {
    return false;
  }

  if (/^\d+$/.test(normalizedCandidate)) {
    return false;
  }

  return true;
}

function deduplicateParagraphs(paragraphs) {
  const deduplicated = [];
  const seen = new Set();

  for (const paragraph of paragraphs) {
    const normalizedParagraph = normalizeWhitespace(paragraph);
    if (!normalizedParagraph) {
      continue;
    }

    const loweredParagraph = normalizedParagraph.toLowerCase();
    if (seen.has(loweredParagraph)) {
      continue;
    }

    seen.add(loweredParagraph);
    deduplicated.push(normalizedParagraph);
  }

  return deduplicated;
}

function sanitizeNarrativeParagraph(paragraph) {
  if (!paragraph || !String(paragraph).trim()) {
    return "";
  }

  const sanitized = String(paragraph)
    .replace(/(?<!\p{L})\d{1,4}(?!\p{L})/gu, " ")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  if (/^[\p{P}\s]*$/u.test(sanitized)) {
    return "";
  }

  return sanitized;
}

function normalizeSummary(rawSummary) {
  if (rawSummary === null || rawSummary === undefined) {
    return null;
  }

  let normalized = String(rawSummary)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  normalized = stripSummaryPrefixes(normalized);
  normalized = normalized.replace(/^[\s\-:;,.]+/, "").trim();

  if (!normalized) {
    return null;
  }

  if (
    normalized.length > 1 &&
    normalized.startsWith('"') &&
    normalized.endsWith('"')
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  const sentences = splitSummarySentences(normalized).slice(0, 2);
  normalized = normalizeWhitespace(sentences.join(" "));

  if (!normalized) {
    return null;
  }

  return truncateSummaryText(normalized, getSummaryOutputLimit());
}

function looksLikeStoryLevelSummary(story, chapter, summary) {
  const normalizedSummary = normalizeWhitespace(summary).toLowerCase();
  if (!normalizedSummary) {
    return true;
  }

  const normalizedStoryDescription = normalizeWhitespace(story?.description).toLowerCase();
  if (normalizedStoryDescription) {
    const comparisonSnippet = truncate(normalizedStoryDescription, 140).toLowerCase();
    const containsChapterSignals =
      normalizedSummary.includes("chuong") ||
      normalizedSummary.includes("dien bien") ||
      normalizedSummary.includes("trang");
    if (comparisonSnippet && normalizedSummary.includes(comparisonSnippet) && !containsChapterSignals) {
      return true;
    }
  }

  if (isMangaStory(story) && normalizedSummary.startsWith("chuong manga")) {
    return true;
  }

  return (
    normalizedSummary.includes("mo ta tong quan cua ca truyen") ||
    normalizedSummary.includes("cua ca truyen") ||
    normalizedSummary === normalizedStoryDescription ||
    normalizedSummary === `chuong ${defaultText(chapter?.chapterNumber, "")}`.trim().toLowerCase()
  );
}

function looksLikePoorSummary(story, chapter, summary) {
  return (
    looksLikeStoryLevelSummary(story, chapter, summary) ||
    looksLikeRawChapterExcerpt(story, chapter, summary) ||
    containsNarrativeVoice(summary) ||
    missesImportantProperNames(story, chapter, summary) ||
    looksLikeGenericFallbackSummary(summary) ||
    containsSourceNoise(summary)
  );
}

function looksLikeGenericFallbackSummary(summary) {
  const normalizedSummary = normalizeWhitespace(summary).toLowerCase();
  if (!normalizedSummary) {
    return true;
  }

  return GENERIC_FALLBACK_PATTERNS.some((pattern) => pattern.test(normalizedSummary));
}

function containsSourceNoise(summary) {
  const normalizedSummary = normalizeWhitespace(summary).toLowerCase();
  if (!normalizedSummary) {
    return true;
  }

  return (
    normalizedSummary.includes("dưới đây là nội dung văn bản từ hình ảnh bạn đã gửi") ||
    normalizedSummary.includes("duoi day la noi dung van ban tu hinh anh ban da gui") ||
    normalizedSummary.includes("đọc truyện") ||
    normalizedSummary.includes("doc truyen") ||
    normalizedSummary.includes("chương mới nhất") ||
    normalizedSummary.includes("chuong moi nhat")
  );
}

function looksLikeRawChapterExcerpt(story, chapter, summary) {
  const normalizedSummary = normalizeWhitespace(summary).toLowerCase();
  if (!normalizedSummary) {
    return true;
  }

  if (normalizedSummary.length > 320) {
    return true;
  }

  const sentenceMarkers = Array.from(normalizedSummary).filter((character) =>
    [".", "!", "?"].includes(character),
  ).length;
  if (sentenceMarkers > 4) {
    return true;
  }

  if (!isMangaStory(story)) {
    const normalizedContent = normalizeWhitespace(chapter?.content).toLowerCase();
    if (
      normalizedContent &&
      normalizedSummary.length >= 100 &&
      normalizedContent.includes(normalizedSummary)
    ) {
      return true;
    }
  }

  const quoteCount = Array.from(normalizedSummary).filter((character) => character === '"').length;
  return quoteCount >= 4;
}

function containsNarrativeVoice(summary) {
  const normalizedSummary = normalizeWhitespace(summary).toLowerCase();
  if (!normalizedSummary) {
    return true;
  }

  if (
    normalizedSummary.startsWith("minh ") ||
    normalizedSummary.startsWith("toi ") ||
    normalizedSummary.startsWith("em ") ||
    normalizedSummary.startsWith("anh ")
  ) {
    return true;
  }

  return (
    normalizedSummary.includes('"') ||
    normalizedSummary.includes("\u201c") ||
    normalizedSummary.includes("\u201d") ||
    normalizedSummary.includes("...") ||
    normalizedSummary.includes(" t\u00f4i ") ||
    normalizedSummary.includes(" m\u00ecnh ")
  );
}

function missesImportantProperNames(story, chapter, summary) {
  const candidateProperNames = extractCandidateProperNames(story, chapter);
  if (candidateProperNames.length === 0) {
    return false;
  }

  const normalizedSummary = normalizeWhitespace(summary).toLowerCase();
  if (!normalizedSummary) {
    return true;
  }

  const checkLimit = Math.min(candidateProperNames.length, 3);
  for (let index = 0; index < checkLimit; index += 1) {
    if (normalizedSummary.includes(candidateProperNames[index].toLowerCase())) {
      return false;
    }
  }

  return true;
}

function stripSummaryPrefixes(value) {
  let cleaned = String(value || "").trim();
  let updated = true;

  while (updated && cleaned) {
    updated = false;
    for (const pattern of SUMMARY_PREFIX_PATTERNS) {
      const nextValue = cleaned.replace(pattern, "").trim();
      if (nextValue !== cleaned) {
        cleaned = nextValue;
        updated = true;
      }
    }
  }

  return cleaned;
}

function resolveImageMimeType(contentType, imageUrl) {
  const normalizedContentType = String(contentType || "").trim().toLowerCase();
  if (normalizedContentType.startsWith("image/")) {
    return normalizedContentType.split(";")[0].trim();
  }

  const lowerUrl = String(imageUrl || "").toLowerCase();
  if (lowerUrl.endsWith(".png")) {
    return "image/png";
  }
  if (lowerUrl.endsWith(".webp")) {
    return "image/webp";
  }
  if (lowerUrl.endsWith(".gif")) {
    return "image/gif";
  }
  if (lowerUrl.endsWith(".bmp")) {
    return "image/bmp";
  }
  if (lowerUrl.endsWith(".avif")) {
    return "image/avif";
  }
  return "image/jpeg";
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitSummarySentences(value) {
  const normalized = normalizeWhitespace(value).replace(/([.!?])(?=[^\s])/g, "$1 ");
  const matches = normalized.match(/[^.!?]+(?:[.!?]+|$)/g);
  const sentences = Array.isArray(matches) ? matches : [normalized];

  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function truncateSummaryText(value, maxLength) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return ensureSentenceEnding(normalized);
  }

  let shortened = normalized.slice(0, maxLength).trim();
  const lastSpaceIndex = shortened.lastIndexOf(" ");
  if (lastSpaceIndex >= Math.floor(maxLength * 0.6)) {
    shortened = shortened.slice(0, lastSpaceIndex).trim();
  }

  shortened = shortened.replace(/[\s,;:.-]+$/g, "").trim();
  return ensureSentenceEnding(shortened);
}

function ensureSentenceEnding(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function truncate(value, maxLength) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(maxLength - 3, 1)).trim()}...`;
}

function defaultText(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
}

module.exports = {
  buildDisplaySummary,
  generateSummary,
  normalizeSummary,
};
