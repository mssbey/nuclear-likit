import { Fragment } from 'react';
import { parseRichText, type RichInline } from '@/lib/rich-text';

function Inline({ parts }: { parts: RichInline[] }) {
  return (
    <>
      {parts.map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <Fragment key={i}>{p.text}</Fragment>))}
    </>
  );
}

/** Panel açıklaması: `## başlık` ve `**kalın**` dışında düz metin. HTML yorumlanmaz. */
export function RichText({ text }: { text: string }) {
  const blocks = parseRichText(text);
  return (
    <div className="prose-dark">
      {blocks.map((b, i) =>
        b.kind === 'heading' ? (
          <h3 key={i} className="text-lg">
            <Inline parts={b.parts} />
          </h3>
        ) : (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline parts={line} />
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
