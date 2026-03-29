const env = require("../config/env");
const { ensureArray, hasText } = require("../utils/normalize");

const CHAT_SYSTEM_PROMPT = `
Ban la tro ly AI cho Web Truyen Online.

Muc tieu:
- Tra loi bang tieng Viet, ro rang, tu nhien.
- Uu tien goi y truy?n dua tren du lieu catalog duoc cung cap.
- Khi de xuat truy?n, neu ten truy?n va ly do ngan gon.

Quy tac:
- Chi duoc dua vao du lieu catalog trong prompt.
- Khong bịa thong tin ngoai du lieu.
- Neu nguoi dung hoi chung chung, hay goi y cach tim truyen theo the loai, tac gia, tinh trang hoac do hot.
- Tra loi ngan gon, toi da 5 cau hoac 4 gach dau dong.
- Neu co 2 den 4 truy?n phu hop, hay uu tien neu ten truy?n truoc.
`;

const GENERIC_QUERY_TOKENS = new Set([
  "ai",
  "bao",
  "chat",
  "chi",
  "chi tiet",
  "chuong",
  "co",
  "cua",
  "danh gia",
  "doc",
  "duoc",
  "gioi thieu",
  "gi",
  "goi",
  "hay",
  "hien",
  "la",
  "minh",
  "mot",
  "nhieu",
  "nao",
  "nhe",
  "noi dung",
  "so",
  "thong tin",
  "tim",
  "truyen",
  "xem",
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function truncateText(value, maxLength = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(maxLength - 3, 1)).trim()}...`;
}

function formatTypeLabel(type) {
  return String(type || "").toUpperCase() === "MANGA" ? "truyen tranh" : "light novel";
}

function formatStatusLabel(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ONGOING") {
    return "Dang ra";
  }
  if (normalized === "COMPLETED") {
    return "Hoan thanh";
  }
  if (normalized === "DROPPED") {
    return "Tam dung";
  }

  return "Chua ro";
}

function extractCharacterName(message) {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) {
    return "";
  }

  const patterns = [
    /\bnhan vat ten\s+([a-z0-9][a-z0-9\s-]{1,40})$/i,
    /\bnhan vat\s+ten\s+([a-z0-9][a-z0-9\s-]{1,40})\b/i,
    /\bnhan vat\s+([a-z0-9][a-z0-9\s-]{1,40})$/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedMessage.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    return match[1]
      .replace(/\b(la|nao|khong|co|trong|xuat hien|o dau|khong)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function findCharacterStories(characterName, stories, limit = 6) {
  const normalizedName = normalizeText(characterName);
  if (!normalizedName) {
    return [];
  }

  const nameTokens = tokenize(normalizedName).filter(
    (token) => !GENERIC_QUERY_TOKENS.has(token),
  );

  return ensureArray(stories)
    .map((story) => {
      const normalizedDescription = normalizeText(story?.description);
      const normalizedTitle = normalizeText(story?.title);
      let score = 0;

      if (normalizedDescription.includes(normalizedName)) {
        score += 120;
      }
      if (normalizedTitle.includes(normalizedName)) {
        score += 90;
      }

      const matchedTokens = nameTokens.filter(
        (token) => normalizedDescription.includes(token) || normalizedTitle.includes(token),
      );

      score += matchedTokens.length * 18;
      score += computePopularity(story);

      return {
        story,
        score,
        matchedTokens,
      };
    })
    .filter((item) => item.score >= computePopularity(item.story) + 18)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.story);
}

function buildCharacterSearchReply(characterName, stories) {
  const normalizedName = String(characterName || "").trim();
  const selectedStories = ensureArray(stories).slice(0, 3);

  if (!selectedStories.length) {
    return `Mình chưa tìm thấy truyện nào trong database có mô tả chứa nhân vật tên ${normalizedName}.`;
  }

  if (selectedStories.length === 1) {
    const story = selectedStories[0];
    const authorNames = ensureArray(story?.authors).map((item) => item?.name).filter(Boolean);
    const categoryNames = ensureArray(story?.categories).map((item) => item?.name).filter(Boolean);
    const fragments = [];

    if (categoryNames.length > 0) {
      fragments.push(`the loai ${categoryNames.slice(0, 2).join(", ")}`);
    }
    if (authorNames.length > 0) {
      fragments.push(`tac gia ${authorNames[0]}`);
    }

    return [
      `Mình tìm thấy truyện có nhân vật tên ${normalizedName}: ${story.title}.`,
      fragments.length > 0 ? `${story.title} co ${fragments.join(", ")}.` : null,
      hasText(story?.description) ? `Mo ta ngan: ${truncateText(story.description, 180)}` : null,
    ].filter(Boolean).join(" ");
  }

  const lines = selectedStories.map((story, index) => {
    const reason = buildStoryReason(story);
    return `${index + 1}. ${story.title}${reason ? ` - ${reason}` : ""}.`;
  });

  return [`Mình tìm thấy các truyện có thể chứa nhân vật tên ${normalizedName}:`, ...lines].join("\n");
}

function buildStorySearchText(story) {
  const typeLabel = String(story?.type || "").toUpperCase() === "MANGA" ? "manga truyen tranh" : "novel light novel";
  const statusMap = {
    ONGOING: "dang ra ongoing",
    COMPLETED: "hoan thanh completed",
    DROPPED: "tam dung dropped",
  };

  const categoryText = ensureArray(story?.categories)
    .map((item) => `${item?.name || ""} ${item?.description || ""}`.trim())
    .join(" ");
  const authorText = ensureArray(story?.authors)
    .map((item) => `${item?.name || ""} ${item?.description || ""}`.trim())
    .join(" ");

  return normalizeText([
    story?.title,
    story?.description,
    categoryText,
    authorText,
    Number(story?.chapterCount || 0) > 0 ? `${Number(story.chapterCount)} chuong` : "",
    typeLabel,
    statusMap[String(story?.status || "").toUpperCase()] || "",
  ].join(" "));
}

function computePopularity(story) {
  const followers = Math.log1p(Number(story?.followers || 0)) * 6;
  const views = Math.log1p(Number(story?.views || 0)) * 4;
  const rating = Number(story?.averageRating || 0) * 5;
  const totalRatings = Math.log1p(Number(story?.totalRatings || 0)) * 3;
  return followers + views + rating + totalRatings;
}

function scoreStoryForMessage(story, messageTokens, rawMessage = "") {
  const normalizedMessage = normalizeText(rawMessage || messageTokens.join(" "));
  const normalizedTitle = normalizeText(story?.title);
  const searchText = buildStorySearchText(story);
  let score = 0;

  if (normalizedTitle && normalizedMessage.includes(normalizedTitle)) {
    score += 80;
  } else if (normalizedMessage && normalizedTitle.includes(normalizedMessage) && normalizedMessage.length >= 6) {
    score += 32;
  }

  const titleTokens = tokenize(story?.title).filter(
    (token) => !GENERIC_QUERY_TOKENS.has(token),
  );
  const titleHitCount = titleTokens.filter((token) => messageTokens.includes(token)).length;
  if (titleHitCount > 0) {
    score += titleHitCount * 18;
    if (titleHitCount >= Math.min(2, Math.max(titleTokens.length, 1))) {
      score += 20;
    }
  }

  for (const token of messageTokens) {
    if (!token || GENERIC_QUERY_TOKENS.has(token)) {
      continue;
    }

    if (normalizeText(story?.title).includes(token)) {
      score += 12;
      continue;
    }

    const categoryMatch = ensureArray(story?.categories).some((item) =>
      normalizeText(item?.name).includes(token),
    );
    if (categoryMatch) {
      score += 10;
      continue;
    }

    const authorMatch = ensureArray(story?.authors).some((item) =>
      normalizeText(item?.name).includes(token),
    );
    if (authorMatch) {
      score += 11;
      continue;
    }

    if (searchText.includes(token)) {
      score += 4;
    }
  }

  if (!messageTokens.length || normalizedMessage.length < 4) {
    score += 1;
  }

  score += computePopularity(story);
  return score;
}

function rankStoriesForMessage(message, stories) {
  const messageTokens = Array.from(new Set(tokenize(message)));
  const rankedStories = ensureArray(stories)
    .map((story) => ({
      story,
      score: scoreStoryForMessage(story, messageTokens, message),
    }))
    .sort((left, right) => right.score - left.score);

  return {
    messageTokens,
    rankedStories,
  };
}

function pickRelevantStories(message, stories, limit = 8) {
  const { rankedStories } = rankStoriesForMessage(message, stories);
  const usefulMatches = rankedStories.filter((item) => item.score > computePopularity(item.story));
  const selected = (usefulMatches.length > 0 ? usefulMatches : rankedStories)
    .slice(0, limit)
    .map((item) => item.story);

  return selected;
}

function pickPrimaryStory(messageTokens, rankedStories) {
  const topItem = ensureArray(rankedStories)[0];
  if (!topItem?.story) {
    return null;
  }

  const titleTokens = tokenize(topItem.story.title).filter(
    (token) => !GENERIC_QUERY_TOKENS.has(token),
  );
  const titleHitCount = titleTokens.filter((token) => messageTokens.includes(token)).length;
  const topPopularity = computePopularity(topItem.story);
  const secondScore = Number(ensureArray(rankedStories)[1]?.score || 0);

  if (titleHitCount >= Math.min(2, Math.max(titleTokens.length, 1))) {
    return topItem.story;
  }

  if (topItem.score >= topPopularity + 18 && topItem.score >= secondScore + 6) {
    return topItem.story;
  }

  return null;
}

function buildCatalogSnippet(stories) {
  return ensureArray(stories)
    .map((story, index) => {
      const categories = ensureArray(story?.categories).map((item) => item?.name).filter(Boolean).join(", ");
      const authors = ensureArray(story?.authors).map((item) => item?.name).filter(Boolean).join(", ");
      return [
        `${index + 1}. ${story?.title || "Khong ro ten"}`,
        `Loai: ${story?.type === "MANGA" ? "Manga" : "Light Novel"}`,
        `Tinh trang: ${story?.status || "Khong ro"}`,
        categories ? `The loai: ${categories}` : null,
        authors ? `Tac gia: ${authors}` : null,
        story?.description ? `Mo ta: ${String(story.description).replace(/\s+/g, " ").trim().slice(0, 280)}` : null,
        Number(story?.chapterCount || 0) > 0 ? `So chuong: ${Number(story.chapterCount)}` : null,
        `Theo doi: ${Number(story?.followers || 0).toLocaleString("vi-VN")}`,
        `Danh gia: ${Number(story?.averageRating || 0).toFixed(1)}/5 (${Number(story?.totalRatings || 0).toLocaleString("vi-VN")} danh gia)`,
        `Luot xem: ${Number(story?.views || 0).toLocaleString("vi-VN")}`,
      ].filter(Boolean).join(" | ");
    })
    .join("\n");
}

function buildHistorySnippet(history) {
  return ensureArray(history)
    .slice(-6)
    .map((item) => {
      const role = String(item?.role || "").toLowerCase() === "assistant" ? "Tro ly" : "Nguoi dung";
      const text = String(item?.text || item?.content || "").replace(/\s+/g, " ").trim();
      if (!text) {
        return null;
      }

      return `${role}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

function looksLikePoorChatReply(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return true;
  }

  if (text.length < 48) {
    return true;
  }

  const words = text.split(" ").filter(Boolean);
  if (words.length < 8) {
    return true;
  }

  if (!/[.!?\n]$/.test(text) && text.length < 120) {
    return true;
  }

  return false;
}

async function requestCatalogChatReply(message, history, stories) {
  const config = env.aiSummary || {};
  if (!config.enabled || !config.apiKey) {
    return null;
  }

  const historySnippet = buildHistorySnippet(history);
  const catalogSnippet = buildCatalogSnippet(stories);
  const userPrompt = [
    historySnippet ? `Hoi thoai gan day:\n${historySnippet}` : null,
    `Cau hoi hien tai: ${String(message || "").trim()}`,
    `Catalog truyen de tham khao:\n${catalogSnippet}`,
  ].filter(Boolean).join("\n\n");

  try {
    const response = await fetch(
      `${String(config.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "")}/models/${config.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: CHAT_SYSTEM_PROMPT.trim() }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 280,
            responseMimeType: "text/plain",
          },
        }),
        signal: AbortSignal.timeout(Math.max(Number(config.timeoutSeconds || 40), 5) * 1000),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      console.warn(`Catalog chat Gemini API returned status ${response.status}: ${body.slice(0, 240)}`);
      return null;
    }

    const root = await response.json();
    const text = ensureArray(root?.candidates?.[0]?.content?.parts)
      .map((part) => String(part?.text || "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();

    if (looksLikePoorChatReply(text)) {
      return null;
    }

    return text;
  } catch (error) {
    console.warn(`Unable to generate catalog chat reply with Gemini: ${error.message}`);
    return null;
  }
}

function buildStoryReason(story) {
  const fragments = [];
  const categories = ensureArray(story?.categories).map((item) => item?.name).filter(Boolean);
  const authors = ensureArray(story?.authors).map((item) => item?.name).filter(Boolean);

  if (categories.length > 0) {
    fragments.push(`the loai ${categories.slice(0, 2).join(", ")}`);
  }
  if (authors.length > 0) {
    fragments.push(`tac gia ${authors[0]}`);
  }
  if (Number(story?.averageRating || 0) >= 4) {
    fragments.push(`rating ${Number(story.averageRating).toFixed(1)}/5`);
  } else if (Number(story?.followers || 0) > 0) {
    fragments.push(`${Number(story.followers).toLocaleString("vi-VN")} theo doi`);
  }
  if (fragments.length < 2 && Number(story?.chapterCount || 0) > 0) {
    fragments.push(`${Number(story.chapterCount)} chuong`);
  }

  return fragments.slice(0, 2).join(", ");
}

function buildStoryFactReply(story, normalizedMessage) {
  const title = story?.title || "Truyen nay";
  const authors = ensureArray(story?.authors).map((item) => item?.name).filter(Boolean);
  const categories = ensureArray(story?.categories).map((item) => item?.name).filter(Boolean);
  const chapterCount = Math.max(0, Number(story?.chapterCount || 0));
  const followers = Math.max(0, Number(story?.followers || 0));
  const views = Math.max(0, Number(story?.views || 0));
  const rating = Math.max(0, Number(story?.averageRating || 0));
  const totalRatings = Math.max(0, Number(story?.totalRatings || 0));
  const replyParts = [];

  if (/\btac gia\b|\bai viet\b|\bnguoi viet\b/.test(normalizedMessage)) {
    replyParts.push(
      authors.length > 0
        ? `Tac gia cua ${title} la ${authors.join(", ")}.`
        : `${title} chua co thong tin tac gia.`,
    );
  }

  if (/\bthe loai\b|\bdanh muc\b/.test(normalizedMessage)) {
    replyParts.push(
      categories.length > 0
        ? `${title} thuoc the loai ${categories.join(", ")}.`
        : `${title} chua co thong tin the loai.`,
    );
  }

  if (/\btrang thai\b|\bdang ra\b|\bhoan thanh\b|\btam dung\b/.test(normalizedMessage)) {
    replyParts.push(`${title} hien o trang thai ${formatStatusLabel(story?.status)}.`);
  }

  if (/\bbao nhieu chuong\b|\bso chuong\b|\bchuong\b/.test(normalizedMessage)) {
    replyParts.push(`${title} hien co ${chapterCount.toLocaleString("vi-VN")} chuong.`);
  }

  if (/\bluot xem\b|\bview\b/.test(normalizedMessage)) {
    replyParts.push(`${title} hien co ${views.toLocaleString("vi-VN")} luot xem.`);
  }

  if (/\btheo doi\b|\bfollow\b/.test(normalizedMessage)) {
    replyParts.push(`${title} hien co ${followers.toLocaleString("vi-VN")} theo doi.`);
  }

  if (/\bdanh gia\b|\brating\b|\bsao\b/.test(normalizedMessage)) {
    replyParts.push(
      `${title} dang o muc ${rating.toFixed(1)}/5 sao voi ${totalRatings.toLocaleString("vi-VN")} danh gia.`,
    );
  }

  if (/\bmo ta\b|\bgioi thieu\b|\bnoi dung\b|\bla gi\b|\bthong tin\b|\bchi tiet\b/.test(normalizedMessage)) {
    replyParts.push(
      hasText(story?.description)
        ? `Mo ta ngan: ${truncateText(story.description)}`
        : `${title} chua co mo ta.`,
    );
  }

  if (replyParts.length === 0) {
    replyParts.push(
      `${title} la ${formatTypeLabel(story?.type)}, trang thai ${formatStatusLabel(story?.status).toLowerCase()}, hien co ${chapterCount.toLocaleString("vi-VN")} chuong.`,
    );
    if (authors.length > 0) {
      replyParts.push(`Tac gia: ${authors.join(", ")}.`);
    }
    if (categories.length > 0) {
      replyParts.push(`The loai: ${categories.join(", ")}.`);
    }
  }

  return replyParts.slice(0, 4).join(" ");
}

function buildFallbackReply(message, stories) {
  const normalizedMessage = normalizeText(message);
  const selectedStories = ensureArray(stories).slice(0, 3);
  const { messageTokens, rankedStories } = rankStoriesForMessage(message, stories);
  const primaryStory = pickPrimaryStory(messageTokens, rankedStories);
  const asksForRecommendation = /\bgoi y\b|\bde cu\b|\btim\b|\btruyen nao\b/.test(normalizedMessage);

  if (!selectedStories.length) {
    return "Mình chưa tìm thấy dữ liệu truyện phù hợp để gợi ý lúc này. Bạn thử hỏi theo thể loại, tác giả hoặc tên truyện cụ thể hơn.";
  }

  if (primaryStory && !asksForRecommendation) {
    return buildStoryFactReply(primaryStory, normalizedMessage);
  }

  if (!hasText(normalizedMessage) || /^(hi|hello|xin chao|chao|hey)\b/.test(normalizedMessage)) {
    return [
      "Mình có thể gợi ý truyện theo thể loại, tác giả, độ hot hoặc tình trạng phát hành.",
      `Bạn có thể bắt đầu với ${selectedStories.map((story) => story.title).join(", ")}.`,
    ].join(" ");
  }

  const intro = /tac gia|the loai|goi y|de cu|tim/.test(normalizedMessage)
    ? "Mình gợi ý bạn thử các truyện này:"
    : "Dựa trên dữ liệu hiện có, bạn có thể xem thử:";

  const lines = selectedStories.map((story, index) => {
    const reason = buildStoryReason(story);
    return `${index + 1}. ${story.title}${reason ? ` - ${reason}` : ""}.`;
  });

  return [intro, ...lines].join("\n");
}

async function replyWithCatalogChat({ message, history, stories }) {
  const characterName = extractCharacterName(message);
  if (characterName) {
    const characterStories = findCharacterStories(characterName, stories, 6);
    return {
      reply: buildCharacterSearchReply(characterName, characterStories),
      stories: characterStories.slice(0, 4),
      source: "db",
    };
  }

  const relevantStories = pickRelevantStories(message, stories, 8);
  const aiReply = await requestCatalogChatReply(message, history, relevantStories);

  return {
    reply: aiReply || buildFallbackReply(message, relevantStories),
    stories: relevantStories.slice(0, 4),
    source: aiReply ? "ai" : "fallback",
  };
}

module.exports = {
  replyWithCatalogChat,
};
