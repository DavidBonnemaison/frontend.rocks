import type { DiffObserved } from '../diff-view/schema';

export const DIFF_VIEW_READOUT_PRIMARY: DiffObserved = {
  columns: 2,
};

export const DIFF_VIEW_READOUT_SECONDARY: DiffObserved = {
  columns: 1,
};

export const DIFF_VIEW_OBJECT_PRIMARY: DiffObserved = {
  matched: true,
  containerType: 'inline-size',
  slotWidth: 480,
  computed: {
    gridTemplateColumns: '160px 304px',
    display: 'grid',
  },
  tags: ['card', 'wide'],
};

export const DIFF_VIEW_OBJECT_SECONDARY: DiffObserved = {
  matched: false,
  containerType: 'normal',
  slotWidth: 480,
  computed: {
    gridTemplateColumns: '480px',
    display: 'grid',
  },
  tags: ['card'],
};
