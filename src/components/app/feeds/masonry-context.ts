import { createContext, useContext } from 'react';

/**
 * True inside a multi-column MasonrySegment (the collapsed-sidebar home feed).
 * A column there is a third of the screen, so the wide-screen video modes
 * (glass rails, ambient fill) have no room beside the picture: they shrank the
 * clip to a sliver beside a squashed panel and broke the grid's line.
 */
export const InMasonryColumnContext = createContext(false);
export const useInMasonryColumn = () => useContext(InMasonryColumnContext);
