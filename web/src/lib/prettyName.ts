// Prettifies the entity / relation strings that come back from Wikidata5M.
//
// The raw corpus stores names ASCII-folded, lowercased, with disambiguation
// suffixes in parentheses, and people as "lastname, firstname". Examples
// observed in /api/ask responses:
//
//   "Sueleyman Demirel Universitesi"   → "Süleyman Demirel Üniversitesi"  (best-effort, see notes)
//   "demirel, suleyman"                → "Süleyman Demirel"
//   "istanbul (turkey)"                → "İstanbul"
//   "i̇tü"                              → "İTÜ"  (combining-dot cleanup + acronym preserved)
//   "Subdivisions of Turkey"           → "Subdivisions of Turkey"  (already pretty — keep as-is)
//   "subclass of"                      → "Subclass Of"   (relation labels)
//
// We do this client-side because the Pathway / Hop / Cypher cards all share
// the problem and the underlying data fix is a re-extraction of the whole
// Wikidata5M subgraph (out of scope for a UI bug).

const ACRONYMS: Record<string, string> = {
  itu: "İTÜ",
  itü: "İTÜ",
  odtu: "ODTÜ",
  odtü: "ODTÜ",
  yok: "YÖK",
  tbmm: "TBMM",
  tcdd: "TCDD",
  thy: "THY",
  sdu: "SDÜ",
  ksu: "KSÜ",
};

// Specific name fixes — short list of common diacritic restorations the raw
// corpus drops. Lowercase keys, full pretty replacement values. We match on
// the prettified word (after the basic title-case) so this list stays small.
const NAME_FIXES: Record<string, string> = {
  Turkiye: "Türkiye",
  Sueleyman: "Süleyman",
  Suleyman: "Süleyman",
  Universitesi: "Üniversitesi",
  Universite: "Üniversite",
  Istanbul: "İstanbul",
  Izmir: "İzmir",
  Ankara: "Ankara",
  Cumhurbaskani: "Cumhurbaşkanı",
};

function titleCaseWord(w: string): string {
  if (!w) return w;
  // Preserve all-caps acronyms (≥2 chars, all letters uppercase).
  if (w.length >= 2 && w === w.toLocaleUpperCase("tr") && /^[A-ZĞÜŞİÖÇ]+$/.test(w)) {
    return w;
  }
  const lower = w.toLocaleLowerCase("tr");
  const ac = ACRONYMS[lower];
  if (ac) return ac;
  // Turkish locale capitalizes "i" → "İ" correctly.
  const cap = lower.charAt(0).toLocaleUpperCase("tr") + lower.slice(1);
  return NAME_FIXES[cap] || cap;
}

/** Pretty-print an entity name string from the raw KG. */
export function prettyName(raw: string): string {
  if (!raw) return raw;
  let s = raw.normalize("NFC").trim();

  // Strip parenthetical disambiguation: "istanbul (turkey)" → "istanbul".
  s = s.replace(/\s*\([^)]*\)\s*$/g, "").trim();

  // Flip "lastname, firstname" → "firstname lastname". Single-comma only.
  const m = s.match(/^([^,]+),\s+([^,]+)$/);
  if (m) {
    s = `${m[2].trim()} ${m[1].trim()}`;
  }

  // Drop stray combining marks left over from the raw corpus
  // (e.g. "i̇tü" has U+0307 sitting on top of an ASCII i).
  s = s.replace(/\u0307/g, "");

  // If the string already has any uppercase letter, treat it as already
  // formatted: apply per-word diacritic / acronym fixes but DON'T re-title-
  // case (so "Subdivisions of Turkey" stays as-is, not "Subdivisions Of
  // Turkey"). If it's all-lowercase, do the full title-case pass.
  const hasUpper = /[A-ZĞÜŞİÖÇ]/.test(s);
  return s
    .split(/(\s+|-)/)
    .map((tok) => {
      if (/^\s+$|^-$/.test(tok)) return tok;
      if (hasUpper) {
        // Acronyms first, then NAME_FIXES on the existing capitalisation.
        const ac = ACRONYMS[tok.toLocaleLowerCase("tr")];
        if (ac) return ac;
        return NAME_FIXES[tok] || tok;
      }
      return titleCaseWord(tok);
    })
    .join("");
}

/** Pretty-print a relation label like "headquarters location" → "Headquarters Location". */
export function prettyRelation(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLocaleLowerCase("tr");
      // Keep small connector words lowercase except as the first word.
      return lower.charAt(0).toLocaleUpperCase("tr") + lower.slice(1);
    })
    .join(" ");
}
