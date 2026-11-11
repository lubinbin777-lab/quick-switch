import { buildResults } from '../extension/core.mjs';
QuickSwitchPalette.mount(document.getElementById('app').attachShadow({ mode: 'open' }), {
  search: async query => buildResults(query, [], []),
  execute: async () => {},
});
