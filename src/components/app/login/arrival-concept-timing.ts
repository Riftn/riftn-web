/**
 * Names and timing of the drawn arrivals (arrival-concepts.ts). Kept apart so
 * the sign-in handoff can know them at startup while the drawing code itself
 * loads only when someone has picked one of these arrivals.
 */
export const CONCEPT_LOOKS = ['trace', 'tune', 'deck', 'glass'] as const;
export type ConceptLook = (typeof CONCEPT_LOOKS)[number];

/** From `open()` until the picture stands still where the frame is. */
export const CONCEPT_REVEAL_MS: Record<ConceptLook, number> = {
  trace: 700,
  tune: 900,
  deck: 640,
  glass: 830,
};

/** When the name chip comes in under the picture, after `open()`. */
export const CONCEPT_NAME_MS: Record<ConceptLook, number> = {
  trace: 650,
  tune: 600,
  deck: 600,
  glass: 600,
};
