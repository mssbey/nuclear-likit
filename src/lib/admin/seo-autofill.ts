// Ürün SEO başlığı/açıklaması için otomatik metin.
//
// Başlık: ürün adı (vitrin "| Mixle Lezzet Sepeti" ekini kendisi ekler).
// Açıklama: öncelikle ürünün uzun açıklamasının giriş paragrafından, ~160
// karaktere sığdığı kadar cümle alınır. Açıklama yoksa ad, kategori ve tat
// profillerinden kısa bir cümle kurulur. Şema sınırları: başlık 70, açıklama 180.

import type { AdminProduct, AdminSeo } from '@/types/admin';
import { stripRichText } from '@/lib/rich-text';

const TITLE_MAX = 70;
const DESC_MAX = 160; // Google snippet'i ~160 karakterde keser; şema sınırı 180.

const lower = (s: string) => s.toLocaleLowerCase('tr-TR');
const norm = (s: string) => lower(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** "a, b ve c" */
function joinTr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
}

function truncateWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Cümleleri sınıra sığdığı kadar birleştirir; ilk cümle bile sığmazsa kelimeden keser. */
function fillSentences(sentences: string[], max: number): string {
  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length <= max) out = next;
    else {
      if (!out) out = truncateWords(s, max);
      break;
    }
  }
  return out;
}

// Giriş paragrafını bitiren satırlar: "İçerik;", "Kullanım:" gibi liste başlıkları.
const SECTION_LINE = /^(içerik|içindekiler|kullanım|uyarı|not|özellikler|tat notaları)\b|[:;]$/i;

/**
 * Uzun açıklamanın giriş metni: ürün adını tekrar eden ilk satır (başlık) atlanır,
 * ilk boş satıra veya "İçerik;" benzeri bölüm satırına kadar okunur.
 */
export function descriptionLead(description: string, name: string): string {
  const lines = stripRichText(description)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim());
  const out: string[] = [];
  for (const line of lines) {
    if (!line) {
      if (out.length) break;
      continue;
    }
    if (!out.length && name && norm(line) === norm(name)) continue;
    if (SECTION_LINE.test(line)) {
      if (out.length) break;
      continue;
    }
    out.push(line);
  }
  return out.join(' ');
}

export interface SeoContext {
  categoryName?: (id: string) => string;
  profileLabel?: (id: string) => string;
}

export function buildProductSeo(product: AdminProduct, ctx: SeoContext = {}): AdminSeo {
  const name = product.name.trim();
  if (!name) return { title: '', description: '' };

  const title = truncateWords(name, TITLE_MAX);

  let description = fillSentences(splitSentences(descriptionLead(product.description, name)), DESC_MAX);

  if (!description) {
    const category =
      product.categoryIds.map((id) => ctx.categoryName?.(id) ?? '').find((c) => c.trim())?.trim() ?? '';
    const withCategory = category && !lower(name).includes(lower(category));
    const subject = withCategory ? `${name} ${lower(category)}` : name;
    const profiles = product.flavorProfiles
      .map((id) => lower(ctx.profileLabel?.(id) ?? ''))
      .filter(Boolean);
    description = fillSentences(
      [
        profiles.length ? `${joinTr(profiles.slice(0, 3))} tat profiline sahip ${subject}.` : `${subject}.`,
        "Mixle'de hızlı kargo ve güvenli ödemeyle hemen sipariş verin.",
      ],
      DESC_MAX,
    );
  }

  return { title, description: description.charAt(0).toLocaleUpperCase('tr-TR') + description.slice(1) };
}
