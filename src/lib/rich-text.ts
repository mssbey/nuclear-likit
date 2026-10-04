// Ürün açıklaması için hafif biçimlendirme.
//
// Açıklama düz metin olarak saklanır; iki işaret tanınır:
//   **kalın**   → kalın yazı (birden çok satıra/paragrafa yayılabilir)
//   ## Başlık   → satır başında: büyük/kalın başlık satırı
// HTML asla yorumlanmaz — vitrin bunları React öğelerine çevirir.

export type RichInline = { text: string; bold: boolean };
export type RichBlock =
  | { kind: 'heading'; parts: RichInline[] }
  | { kind: 'paragraph'; lines: RichInline[][] };

const HEADING = /^\s*##\s+/;
/** Tam olarak iki yıldız; "t****" gibi 3+ yıldız dizileri düz metin kalır. */
const MARKER = /(?<!\*)\*\*(?!\*)/;

type BoldState = { bold: boolean; seen: number; pairs: number };

/** Metnin tamamındaki ** sayısı; tek kalırsa sonuncusu eşsizdir (düz metin). */
function boldState(text: string): BoldState {
  const count = text.split(MARKER).length - 1;
  return { bold: false, seen: 0, pairs: count - (count % 2) };
}

/**
 * Satırı parçalara ayırır. `state` satırlar arasında taşınır; böylece bir
 * satırda açılıp başka satırda/paragrafta kapanan **…** de kalın görünür.
 */
function inline(line: string, state: BoldState): RichInline[] {
  const out: RichInline[] = [];
  const push = (text: string, bold: boolean) => {
    if (!text) return;
    const prev = out[out.length - 1];
    if (prev && prev.bold === bold) prev.text += text;
    else out.push({ text, bold });
  };
  line.split(MARKER).forEach((piece, i) => {
    if (i > 0) {
      if (state.seen < state.pairs) state.bold = !state.bold;
      else push('**', state.bold);
      state.seen++;
    }
    push(piece, state.bold);
  });
  return out;
}

/** "a **b** c" → [{a}, {b, kalın}, {c}]. Kapanmamış ** düz metin kalır. */
export function parseInline(line: string): RichInline[] {
  return inline(line, boldState(line));
}

/** Metni başlık ve paragraf bloklarına ayırır (boş satır paragraf böler). */
export function parseRichText(text: string): RichBlock[] {
  const src = text.replace(/\r\n?/g, '\n');
  const state = boldState(src);
  const blocks: RichBlock[] = [];
  let para: RichInline[][] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', lines: para });
    para = [];
  };
  for (const raw of src.split('\n')) {
    if (!raw.trim()) {
      flush();
    } else if (HEADING.test(raw)) {
      flush();
      blocks.push({ kind: 'heading', parts: inline(raw.replace(HEADING, '').trim(), state) });
    } else {
      para.push(inline(raw, state));
    }
  }
  flush();
  return blocks;
}

/** İşaretleri kaldırır — SEO, arama ve özet metinleri için. */
export function stripRichText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(HEADING, ''))
    .join('\n')
    .replace(/(?<!\*)\*\*(?!\*)([\s\S]+?)(?<!\*)\*\*(?!\*)/g, '$1');
}
