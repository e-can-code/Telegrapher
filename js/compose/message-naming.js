// A display title may contain punctuation that cannot be used in a filename.
// Keep the user's original title for correspondence; sanitize only at export.
export const MAX_TITLE_LENGTH = 100;

export function normalizeMessageTitle(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH).trim();
}

export function resolvedMessageTitle(customTitle, decodedText) {
  return normalizeMessageTitle(customTitle)
    || normalizeMessageTitle(decodedText).slice(0, 55).trim()
    || 'Untitled composition';
}

export function wavFilename(title) {
  let base = normalizeMessageTitle(title)
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\.wav$/i, '')
    .replace(/[. ]+$/g, '')
    .slice(0, 80).replace(/[. ]+$/g, '');
  if (!base || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(base)) base = 'Morse message';
  return `${base}.wav`;
}
