// Offline demo data so the app works with no API keys.
const BASE = [
  ['Girls purple bike 16 inch with stabilisers', 'used', 45, 8, 99],
  ['Apollo Cherry Lane girls bike 20" purple', 'new', 119, 0, 99],
  ['Raleigh Molly girls bike 18 inch purple', 'used', 60, 12, 97],
  ['Girls bike pink 20 inch', 'used', 35, 10, 95],
  ['Halfords Girls Bike Purple 24" 6 speed', 'new', 149, 0, 99],
  ['Muddyfox purple girls bike 20 inch', 'used', 52, 9, 92],
  ['Girls purple mountain bike 24 inch 18 speed', 'used', 85, 0, 96],
  ['Girls bicycle purple 14 inch + basket', 'used', 30, 7, 100],
  ['Boys bike blue 20 inch', 'used', 40, 0, 98],
];

export const mock = {
  name: 'demo',
  enabled: () => true,
  async search() {
    return BASE.map(([title, condition, price, shipping, rating], i) => ({
      id: `demo-${i}`, source: 'demo', title, condition, price, shipping, currency: 'GBP',
      url: '#', image: null, sellerRating: rating, location: 'UK',
    }));
  },
};
