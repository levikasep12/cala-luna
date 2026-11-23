// CALA LUNA — config: world constants, districts, vehicles, weapons, story data.
// Every tunable number lives here; the systems read it, never hard-code it.

export const WORLD = {
  seed: 7,
  halfSize: 330,          // city spans -330..330 on x and z
  block: 60,              // distance between street centrelines
  roadWidth: 14,
  sidewalkWidth: 4,
  beachZ: 300,            // south of this is sand, then water
  waterZ: 345,
  dayLengthSec: 480,      // full day/night cycle
  startHour: 18.1,        // golden hour
};

export const DISTRICTS = [
  { id: 'oldtown',  name: 'OLD TOWN',  x0: -330, z0: -330, x1: -90,  z1: 90,  color: '#e8b04b', rival: 'Los Lobos' },
  { id: 'downtown', name: 'DOWNTOWN',  x0: -90,  z0: -330, x1: 150,  z1: 30,  color: '#7fb3e8', rival: 'The Kings' },
  { id: 'marina',   name: 'MARINA',    x0: 150,  z0: -180, x1: 330,  z1: 300, color: '#7ee8c0', rival: 'Harbor Boys' },
  { id: 'hills',    name: 'THE HILLS', x0: -90,  z0: 30,   x1: 150,  z1: 300, color: '#c99be8', rival: 'Hilltop Crew' },
  { id: 'docks',    name: 'THE DOCKS', x0: -330, z0: 90,   x1: -90,  z1: 300, color: '#e87f7f', rival: 'Dock Rats' },
];

export const VEHICLES = {
  sedan:   { name: 'Comet Sedan',    topSpeed: 38, accel: 16, grip: 8.5, color: 0x9fb4c7, seats: 4 },
  sports:  { name: 'Vortex GT',      topSpeed: 55, accel: 24, grip: 10,  color: 0xd43a2f, seats: 2 },
  taxi:    { name: 'Luna Cab',       topSpeed: 36, accel: 15, grip: 8,   color: 0xf2c230, seats: 4 },
  truck:   { name: 'Hauler Truck',   topSpeed: 30, accel: 11, grip: 7,   color: 0x5f7a5a, seats: 2 },
  police:  { name: 'CLPD Interceptor', topSpeed: 50, accel: 22, grip: 10, color: 0x1c2733, seats: 4 },
  swat:    { name: 'SWAT Van',       topSpeed: 42, accel: 18, grip: 9,   color: 0x14181f, seats: 6 },
  coupe:   { name: 'Solstice Coupe', topSpeed: 47, accel: 20, grip: 9.5, color: 0x2f6fd0, seats: 2 },
};

export const WEAPONS = {
  fists:   { name: 'FISTS',   damage: 12, range: 2.4, rate: 0.45, auto: false, ammo: Infinity, price: 0 },
  pistol:  { name: 'PISTOL',  damage: 25, range: 60,  rate: 0.28, auto: false, ammo: 120, price: 500 },
  shotgun: { name: 'SHOTGUN', damage: 18, range: 26,  rate: 0.8,  auto: false, ammo: 40,  price: 1500, pellets: 6 },
  rifle:   { name: 'RIFLE',   damage: 34, range: 90,  rate: 0.12, auto: true,  ammo: 200, price: 3500 },
};

export const WANTED = {
  // tier: what the CLPD sends at each star level
  1: { patrols: 2, chase: 0, roadblocks: 0, heli: false, swat: 0, label: 'Patrol cars are looking for you' },
  2: { patrols: 2, chase: 2, roadblocks: 0, heli: false, swat: 0, label: 'CLPD units in pursuit' },
  3: { patrols: 2, chase: 3, roadblocks: 1, heli: false, swat: 0, label: 'Roadblock ahead — CLPD closing in' },
  4: { patrols: 2, chase: 4, roadblocks: 2, heli: true,  swat: 0, label: 'Air support overhead' },
  5: { patrols: 2, chase: 4, roadblocks: 2, heli: true,  swat: 2, label: 'SWAT deployed — the whole city is hunting you' },
};

export const CREW = [
  { id: 'marco', name: 'Marco "Wrench" Diaz', role: 'Mechanic', ability: 'Field Repair', desc: 'Instantly repairs your car to full health.', cooldown: 45 },
  { id: 'ines',  name: 'Ines "Ghost" Kato',   role: 'Hacker',   ability: 'Ghost Signal', desc: 'Wipes one wanted star, right now.', cooldown: 60 },
];

// The story: 8 jobs. Each step: drive to a marker, do the thing, get paid.
export const STORY = [
  { id: 'first-fare', name: 'First Fare', brief: 'Luz is back behind the wheel. Pick up the fare at the Old Town rank and drop them at the Marina — easy money, no heat.',
    steps: [
      { type: 'drive', label: 'Pick up the fare at the Old Town rank', at: [-240, -240], reward: 0 },
      { type: 'drive', label: 'Drop the fare at the Marina promenade', at: [240, 120], reward: 400 },
    ] },
  { id: 'the-pickup', name: 'The Pickup', brief: 'A package is waiting at the Docks warehouse. Collect it and bring it to the safehouse before the rival crew clocks you.',
    steps: [
      { type: 'drive', label: 'Collect the package at the Docks warehouse', at: [-210, 210], reward: 0 },
      { type: 'drive', label: 'Deliver the package to the safehouse', at: [-30, 150], reward: 800, timeLimit: 120 },
    ] },
  { id: 'hot-wheels', name: 'Hot Wheels', brief: 'A Vortex GT is parked in Downtown, and a buyer is waiting. Steal it, shake the 2-star heat, and deliver it to the garage.',
    steps: [
      { type: 'steal', label: 'Steal the Vortex GT in Downtown', at: [30, -210], vehicle: 'sports', reward: 0 },
      { type: 'drive', label: 'Deliver the Vortex GT to the garage', at: [90, 210], reward: 1500 },
    ] },
  { id: 'harbor-run', name: 'Harbor Run', brief: 'The Harbor Boys want their goods at the marina in ninety seconds — with the CLPD already on your tail. Drive like the tide is chasing you.',
    steps: [
      { type: 'drive', label: 'Grab the goods at the harbor gate', at: [270, -60], reward: 0 },
      { type: 'drive', label: 'Deliver to the marina — lose the heat on the way', at: [240, 240], reward: 2500, timeLimit: 90, wanted: 3 },
    ] },
  { id: 'the-crew', name: 'The Crew', brief: 'Luz needs a crew. Ines is hiding out in the Hills — reach her through the roadblocks, then bring her home.',
    steps: [
      { type: 'drive', label: 'Reach Ines in the Hills', at: [30, 150], reward: 0, wanted: 3 },
      { type: 'drive', label: 'Bring Ines to the safehouse', at: [-30, 150], reward: 2000, recruit: 'ines' },
    ] },
  { id: 'bank-job', name: 'Bank Job', brief: 'The Meridian Bank job. On foot, loud, fast: get in, grab the cash, and get out before the helicopter finds you.',
    steps: [
      { type: 'drive', label: 'Reach the Meridian Bank, Downtown', at: [90, -150], reward: 0 },
      { type: 'clear', label: 'Clear the bank floor — take out the guards', at: [90, -150], enemies: 4, reward: 0, wanted: 4 },
      { type: 'drive', label: 'Escape to the safehouse', at: [-30, 150], reward: 6000 },
    ] },
  { id: 'territory', name: 'Territory', brief: 'The Docks belong to the Dock Rats. Take the warehouse district back, street by street, and Cala Luna starts to listen.',
    steps: [
      { type: 'clear', label: 'Clear the Dock Rats from the warehouse yard', at: [-210, 210], enemies: 6, reward: 0 },
      { type: 'hold', label: 'Hold the yard until the crew moves in', at: [-210, 210], holdSec: 20, reward: 4000, takeDistrict: 'docks' },
    ] },
  { id: 'the-last-score', name: 'The Last Score', brief: 'One last score: the Harbor vault, five stars of heat, and the whole city between Luz and the boat home. Finish this and Cala Luna is hers.',
    steps: [
      { type: 'drive', label: 'Reach the Harbor vault', at: [270, 60], reward: 0, wanted: 3 },
      { type: 'clear', label: 'Clear the vault guards', at: [270, 60], enemies: 8, reward: 0, wanted: 5 },
      { type: 'drive', label: 'Escape to the boat at the Marina', at: [300, 240], reward: 15000, finale: true },
    ] },
];

export const RACES = [
  { id: 'sprint-1', name: 'Crescent Sprint', entry: 200, prize: 1200, checkpoints: [[-240, -240], [0, -240], [240, -240], [240, 0], [240, 240]] },
  { id: 'sprint-2', name: 'Bay Loop', entry: 500, prize: 3000, checkpoints: [[-240, 240], [-240, -240], [240, -240], [240, 240], [0, 240]] },
];

export const STUNTS = [
  { id: 'jump-1', name: 'Harbor Leap', at: [270, 180], ramp: [270, 150] },
  { id: 'jump-2', name: 'Hilltop Flight', at: [60, 270], ramp: [60, 240] },
  { id: 'jump-3', name: 'Downtown Drop', at: [120, -270], ramp: [120, -240] },
];

export const SHOPS = {
  gunshop: { name: 'Iron & Oak Guns', at: [-150, -30], items: ['pistol', 'shotgun', 'rifle', 'armor'] },
  garage:  { name: 'Wrench Garage', at: [90, 210] },
  safehouse: { name: 'Safehouse', at: [-30, 150] },
};

export const PLAYER = {
  walkSpeed: 6, runSpeed: 10, jumpSpeed: 8, maxHealth: 100, maxArmor: 100,
  startPos: [-30, 120], startCash: 250,
};

export const SAVE_KEY = 'cala-luna-save-v1';
