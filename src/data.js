// Game balance and content tables for Cash Quest.

export const RARITIES = {
  common:    { label: 'Common',    color: '#b8c0cc', weight: 60, min: 5,    max: 15,   luck: 0 },
  uncommon:  { label: 'Uncommon',  color: '#4ade80', weight: 25, min: 20,   max: 50,   luck: 0.25 },
  rare:      { label: 'Rare',      color: '#60a5fa', weight: 10, min: 80,   max: 200,  luck: 0.6 },
  epic:      { label: 'Epic',      color: '#c084fc', weight: 4,  min: 300,  max: 800,  luck: 1.0 },
  legendary: { label: 'Legendary', color: '#fbbf24', weight: 1,  min: 1500, max: 4000, luck: 1.6 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Each item: [name, shape, color]
export const LOCATIONS = {
  junkyard: {
    name: 'Junkyard', price: 0, mult: 1, size: 55, dark: 0.35,
    desc: 'Rusty heaps of forgotten stuff. Everyone starts somewhere!',
    sky: 0xd9925b, fog: [0xc98a5a, 20, 110], ground: 'dirt',
    items: {
      common: [['Bottle Cap', 'coin', '#c0c0c0'], ['Rusty Can', 'can', '#8b5a2b'], ['Old Spoon', 'bar', '#a8a8a8'], ['Broken Phone', 'phone', '#333333']],
      uncommon: [['Copper Pipe', 'can', '#b87333'], ['Toy Robot', 'box', '#e04848'], ['Vintage Bottle', 'bottle', '#3fa34d']],
      rare: [['Silver Watch', 'watch', '#d8d8e0'], ['Antique Lamp', 'vase', '#c8a24a']],
      epic: [['Gold Ring', 'ring', '#ffcc33'], ['Car Hood Ornament', 'statue', '#e8e8ff']],
      legendary: [['Lost Diamond', 'gem', '#e0ffff']],
    },
  },
  beach: {
    name: 'Beach', price: 1000, mult: 2.5, size: 65, dark: 0,
    desc: 'Sun, sand and lost vacation treasures.',
    sky: 0x87ceeb, fog: [0xbfe6ff, 40, 160], ground: 'sand',
    items: {
      common: [['Seashell', 'shell', '#ffd6c0'], ['Sunglasses', 'box', '#222222'], ['Quarter', 'coin', '#d0d0d0']],
      uncommon: [['Message in a Bottle', 'bottle', '#7fd4c1'], ['Pearl', 'orb', '#fff8f0'], ['Old Compass', 'watch', '#b08a3a']],
      rare: [['Pirate Coin', 'coin', '#ffcc33'], ['Diving Watch', 'watch', '#2a6fd6']],
      epic: [['Pearl Necklace', 'ring', '#fff3e6'], ['Sapphire', 'gem', '#2b5cff']],
      legendary: [['Treasure Chest', 'chest', '#a0662a']],
    },
  },
  city: {
    name: 'City', price: 6000, mult: 6, size: 65, dark: 0.45,
    desc: 'Busy streets after dark. People drop the fanciest things.',
    sky: 0x1d2440, fog: [0x262c48, 20, 120], ground: 'asphalt',
    items: {
      common: [['Lost Wallet', 'box', '#5a3a22'], ['Keys', 'ring', '#c8c8c8'], ['Subway Token', 'coin', '#c9a64a']],
      uncommon: [['Earbuds', 'orb', '#ffffff'], ['Designer Wallet', 'box', '#7a1f2b'], ['Smartphone', 'phone', '#111111']],
      rare: [['Gold Chain', 'ring', '#ffcc33'], ['Luxury Watch', 'watch', '#e6c35c']],
      epic: [['Diamond Earring', 'gem', '#e8faff'], ['Gold Bar', 'bar', '#ffcc33']],
      legendary: [['Golden Crown', 'crown', '#ffd700']],
    },
  },
  warehouse: {
    name: 'Abandoned Warehouse', price: 25000, mult: 15, size: 45, dark: 0.92, indoor: true,
    desc: 'Pitch black and full of secrets. Bring a flashlight!',
    sky: 0x050507, fog: [0x050507, 6, 55], ground: 'concrete',
    items: {
      common: [['Old Tool', 'bar', '#777777'], ['Dusty Radio', 'box', '#6b4f2a'], ['Old Coin', 'coin', '#a88a4a']],
      uncommon: [['Vintage Camera', 'box', '#222222'], ['Brass Lantern', 'vase', '#c8a24a'], ['Rare Comic', 'phone', '#e23b3b']],
      rare: [['Silver Goblet', 'chalice', '#d8d8e0'], ['Stash of Cash', 'bar', '#3fa34d']],
      epic: [['Gold Statue', 'statue', '#ffcc33'], ['Ruby', 'gem', '#ff2244']],
      legendary: [['Smuggled Jewel Egg', 'egg', '#ff66cc']],
    },
  },
  museum: {
    name: 'Museum', price: 100000, mult: 40, size: 48, dark: 0.75, indoor: true,
    desc: 'Priceless artifacts after closing time. The ultimate hunt.',
    sky: 0x0c0a12, fog: [0x0c0a12, 10, 70], ground: 'marble',
    items: {
      common: [['Ancient Coin', 'coin', '#c9a64a'], ['Clay Pot Shard', 'shell', '#b0623a'], ['Arrowhead', 'gem', '#555555']],
      uncommon: [['Roman Vase', 'vase', '#c0623a'], ['Viking Ring', 'ring', '#c8c8c8'], ['Fossil', 'shell', '#d8cfb8']],
      rare: [['Golden Chalice', 'chalice', '#ffcc33'], ['Jade Figure', 'statue', '#3fbf7f']],
      epic: [['Pharaoh Mask', 'crown', '#ffcc33'], ['Emerald', 'gem', '#22dd66']],
      legendary: [['Crystal Skull', 'orb', '#ccf4ff'], ['Royal Jewel Egg', 'egg', '#ffd700']],
    },
  },
};
export const LOCATION_ORDER = ['junkyard', 'beach', 'city', 'warehouse', 'museum'];

// Equipment tiers. Index 0 = what you start with.
export const EQUIPMENT = {
  detector: {
    name: 'Metal Detector', icon: '📡',
    desc: 'Finds buried treasure. Higher tiers detect from farther away.',
    tiers: [
      { name: 'None', price: 0, range: 0 },
      { name: 'Rusty Detector', price: 100, range: 7 },
      { name: 'Pro Detector', price: 900, range: 13 },
      { name: 'Elite Detector', price: 6000, range: 21 },
      { name: 'Quantum Detector', price: 35000, range: 34 },
    ],
  },
  scanner: {
    name: 'Scanner', icon: '🛰️',
    desc: 'Shows treasure on your radar. Advanced scanners reveal buried loot and rarity.',
    tiers: [
      { name: 'None', price: 0, range: 0 },
      { name: 'Basic Scanner', price: 400, range: 18, buried: false, rarity: false },
      { name: 'Advanced Scanner', price: 3500, range: 30, buried: true, rarity: false },
      { name: 'Satellite Scanner', price: 22000, range: 55, buried: true, rarity: true },
    ],
  },
  flashlight: {
    name: 'Flashlight', icon: '🔦',
    desc: 'Lights up dark places. Press F to toggle.',
    tiers: [
      { name: 'None', price: 0, power: 0, dist: 0 },
      { name: 'Pocket Light', price: 60, power: 18, dist: 16 },
      { name: 'Bright Torch', price: 700, power: 35, dist: 26 },
      { name: 'LED Floodlight', price: 4500, power: 60, dist: 38 },
      { name: 'Sunbeam 9000', price: 18000, power: 100, dist: 55 },
    ],
  },
  backpack: {
    name: 'Backpack', icon: '🎒',
    desc: 'Carry more treasure before heading to the sell station.',
    tiers: [
      { name: 'Pockets', price: 0, cap: 5 },
      { name: 'School Bag', price: 150, cap: 10 },
      { name: 'Hiking Pack', price: 1200, cap: 20 },
      { name: 'Expedition Pack', price: 8000, cap: 40 },
      { name: 'Bottomless Bag', price: 40000, cap: 80 },
    ],
  },
  shoes: {
    name: 'Shoes', icon: '👟',
    desc: 'Move faster around the map.',
    tiers: [
      { name: 'Flip Flops', price: 0, speed: 5 },
      { name: 'Sneakers', price: 300, speed: 6.5 },
      { name: 'Running Shoes', price: 2500, speed: 8 },
      { name: 'Rocket Boots', price: 15000, speed: 10.5 },
    ],
  },
};
export const EQUIPMENT_ORDER = ['detector', 'scanner', 'flashlight', 'backpack', 'shoes'];

// Permanent luck upgrades.
export const LUCK_TIERS = [
  { name: 'No Charm', price: 0, luck: 0 },
  { name: 'Lucky Penny', price: 250, luck: 0.5 },
  { name: 'Four-Leaf Clover', price: 1500, luck: 1.2 },
  { name: 'Rabbit Foot', price: 7500, luck: 2.2 },
  { name: 'Golden Horseshoe', price: 30000, luck: 3.5 },
  { name: 'Dragon Eye', price: 120000, luck: 5.5 },
];

// Temporary luck potion: price scales with the location's multiplier.
export const POTION = { name: 'Luck Potion', baseCost: 120, duration: 120, factor: 2 };
