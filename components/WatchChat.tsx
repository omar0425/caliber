"use client";

import { useEffect, useRef, useState } from "react";
import AiMessage from "./AiMessage";
import { errorMessage, fetchJson } from "@/lib/fetchJson";

type Msg = { role: "user" | "assistant"; content: string; sources?: string[] };

const SUGGESTIONS = [
  "How scarce is this reference?",
  "Is it a limited edition?",
  "Which variant is most collectible?",
  "Is now a good time to buy?",
];

export default function WatchChat({ watchId, watchName }: { watchId: string; watchName: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = `caliber:chat:${watchId}`;

  // Keep the conversation for this watch while the app is open — leaving the
  // page to check a photo used to throw the whole thread (and its cost) away.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as Msg[] | null;
        if (Array.isArray(saved)) setMessages(saved.slice(-40));
      } catch {
        /* ignore a corrupt saved thread */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
    } catch {
      /* storage full — the thread just won't survive navigation */
    }
  }, [messages, storageKey]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ reply: string; sources?: unknown }>(`/api/watches/${watchId}/chat`, {
        method: "POST",
        timeoutMs: 120_000,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
        }),
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.reply,
          sources: Array.isArray(data.sources) ? (data.sources as string[]) : [],
        },
      ]);
      requestAnimationFrame(() => {
        const box = scrollRef.current;
        if (!box) return;
        if (box.scrollHeight > box.clientHeight) box.scrollTo({ top: box.scrollHeight });
        else box.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (e) {
      setError(errorMessage(e, "Chat failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card min-w-0 space-y-4 p-4 sm:p-6">
      <div>
        <h3 className="font-serif text-2xl">Ask about this watch</h3>
        <p className="mt-2 break-words text-[15px] leading-relaxed text-muted [overflow-wrap:anywhere]">
          Scarcity, limited editions, market, buying advice — {watchName}.
        </p>
      </div>

      {/* Messages */}
      {/* One scrolling surface on phones: the page. A nested scroll box inside
          a scrolling page fought the thumb; from sm up it stays a panel. */}
      <div ref={scrollRef} aria-live="polite" className="min-w-0 space-y-3 sm:max-h-96 sm:overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="min-h-11 rounded-full border border-line px-4 py-2 text-sm leading-snug text-muted transition-colors hover:border-accent hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-full min-w-0 whitespace-pre-wrap break-words rounded-2xl px-4 py-3 leading-relaxed [overflow-wrap:anywhere] min-[400px]:max-w-[92%] sm:max-w-[85%] ${
                m.role === "user"
                  ? "bg-accent text-black rounded-br-sm"
                  : "bg-surface-2 border border-line/60 rounded-bl-sm"
              }`}
            >
              {m.role === "assistant" ? <AiMessage text={m.content} /> : m.content}
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <div className="mt-3 pt-2 border-t border-line/60 space-y-1">
                  <p className="text-sm uppercase tracking-wide text-muted">Sources</p>
                  {m.sources.slice(0, 4).map((source, sourceIndex) => (
                    <a
                      key={source}
                      href={source}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-all py-1 text-sm leading-relaxed text-accent hover:underline"
                    >
                      {sourceIndex + 1}. {source}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-line/60 bg-surface-2 px-4 py-3 text-muted">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {error && <p className="break-words text-[15px] leading-relaxed text-danger [overflow-wrap:anywhere]">{error}</p>}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex min-w-0 flex-col gap-2 min-[400px]:flex-row"
      >
        {/* Stays enabled while an answer loads: disabling it dismissed the
            iOS keyboard after every question. Send is what waits. */}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about this watch…"
          aria-label="Ask about this watch"
          enterKeyHint="send"
          className="input min-h-12 min-w-0"
        />
        <button type="submit" disabled={loading || !input.trim()} className="btn btn-gold min-h-12 w-full max-w-full min-[400px]:w-auto">
          Send
        </button>
      </form>

      <p className="border-t border-line/60 pt-4 text-sm leading-relaxed text-muted">
        AI-generated and web-researched — it can be wrong or out of date. Verify scarcity, prices, and
        limited-edition claims before making a purchase.
      </p>
    </div>
  );
}
