export { fromWords, type WordsResult } from './words';
export { recognizeInk, strokesToSymbols, layout, HAND_TEMPLATES, type Sym, type Template, type Box } from './ink/recognize';
export { recognizeImage, binarize, components, piecesCloud, photoTemplatesFromStrokes, rasterize, type Mask } from './ink/bitmap';
export { TEMPLATES as INK_SHAPES } from './ink/templates';
export { normalize, type Stroke, type P } from './ink/pdollar';
