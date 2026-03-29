import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { sendHomeAiChatMessage } from "../services/api";
import { toastFromError } from "../services/toast";

const QUICK_PROMPTS = [
  "Gợi ý truyện hành động đang hot",
  "Có truyện cùng tác giả nổi bật nào không?",
  "Đề xuất vài truyện hoàn thành dễ đọc",
];

function createAssistantMessage(text, stories = []) {
  return {
    id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    text,
    stories,
  };
}

function createUserMessage(text) {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    text,
    stories: [],
  };
}

function toHistoryPayload(messages) {
  return messages.slice(-6).map((message) => ({
    role: message.role,
    text: message.text,
  }));
}

export default function HomeAiChatWidget() {
  const initialMessages = useMemo(
    () => [
      createAssistantMessage(
        "Chao ban, minh la tro ly truyen. Ban co the hoi ve the loai, tac gia, truyen hot hoac nho minh goi y mot vai bo phu hop.",
      ),
    ],
    [],
  );
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  const submitMessage = async (rawText) => {
    const message = String(rawText || "").trim();
    if (!message || sending) {
      return;
    }

    const userMessage = createUserMessage(message);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const response = await sendHomeAiChatMessage(message, toHistoryPayload(nextMessages));
      const reply = response.data?.reply || "Minh chua the tra loi luc nay.";
      const stories = Array.isArray(response.data?.stories) ? response.data.stories : [];
      setMessages((prev) => [...prev, createAssistantMessage(reply, stories)]);
    } catch (error) {
      toastFromError(error, "Khong gui duoc tin nhan den AI luc nay.");
      setMessages((prev) => [
        ...prev,
        createAssistantMessage(
          "Minh dang gap loi khi lay goi y. Ban thu hoi theo the loai, tac gia hoac ten truy?n cu the hon sau it phut.",
        ),
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="home-ai-chat-widget" aria-label="AI chat box">
      <div className="home-ai-chat-card">
        <div className="home-ai-chat-header">
          <div>
            <p className="home-ai-chat-kicker">AI Chat Box</p>
            <h3>Tro ly goi y truyen</h3>
          </div>
          <span className="home-ai-chat-status">{sending ? "Dang tra loi" : "Dang san sang"}</span>
        </div>

        <div className="home-ai-chat-quick-row">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="home-ai-chat-quick"
              onClick={() => submitMessage(prompt)}
              disabled={sending}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div ref={listRef} className="home-ai-chat-messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`home-ai-chat-bubble ${message.role === "user" ? "is-user" : "is-assistant"}`}
            >
              <p>{message.text}</p>
              {message.role === "assistant" && Array.isArray(message.stories) && message.stories.length > 0 && (
                <div className="home-ai-chat-story-list">
                  {message.stories.slice(0, 3).map((story) => (
                    <Link
                      key={story.id}
                      to={`/story/${story.id}`}
                      className="home-ai-chat-story-item"
                    >
                      <div className="home-ai-chat-story-cover">
                        {story.coverImage ? (
                          <img src={story.coverImage} alt={story.title} />
                        ) : (
                          <span>{story.type === "MANGA" ? "M" : "N"}</span>
                        )}
                      </div>
                      <div className="home-ai-chat-story-copy">
                        <strong>{story.title}</strong>
                        <span>
                          {story.type === "MANGA" ? "Truyen tranh" : "Light novel"} · {Number(story.followers || 0).toLocaleString("vi-VN")} theo doi
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="home-ai-chat-bubble is-assistant">
              <p>Dang phan tich va tim truyen phu hop...</p>
            </div>
          )}
        </div>

        <form
          className="home-ai-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitMessage(input);
          }}
        >
          <textarea
            className="home-ai-chat-input"
            rows={3}
            placeholder="Hoi ve the loai, tac gia, truyen hot, truyen da hoan thanh..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={sending}
          />
          <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
            {sending ? "Dang gui..." : "Gui"}
          </button>
        </form>
      </div>
    </aside>
  );
}
