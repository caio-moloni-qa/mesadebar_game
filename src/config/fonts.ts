// FONT_FAMILY and TITLE_FONT_FAMILY share the same stack (MedievalSharp) so the whole game reads with the same
// font the initial title screen uses, rather than mixing it with a separate body-text face — kept as two exported
// names (not one) since call sites still distinguish "heading" vs "body" text semantically, just no longer visually.
export const FONT_FAMILY = 'MedievalSharp, Cinzel, Georgia, serif';
export const TITLE_FONT_FAMILY = 'MedievalSharp, Cinzel, Georgia, serif';
/** Illuminated-manuscript lettering style — reserved for text meant to read as ink written on parchment (e.g. the
 *  menu's "INICIAR AVENTURA" link), distinct from TITLE_FONT_FAMILY's sharper carved/gothic look. */
export const MANUSCRIPT_FONT_FAMILY = "'Uncial Antiqua', MedievalSharp, Georgia, serif";
