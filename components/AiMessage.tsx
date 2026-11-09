import { parseAiMarkdown } from "@/lib/aiText";

// Renders an AI chat answer: paragraphs, lists, and bold — instead of showing
// "**Yes.**" and "([site](https://…))" literally. Built from parsed data, so
// no model output is ever injected as HTML.
export default function AiMessage({ text }: { text: string }) {
  const blocks = parseAiMarkdown(text);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.kind === "paragraph") {
          return (
            <p key={i}>
              {block.parts.map((part, j) => (part.bold ? <strong key={j} className="font-semibold text-ink">{part.text}</strong> : part.text))}
            </p>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List key={i} className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
            {block.items.map((item, j) => (
              <li key={j}>
                {item.map((part, k) => (part.bold ? <strong key={k} className="font-semibold text-ink">{part.text}</strong> : part.text))}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
