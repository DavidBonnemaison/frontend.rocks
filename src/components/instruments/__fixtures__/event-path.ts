import type { EventPathObserved } from '../event-path/schema';

export const EVENT_PATH_ORDINAL: EventPathObserved = {
  type: 'click',
  steps: [
    { node: 'window', phase: 'capture', listenersCalled: 1, stopped: false, targetSeenAs: 'my-menu' },
    { node: 'document', phase: 'capture', listenersCalled: 0, stopped: false, targetSeenAs: 'my-menu' },
    { node: '#shadow-root', phase: 'capture', listenersCalled: 0, stopped: false, targetSeenAs: 'button#pay' },
    { node: 'button#pay', phase: 'target', listenersCalled: 2, stopped: true, targetSeenAs: 'button#pay' },
    { node: '#shadow-root', phase: 'bubble', listenersCalled: 0, stopped: false, targetSeenAs: 'button#pay' },
    { node: 'my-menu', phase: 'bubble', listenersCalled: 0, stopped: false, targetSeenAs: 'my-menu' },
    { node: 'document', phase: 'bubble', listenersCalled: 0, stopped: false, targetSeenAs: 'my-menu' },
  ],
};

export const EVENT_PATH_COMPARE: EventPathObserved = {
  type: 'click',
  steps: [
    { node: 'window', phase: 'capture', listenersCalled: 1, stopped: false, targetSeenAs: 'my-menu' },
    { node: 'document', phase: 'capture', listenersCalled: 0, stopped: false, targetSeenAs: 'my-menu' },
    { node: '#shadow-root', phase: 'capture', listenersCalled: 0, stopped: false, targetSeenAs: 'button#pay' },
    { node: 'button#pay', phase: 'target', listenersCalled: 2, stopped: false, targetSeenAs: 'button#pay' },
    { node: 'my-menu', phase: 'bubble', listenersCalled: 1, stopped: false, targetSeenAs: 'my-menu' },
    { node: 'document', phase: 'bubble', listenersCalled: 1, stopped: false, targetSeenAs: 'my-menu' },
  ],
};
