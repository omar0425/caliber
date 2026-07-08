"use client";

import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

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

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/watches/${watchId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed.");
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6 space-y-4">
      <div>
        <h3 className="font-serif text-xl">Ask about this watch</h3>
        <p className="text-sm text-muted mt-1">Scarcity, limited editions, market, buying advice — {watchName}.</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="space-y-3 max-h-96 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-line text-muted hover:border-accent hover:text-ink transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-accent text-black rounded-br-sm"
                  : "bg-surface-2 border border-line/60 rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-2 border border-line/60 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-muted">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about this watch…"
          className="input"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} className="btn btn-gold">
          Send
        </button>
      </form>

      <p className="text-xs text-muted border-t border-line/60 pt-3">
        AI-generated and web-researched — it can be wrong or out of date. Verify scarcity, prices, and
        limited-edition claims before making a purchase.
      </p>
    </div>
  );
}
