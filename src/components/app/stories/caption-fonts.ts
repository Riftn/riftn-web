// Use installed faces so captions render offline in both the editor and the exported media.
export const CAPTION_FONTS = {
  classic: { label: "Classic", fontFamily: "Inter, \"Helvetica Neue\", system-ui, sans-serif", fontWeight: 700, fontStyle: "normal" },
  minimal: { label: "Minimal", fontFamily: "\"Avenir Next\", \"Segoe UI Light\", system-ui, sans-serif", fontWeight: 300, fontStyle: "normal" },
  groove: { label: "Groove", fontFamily: "\"Gill Sans\", \"Trebuchet MS\", sans-serif", fontWeight: 400, fontStyle: "italic" },
  poster: { label: "Poster", fontFamily: "Impact, \"Avenir Next Condensed\", \"Arial Narrow\", sans-serif", fontWeight: 900, fontStyle: "normal" },
  book: { label: "Book", fontFamily: "Georgia, \"Noto Serif\", serif", fontWeight: 400, fontStyle: "normal" },
  editorial: { label: "Editorial", fontFamily: "Baskerville, \"Times New Roman\", serif", fontWeight: 400, fontStyle: "italic" },
  headline: { label: "Headline", fontFamily: "\"Times New Roman\", Georgia, serif", fontWeight: 700, fontStyle: "normal" },
  mono: { label: "Mono", fontFamily: "Menlo, Consolas, monospace", fontWeight: 400, fontStyle: "normal" },
  terminal: { label: "Terminal", fontFamily: "Monaco, Consolas, monospace", fontWeight: 700, fontStyle: "normal" },
  typewriter: { label: "Typewriter", fontFamily: "Courier, \"Courier New\", monospace", fontWeight: 400, fontStyle: "italic" },
  marker: { label: "Marker", fontFamily: "\"Marker Felt\", \"Comic Sans MS\", \"DejaVu Sans\", sans-serif", fontWeight: 700, fontStyle: "italic" },
  script: { label: "Script", fontFamily: "\"Snell Roundhand\", \"Brush Script MT\", cursive", fontWeight: 400, fontStyle: "normal" },
} as const;

export type CaptionFont = keyof typeof CAPTION_FONTS;
export const captionFonts = Object.keys(CAPTION_FONTS) as CaptionFont[];

export function captionFontStyle(font: CaptionFont = "classic") {
  const { fontFamily, fontWeight, fontStyle } = CAPTION_FONTS[font] ?? CAPTION_FONTS.classic;
  return { fontFamily, fontWeight, fontStyle };
}
