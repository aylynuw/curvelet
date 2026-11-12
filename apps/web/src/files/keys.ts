/** where the geometry board and the graph's pictures live between visits */
export const GEO_KEY = 'calculator.geometry.v1';
export const PICTURES_KEY = 'curvelet.graph.pictures';

/** a tool changed its own document (the board, the pictures): the open project has edits */
export const EDIT_EVENT = 'curvelet:edit';
export const notifyEdit = () => window.dispatchEvent(new Event(EDIT_EVENT));
