import React from "react";
import { repairMojibakeText } from "../utils/textRepair";

function renderInlineMarkdown(text, keyPrefix) {
  const source = repairMojibakeText(String(text || ""));
  const pattern =
    /(`[^`]+`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(_([^_]+)_)/g;
  const nodes = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(source.slice(lastIndex, match.index));
    }

    if (match[1]) {
      nodes.push(
        <code key={`${keyPrefix}-code-${match.index}`}>
          {match[1].slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      nodes.push(
        <a
          key={`${keyPrefix}-link-${match.index}`}
          href={match[4]}
          target="_blank"
          rel="noreferrer"
        >
          {repairMojibakeText(match[3])}
        </a>,
      );
    } else if (match[5] || match[7]) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${match.index}`}>
          {repairMojibakeText(match[6] || match[8] || "")}
        </strong>,
      );
    } else if (match[9] || match[11]) {
      nodes.push(
        <em key={`${keyPrefix}-em-${match.index}`}>
          {repairMojibakeText(match[10] || match[12] || "")}
        </em>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < source.length) {
    nodes.push(source.slice(lastIndex));
  }

  return nodes.length ? nodes : [source];
}

function parseMarkdownBlocks(markdown) {
  const lines = String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks = [];
  let index = 0;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }

    blocks.push({
      type: "paragraph",
      text: paragraph.join(" "),
    });
    paragraph = [];
  };

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      index += 1;
      const codeLines = [];
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({
        type: "code",
        code: codeLines.join("\n"),
      });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({
        type: "quote",
        text: quoteLines.join(" "),
      });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({
        type: "ul",
        items,
      });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push({
        type: "ol",
        items,
      });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

function renderBlock(block, index) {
  if (block.type === "heading") {
    if (block.level === 1) {
      return (
        <h1 key={`block-${index}`}>
          {renderInlineMarkdown(block.text, `heading-1-${index}`)}
        </h1>
      );
    }
    if (block.level === 2) {
      return (
        <h2 key={`block-${index}`}>
          {renderInlineMarkdown(block.text, `heading-2-${index}`)}
        </h2>
      );
    }
    return (
      <h3 key={`block-${index}`}>
        {renderInlineMarkdown(block.text, `heading-3-${index}`)}
      </h3>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p key={`block-${index}`}>
        {renderInlineMarkdown(block.text, `paragraph-${index}`)}
      </p>
    );
  }

  if (block.type === "quote") {
    return (
      <blockquote key={`block-${index}`}>
        {renderInlineMarkdown(block.text, `quote-${index}`)}
      </blockquote>
    );
  }

  if (block.type === "code") {
    return (
      <pre key={`block-${index}`}>
        <code>{repairMojibakeText(block.code)}</code>
      </pre>
    );
  }

  if (block.type === "ul") {
    return (
      <ul key={`block-${index}`}>
        {block.items.map((item, itemIndex) => (
          <li key={`block-${index}-item-${itemIndex}`}>
            {renderInlineMarkdown(item, `ul-${index}-${itemIndex}`)}
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "ol") {
    return (
      <ol key={`block-${index}`}>
        {block.items.map((item, itemIndex) => (
          <li key={`block-${index}-item-${itemIndex}`}>
            {renderInlineMarkdown(item, `ol-${index}-${itemIndex}`)}
          </li>
        ))}
      </ol>
    );
  }

  if (block.type === "hr") {
    return <hr key={`block-${index}`} />;
  }

  return null;
}

export default function ProfileReadmeCard({
  ownerLabel,
  content,
  preview = false,
  placeholder = "README của profile sẽ hiển thị ở đây.",
}) {
  const normalizedContent = String(content || "").trim();
  const blocks = parseMarkdownBlocks(normalizedContent);

  return (
    <div className={`profile-readme-card ${preview ? "is-preview" : ""}`.trim()}>
      <div className="profile-readme-header">
        <div className="profile-readme-title">
          <strong>{repairMojibakeText(ownerLabel || "user")} / README.md</strong>
        </div>
        {preview && <span className="profile-readme-preview-badge">Preview</span>}
      </div>

      <div className="profile-readme-body">
        {blocks.length > 0 ? (
          blocks.map((block, index) => renderBlock(block, index))
        ) : (
          <p className="profile-readme-placeholder">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  );
}
