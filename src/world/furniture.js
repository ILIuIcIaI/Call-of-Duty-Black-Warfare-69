import { crate, barrel, car } from './props.js';

// =============================================================================
// What stands in a room. Every room type has its own look (wall and floor
// material) and a recipe that fills it. The packer keeps door fronts and stairs
// free and checks that you can still walk from every door to every other one,
// so a house can't get blocked by its own sofa. It also says where loot can lie.
// =============================================================================
export const T = 0.22, SLAB = 0.2;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

const SOLID = { skirt: false, ao: false, pen: 0.7 };
const HARD = { skirt: false, ao: false };
const DECO = { collide: false, skirt: false, ao: false };
const box = (K, x0, y0, z0, x1, y1, z1, m, o = SOLID) => K.box(x0, y0, z0, x1, y1, z1, m, o);
const deco = (K, x0, y0, z0, x1, y1, z1, m) => K.box(x0, y0, z0, x1, y1, z1, m, DECO);
const BLANKET = ['canvasBlue', 'canvasRed', 'canvasGreen', 'canvasYellow', 'fabricDark', 'carpetBeige'];
const UPHOLSTERY = ['canvasBlue', 'canvasRed', 'canvasGreen', 'fabricDark', 'carpetBeige', 'carpetGrey'];
const WOODS = ['woodDark', 'wood', 'woodPale'];

// the look of a room type: wall and floor materials to choose from
export const STYLE = {
  living: { walls: ['plasterSand', 'plasterOchre', 'wallGreen', 'wallBlue', 'plasterWhite', 'plasterRose', 'wallWine', 'wallCream'], floors: ['parquet', 'wood', 'carpetRed', 'carpetBeige', 'woodPale'] },
  bed: { walls: ['plasterBlue', 'plasterRose', 'plasterWhite', 'wallMint', 'plasterGreen', 'wallCream'], floors: ['carpetBlue', 'carpetGrey', 'woodPale', 'parquet', 'carpetBeige'] },
  kitchen: { walls: ['tilesWhite', 'plasterWhite', 'tilesBlue', 'wallCream'], floors: ['tilesTerra', 'tiles', 'tilesCheck'] },
  bath: { walls: ['tilesBlue', 'tilesWhite', 'tilesGreen'], floors: ['tilesBlue', 'tiles', 'tilesCheck'] },
  office: { walls: ['plasterWhite', 'plasterGrey', 'wallBlue', 'wallCream'], floors: ['carpetGrey', 'carpetBlue', 'labFloor'] },
  openoffice: { walls: ['plasterWhite', 'plasterGrey'], floors: ['carpetGrey', 'carpetBlue'] },
  meeting: { walls: ['wallNavy', 'wallWine', 'plasterWhite'], floors: ['carpetRed', 'carpetBlue', 'parquet'] },
  server: { walls: ['labWall'], floors: ['labFloor'] },
  classroom: { walls: ['plasterOchre', 'plasterGreen', 'wallMint', 'wallCream'], floors: ['labFloor', 'woodPale', 'tilesCheck'] },
  ward: { walls: ['paintWhite', 'wallMint'], floors: ['labFloor', 'tiles'] },
  lab: { walls: ['labWall', 'paintWhite'], floors: ['labFloor'] },
  lobby: { walls: ['marble', 'wallCream', 'wallWine'], floors: ['tilesCheck', 'marble', 'carpetRed'] },
  shop: { walls: ['paintWhite', 'plasterSand', 'plasterOchre'], floors: ['tilesCheck', 'labFloor', 'tiles'] },
  storeroom: { walls: ['plasterGrey', 'concrete', 'brickDark'], floors: ['concreteFloor'] },
  bar: { walls: ['wallWine', 'woodDark', 'brickDark'], floors: ['woodDark', 'tilesTerra', 'parquet'] },
  restaurant: { walls: ['wallCream', 'plasterOchre', 'wallWine'], floors: ['tilesTerra', 'parquet', 'tilesCheck'] },
  garage: { walls: ['concrete', 'plasterGrey'], floors: ['concreteFloor'] },
  archive: { walls: ['wallCream', 'plasterGrey'], floors: ['carpetGrey', 'woodDark'] },
  attic: { walls: ['woodDark', 'wood'], floors: ['wood'] },
  barn: { walls: ['woodDark'], floors: ['wood', 'dirt'] },
  bunk: { walls: ['plasterGreen', 'concrete'], floors: ['concreteFloor', 'labFloor'] },
  gym: { walls: ['paintWhite', 'wallCream'], floors: ['parquet'] },
  hall: { walls: ['plasterWhite', 'plasterSand', 'wallCream', 'plasterGrey'], floors: ['tiles', 'tilesCheck', 'woodPale', 'parquet'] },
  corridor: { walls: ['plasterWhite', 'wallCream', 'plasterGrey'], floors: ['labFloor', 'carpetGrey', 'tilesCheck'] },
  stair: { walls: ['plasterGrey', 'plasterWhite', 'concrete'], floors: ['concreteFloor'] },
  terrace: { walls: ['plasterWhite'], floors: ['tilesTerra', 'woodPale', 'pavers'] },
  court: { walls: ['plasterWhite'], floors: ['pavers', 'paversDark'] },
  empty: { walls: ['plasterGrey', 'concrete'], floors: ['concreteFloor'] },
};
STYLE.suite = STYLE.bed; STYLE.study = STYLE.office; STYLE.chapel = STYLE.hall; STYLE.lookout = STYLE.stair;

// ---------------------------------------------------------------------------
// The furniture. Drawn around the origin, the back at -z, standing on y = 0.
// ---------------------------------------------------------------------------
const chair = (K, x, z, q, m = 'woodDark') => {
  const s = K.sub(x, z, q);
  deco(s, -0.21, 0, -0.21, 0.21, 0.46, 0.21, m); deco(s, -0.21, 0.46, -0.21, 0.21, 0.9, -0.16, m);
};
const bed = { w: 1.7, d: 2.15, h: 0.62, draw(K) {
  const c = pick(BLANKET);
  box(K, -0.85, 0, -1.07, 0.85, 0.5, 1.07, 'woodDark');
  deco(K, -0.83, 0.5, -0.45, 0.83, 0.57, 1.05, c);
  deco(K, -0.83, 0.5, -1.02, 0.83, 0.54, -0.45, 'fabricWhite');
  deco(K, -0.75, 0.54, -0.98, -0.08, 0.64, -0.6, 'fabricWhite'); deco(K, 0.08, 0.54, -0.98, 0.75, 0.64, -0.6, 'fabricWhite');
  box(K, -0.85, 0, -1.07, 0.85, 1.05, -1.0, 'woodDark');
} };
const bedSingle = { w: 1.0, d: 2.05, h: 0.62, draw(K) {
  box(K, -0.5, 0, -1.02, 0.5, 0.48, 1.02, 'woodPale');
  deco(K, -0.48, 0.48, -0.4, 0.48, 0.55, 1.0, pick(BLANKET));
  deco(K, -0.4, 0.48, -0.98, 0.4, 0.58, -0.6, 'fabricWhite');
} };
const nightstand = { w: 0.5, d: 0.45, h: 0.55, top: true, draw(K) {
  box(K, -0.25, 0, -0.22, 0.25, 0.55, 0.22, 'woodDark');
  deco(K, -0.08, 0.55, -0.08, 0.08, 0.85, 0.08, 'canvasYellow');
} };
const wardrobe = { w: 1.3, d: 0.6, h: 2.05, draw(K) {
  const m = pick(WOODS);
  box(K, -0.65, 0, -0.3, 0.65, 2.05, 0.3, m);
  deco(K, -0.01, 0.05, 0.3, 0.01, 2.0, 0.31, 'black');
  deco(K, -0.1, 1.0, 0.3, -0.05, 1.18, 0.33, 'metal'); deco(K, 0.05, 1.0, 0.3, 0.1, 1.18, 0.33, 'metal');
} };
const dresser = { w: 1.25, d: 0.5, h: 0.85, top: true, draw(K) {
  const m = pick(WOODS);
  box(K, -0.62, 0, -0.25, 0.62, 0.85, 0.25, m);
  for (const y of [0.28, 0.56]) deco(K, -0.6, y, 0.25, 0.6, y + 0.015, 0.26, 'black');
} };
const bookshelf = { w: 1.5, d: 0.4, h: 2.05, draw(K) {
  box(K, -0.75, 0, -0.2, 0.75, 2.05, 0.2, pick(WOODS));
  const cols = ['canvasRed', 'canvasBlue', 'canvasGreen', 'canvasYellow', 'fabricDark', 'carpetBeige'];
  for (let i = 0; i < 4; i++) {
    const y = 0.14 + i * 0.48;
    deco(K, -0.7, y, 0.2, 0.7, y + 0.03, 0.21, 'black');
    let x = -0.68;
    while (x < 0.6) { const w = rnd(0.12, 0.3); deco(K, x, y + 0.03, 0.2, x + w, y + rnd(0.26, 0.38), 0.215, pick(cols)); x += w + rnd(0, 0.04); }
  }
} };
const shelfMetal = { w: 1.9, d: 0.55, h: 2.1, draw(K) {
  box(K, -0.95, 0, -0.27, 0.95, 2.1, 0.27, 'metalDark', { ...SOLID, pen: 0.5 });
  const m = ['canvasYellow', 'carpetBeige', 'woodPale', 'canvasBlue'];
  for (let i = 0; i < 3; i++) {
    const y = 0.15 + i * 0.68;
    deco(K, -0.93, y + 0.42, 0.27, 0.93, y + 0.47, 0.285, 'metal');
    let x = -0.9;
    while (x < 0.6) { const w = rnd(0.28, 0.5); deco(K, x, y, 0.27, x + w, y + rnd(0.22, 0.4), 0.28, pick(m)); x += w + rnd(0.02, 0.1); }
  }
} };
const sofa = { w: 2.15, d: 0.9, h: 0.85, draw(K) {
  const m = pick(UPHOLSTERY);
  box(K, -1.07, 0, -0.45, 1.07, 0.45, 0.45, m, { ...SOLID, pen: 0.9 });
  box(K, -1.07, 0.45, -0.45, 1.07, 0.85, -0.2, m, { ...SOLID, pen: 0.9 });
  box(K, -1.07, 0.45, -0.2, -0.87, 0.62, 0.45, m, { ...SOLID, pen: 0.9 }); box(K, 0.87, 0.45, -0.2, 1.07, 0.62, 0.45, m, { ...SOLID, pen: 0.9 });
} };
const armchair = { w: 0.95, d: 0.9, h: 0.85, draw(K) {
  const m = pick(UPHOLSTERY);
  box(K, -0.47, 0, -0.45, 0.47, 0.45, 0.45, m, { ...SOLID, pen: 0.9 });
  box(K, -0.47, 0.45, -0.45, 0.47, 0.85, -0.2, m, { ...SOLID, pen: 0.9 });
} };
const coffeeTable = { w: 1.15, d: 0.6, h: 0.4, top: true, draw(K) { box(K, -0.57, 0, -0.3, 0.57, 0.4, 0.3, 'woodDark'); } };
const tvStand = { w: 1.5, d: 0.45, h: 1.25, draw(K) {
  box(K, -0.75, 0, -0.22, 0.75, 0.5, 0.22, 'woodDark');
  box(K, -0.6, 0.5, -0.1, 0.6, 1.25, -0.02, 'black', HARD);
  deco(K, -0.56, 0.54, -0.02, 0.56, 1.21, -0.012, 'screen');
} };
const kitchenRun = (w) => ({ w, d: 0.62, h: 0.92, wall: true, draw(K) {
  const m = pick(['paintWhite', 'woodPale', 'plasterBlue', 'plasterGreen']);
  box(K, -w / 2, 0, -0.31, w / 2, 0.88, 0.31, m);
  deco(K, -w / 2 - 0.01, 0.88, -0.31, w / 2 + 0.01, 0.92, 0.33, 'marble');
  for (let x = -w / 2 + 0.6; x < w / 2 - 0.1; x += 0.6) deco(K, x - 0.005, 0.05, 0.31, x + 0.005, 0.85, 0.315, 'black');
  deco(K, -w / 2, 1.5, -0.31, w / 2, 2.15, 0.04, m);                                    // wall cabinets, above head height at the back
  deco(K, -0.35, 0.92, -0.2, 0.35, 0.94, 0.2, 'metal');                                  // sink
  if (w > 1.9) { deco(K, w / 2 - 0.75, 0.92, -0.28, w / 2 - 0.1, 0.94, 0.28, 'black'); } // hob
} });
const fridge = { w: 0.75, d: 0.7, h: 1.95, draw(K) {
  box(K, -0.37, 0, -0.35, 0.37, 1.95, 0.35, 'metalWhite', { ...SOLID, pen: 0.5 });
  deco(K, -0.37, 1.3, 0.35, 0.37, 1.32, 0.36, 'black'); deco(K, 0.26, 0.5, 0.35, 0.3, 1.2, 0.39, 'metalDark');
} };
const diningTable = { w: 1.8, d: 1.0, h: 0.76, top: true, center: true, draw(K) {
  const m = pick(WOODS);
  box(K, -0.9, 0.7, -0.5, 0.9, 0.76, 0.5, m);
  box(K, -0.5, 0, -0.1, 0.5, 0.7, 0.1, m);
  for (const x of [-0.5, 0.5]) { chair(K, x, -0.72, 0); chair(K, x, 0.72, 2); }
} };
const roundTable = { w: 0.95, d: 0.95, h: 0.76, top: true, center: true, draw(K) {
  box(K, -0.47, 0.7, -0.47, 0.47, 0.76, 0.47, pick(WOODS));
  box(K, -0.1, 0, -0.1, 0.1, 0.7, 0.1, 'metalDark', HARD);
  chair(K, 0, -0.68, 0, 'metalDark'); chair(K, 0, 0.68, 2, 'metalDark');
} };
const longTable = (w) => ({ w, d: 1.25, h: 0.76, top: true, center: true, draw(K) {
  box(K, -w / 2, 0.68, -0.62, w / 2, 0.76, 0.62, 'woodDark');
  box(K, -w / 2 + 0.3, 0, -0.3, w / 2 - 0.3, 0.68, 0.3, 'woodDark');
  for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 1.0) { chair(K, x, -0.92, 0, 'fabricDark'); chair(K, x, 0.92, 2, 'fabricDark'); }
} });
const desk = { w: 1.5, d: 0.78, h: 0.76, top: true, draw(K) {
  const m = pick(['woodDark', 'woodPale', 'metalWhite']);
  box(K, -0.75, 0.7, -0.39, 0.75, 0.76, 0.39, m);
  box(K, -0.72, 0, -0.36, -0.3, 0.7, 0.36, m); box(K, 0.65, 0, -0.36, 0.72, 0.7, 0.36, m);
  deco(K, -0.3, 0.76, -0.3, 0.3, 1.14, -0.26, 'black'); deco(K, -0.27, 0.79, -0.26, 0.27, 1.11, -0.255, 'screen');
  deco(K, -0.2, 0.76, -0.1, 0.2, 0.78, 0.06, 'fabricDark');
  chair(K, 0, 0.72, 2, 'fabricDark');
} };
const cabinet = { w: 0.95, d: 0.5, h: 1.4, draw(K) {
  box(K, -0.47, 0, -0.25, 0.47, 1.4, 0.25, 'metal', { ...SOLID, pen: 0.5 });
  for (const y of [0.35, 0.7, 1.05]) deco(K, -0.45, y, 0.25, 0.45, y + 0.012, 0.26, 'black');
} };
const locker = { w: 1.5, d: 0.5, h: 1.95, draw(K) {
  box(K, -0.75, 0, -0.25, 0.75, 1.95, 0.25, pick(['metal', 'metalDark', 'plasterBlue']), { ...SOLID, pen: 0.5 });
  for (const x of [-0.25, 0.25]) deco(K, x - 0.008, 0.03, 0.25, x + 0.008, 1.92, 0.26, 'black');
} };
const rack = { w: 0.85, d: 1.05, h: 2.15, draw(K) {
  box(K, -0.42, 0, -0.52, 0.42, 2.15, 0.52, 'black', { ...SOLID, pen: 0.4 });
  for (let i = 0; i < 6; i++) deco(K, -0.36, 0.2 + i * 0.32, 0.52, 0.36, 0.3 + i * 0.32, 0.525, chance(0.35) ? 'lampBlue' : 'metalDark');
} };
const gondola = (w) => ({ w, d: 0.95, h: 1.55, center: true, draw(K) {
  box(K, -w / 2, 0, -0.47, w / 2, 1.55, 0.47, 'paintWhite', { ...SOLID, pen: 0.8 });
  const m = ['canvasRed', 'canvasBlue', 'canvasYellow', 'canvasGreen', 'carpetBeige', 'plasterOchre'];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const y = 0.15 + i * 0.47;
    let x = -w / 2 + 0.04;
    while (x < w / 2 - 0.25) { const c = rnd(0.14, 0.3); deco(K, x, y, s * 0.47, x + c, y + rnd(0.2, 0.34), s * 0.485, pick(m)); x += c + rnd(0.01, 0.05); }
  }
} });
const counter = (w) => ({ w, d: 0.7, h: 1.05, draw(K) {
  box(K, -w / 2, 0, -0.35, w / 2, 1.0, 0.35, pick(['woodDark', 'paintWhite', 'marble']), { ...SOLID, pen: 0.6 });
  deco(K, -w / 2 - 0.03, 1.0, -0.38, w / 2 + 0.03, 1.05, 0.38, 'marble');
  deco(K, -0.25, 1.05, -0.2, 0.25, 1.2, 0.2, 'black');
} });
const barCounter = (w) => ({ w, d: 0.75, h: 1.12, draw(K) {
  box(K, -w / 2, 0, -0.37, w / 2, 1.05, 0.37, 'woodDark');
  deco(K, -w / 2 - 0.05, 1.05, -0.42, w / 2 + 0.05, 1.12, 0.45, 'wood');
  for (let x = -w / 2 + 0.5; x < w / 2; x += 0.9) { deco(K, x - 0.16, 0, 0.62, x + 0.16, 0.72, 0.94, 'metalDark'); }
} });
const bottles = (w) => ({ w, d: 0.32, h: 2.2, draw(K) {
  box(K, -w / 2, 0, -0.16, w / 2, 2.2, 0.16, 'woodDark');
  const m = ['carGlass', 'canvasGreen', 'canvasYellow', 'canvasRed'];
  for (const y of [0.95, 1.4, 1.85]) for (let x = -w / 2 + 0.1; x < w / 2 - 0.1; x += rnd(0.1, 0.2)) deco(K, x, y, 0.16, x + 0.07, y + rnd(0.22, 0.34), 0.2, pick(m));
} });
const wardBed = { w: 1.1, d: 2.15, h: 0.75, draw(K) {
  box(K, -0.55, 0.45, -1.07, 0.55, 0.65, 1.07, 'fabricWhite');
  box(K, -0.55, 0, -1.07, 0.55, 0.45, 1.07, 'metal', { ...SOLID, pen: 0.8 });
  box(K, -0.55, 0.45, -1.07, 0.55, 1.15, -1.0, 'metal', { ...SOLID, pen: 0.8 });
  deco(K, -0.48, 0.65, -0.1, 0.48, 0.7, 1.0, 'wallMint');
  deco(K, 0.7, 0, -0.95, 0.74, 1.8, -0.91, 'metal'); deco(K, 0.6, 1.5, -1, 0.84, 1.8, -0.88, 'metalWhite');
  deco(K, -0.72, 0, -1.07, -0.7, 2.05, 1.07, 'wallMint');                                 // curtain
} };
const schoolDesk = { w: 1.2, d: 0.6, h: 0.72, top: true, center: true, draw(K) {
  box(K, -0.6, 0, -0.3, 0.6, 0.72, 0.3, 'woodPale');
  chair(K, 0, 0.5, 2, 'plasterBlue');
} };
const benchLab = { w: 2.6, d: 0.9, h: 0.92, top: true, center: true, draw(K) {
  box(K, -1.3, 0, -0.45, 1.3, 0.88, 0.45, 'labWall', { ...SOLID, pen: 0.5 });
  deco(K, -1.32, 0.88, -0.47, 1.32, 0.92, 0.47, 'black');
  deco(K, -0.8, 0.92, -0.25, -0.5, 1.2, 0.05, 'metalWhite'); deco(K, 0.3, 0.92, -0.15, 0.42, 1.25, -0.03, 'lampBlue');
} };
const workbench = { w: 2.3, d: 0.8, h: 0.95, top: true, draw(K) {
  box(K, -1.15, 0.85, -0.4, 1.15, 0.95, 0.4, 'wood');
  box(K, -1.1, 0, -0.35, -0.95, 0.85, 0.35, 'metalDark', HARD); box(K, 0.95, 0, -0.35, 1.1, 0.85, 0.35, 'metalDark', HARD);
  deco(K, -1.1, 1.05, -0.4, 1.1, 2.0, -0.38, 'metalDark');
  for (let x = -0.9; x < 0.9; x += 0.3) deco(K, x, 1.3 + Math.random() * 0.3, -0.38, x + 0.07, 1.8, -0.36, 'metal');
} };
const toolCabinet = { w: 1.1, d: 0.6, h: 1.25, draw(K) {
  box(K, -0.55, 0, -0.3, 0.55, 1.25, 0.3, 'metalRed', { ...SOLID, pen: 0.4 });
  for (const y of [0.25, 0.5, 0.75, 1.0]) deco(K, -0.53, y, 0.3, 0.53, y + 0.015, 0.31, 'black');
} };
const tires = { w: 0.75, d: 0.75, h: 0.9, draw(K) {
  box(K, -0.35, 0, -0.35, 0.35, 0.9, 0.35, 'rubber', HARD);
  for (const y of [0.2, 0.42, 0.65]) deco(K, -0.37, y, -0.37, 0.37, y + 0.02, 0.37, 'metalDark');
} };
const crates = { w: 2.3, d: 1.2, h: 1.2, draw(K) {
  crate(K, -0.5, 0, 1.15); if (chance(0.7)) crate(K, 0.62, 0.1, 0.9, 0, 'woodDark'); if (chance(0.35)) crate(K, -0.5, 0, 0.8, 1.15);
} };
const drums = { w: 1.4, d: 1.0, h: 0.9, draw(K) { barrel(K, -0.35, -0.1, pick(['metalRed', 'metalDark', 'metalYellow'])); barrel(K, 0.35, 0.05, pick(['metalRed', 'metalDark'])); } };
const hay = { w: 2.4, d: 1.2, h: 1.2, draw(K) {
  box(K, -1.2, 0, -0.6, 1.2, 0.6, 0.6, 'hay', { ...HARD, pen: 1 });
  if (chance(0.6)) box(K, -0.9, 0.6, -0.5, 0.5, 1.2, 0.5, 'hay', { ...HARD, pen: 1 });
} };
const bunkBed = { w: 1.0, d: 2.1, h: 1.9, draw(K) {
  box(K, -0.5, 0, -1.05, 0.5, 0.45, 1.05, 'metalDark', { ...SOLID, pen: 0.8 });
  deco(K, -0.48, 0.45, -1.03, 0.48, 0.52, 1.03, 'canvasGreen');
  box(K, -0.5, 1.3, -1.05, 0.5, 1.5, 1.05, 'metalDark', { ...SOLID, pen: 0.8 });
  deco(K, -0.48, 1.5, -1.03, 0.48, 1.56, 1.03, 'canvasGreen');
  for (const [x, z] of [[-0.48, -1.03], [0.48, -1.03], [-0.48, 1.03], [0.48, 1.03]]) box(K, x - 0.03, 0, z - 0.03, x + 0.03, 1.9, z + 0.03, 'metalDark', HARD);
} };
const plant = { w: 0.6, d: 0.6, h: 1.5, draw(K) {
  box(K, -0.22, 0, -0.22, 0.22, 0.45, 0.22, 'tilesTerra', HARD);
  deco(K, -0.32, 0.45, -0.32, 0.32, 1.05, 0.32, 'foliage'); deco(K, -0.2, 1.05, -0.2, 0.2, 1.5, 0.2, 'foliageDark');
} };
const deckChair = { w: 0.75, d: 1.9, h: 0.45, draw(K) { box(K, -0.37, 0, -0.95, 0.37, 0.3, 0.95, pick(['woodPale', 'canvasBlue', 'paintWhite']), SOLID); deco(K, -0.37, 0.3, -0.95, 0.37, 0.62, -0.5, 'woodPale'); } };
const planter = { w: 1.5, d: 0.55, h: 0.95, draw(K) { box(K, -0.75, 0, -0.27, 0.75, 0.55, 0.27, 'concrete', HARD); deco(K, -0.72, 0.55, -0.24, 0.72, 0.95, 0.24, 'foliage'); } };
const bleachers = (w) => ({ w, d: 2.4, h: 1.8, draw(K) {
  for (let i = 0; i < 3; i++) box(K, -w / 2, 0, -1.2 + (2 - i) * 0.8, w / 2, 0.45 + (2 - i) * 0.45 + 0.01, -1.2 + (3 - i) * 0.8, 'woodPale');
} });
const reception = { w: 3.4, d: 0.8, h: 1.15, draw(K) {
  box(K, -1.7, 0, -0.4, 1.7, 1.1, 0.4, 'woodDark'); deco(K, -1.74, 1.1, -0.44, 1.74, 1.15, 0.44, 'marble');
  deco(K, -0.7, 1.15, -0.25, -0.2, 1.5, -0.2, 'screen');
  chair(K, 0.4, -0.72, 0, 'fabricDark');
} };
const piano = { w: 1.7, d: 0.7, h: 1.25, draw(K) { box(K, -0.85, 0, -0.35, 0.85, 1.25, 0.2, 'black', SOLID); box(K, -0.85, 0.65, 0.2, 0.85, 0.78, 0.35, 'black', SOLID); deco(K, -0.8, 0.78, 0.2, 0.8, 0.8, 0.34, 'paintWhite'); } };
const fireplace = { w: 1.9, d: 0.55, h: 1.5, wall: true, draw(K) {
  box(K, -0.95, 0, -0.27, 0.95, 1.5, 0.27, 'stoneWall', HARD);
  deco(K, -0.55, 0.05, 0.27, 0.55, 0.85, 0.275, 'black');
  deco(K, -1.05, 1.5, -0.3, 1.05, 1.58, 0.33, 'woodDark');
} };
const toilet = { w: 0.5, d: 0.7, h: 0.8, draw(K) { box(K, -0.2, 0, -0.1, 0.2, 0.42, 0.35, 'paintWhite', HARD); box(K, -0.25, 0, -0.35, 0.25, 0.8, -0.1, 'paintWhite', HARD); } };
const sink = { w: 0.6, d: 0.5, h: 0.9, top: true, draw(K) { box(K, -0.3, 0, -0.25, 0.3, 0.85, 0.25, 'paintWhite', HARD); deco(K, -0.2, 0.85, -0.17, 0.2, 0.87, 0.17, 'tilesBlue'); deco(K, -0.3, 1.2, -0.25, 0.3, 1.8, -0.235, 'labWall'); } };
const tub = { w: 1.75, d: 0.8, h: 0.58, draw(K) { box(K, -0.87, 0, -0.4, 0.87, 0.58, 0.4, 'paintWhite', HARD); deco(K, -0.78, 0.58, -0.32, 0.78, 0.585, 0.32, 'waterFountain'); } };
const carStatic = { w: 4.4, d: 2.0, h: 1.5, draw(K) { car(K, 0, 0, 'x', pick(['carPaintRed', 'carPaintBlue', 'carPaintWhite', 'carPaintGreen'])); } };
const bench = { w: 1.6, d: 0.45, h: 0.48, draw(K) { box(K, -0.8, 0, -0.22, 0.8, 0.46, 0.22, 'woodDark'); } };
const pew = (w) => ({ w, d: 0.7, h: 0.95, center: true, draw(K) { box(K, -w / 2, 0, -0.1, w / 2, 0.45, 0.32, 'woodDark'); box(K, -w / 2, 0, -0.32, w / 2, 0.95, -0.22, 'woodDark'); } });
const cubicle = { w: 3.1, d: 3.1, h: 1.5, center: true, draw(K) {
  // four desks around a cross of low walls: cover at crouch height
  box(K, -1.55, 0, -0.03, 1.55, 1.45, 0.03, 'carpetGrey', { ...SOLID, pen: 0.9 });
  box(K, -0.03, 0, -1.55, 0.03, 1.45, 1.55, 'carpetGrey', { ...SOLID, pen: 0.9 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const a = K.sub(sx * 0.8, sz * 0.4, sz > 0 ? 0 : 2);
    box(a, -0.72, 0, -0.34, 0.72, 0.74, 0.34, 'woodPale');
    deco(a, -0.25, 0.74, -0.3, 0.25, 1.08, -0.26, 'black'); deco(a, -0.22, 0.77, -0.26, 0.22, 1.05, -0.255, 'screen');
  }
} };

// ---------------------------------------------------------------------------
// The packer
// ---------------------------------------------------------------------------
const Q_OF = { n: 0, s: 2, w: 1, e: 3 };
const over = (a, b, m = 0) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;

class Packer {
  constructor(P, r) {
    this.P = P; this.r = r; this.K = P.K;
    const t = P.t / 2;
    this.x0 = r.x0 + t; this.z0 = r.z0 + t; this.x1 = r.x1 - t; this.z1 = r.z1 - t;
    this.w = this.x1 - this.x0; this.d = this.z1 - this.z0;
    this.placed = [];
    this.block = [...P.keep, ...P.holes];
    if (r.keep) this.block.push(...r.keep);
    this.fronts = [];
    for (const D of r.doors) {
      const m = D.w / 2 + 0.15;
      if (D.ax === 'x') { this.block.push([D.c - m, D.line - 1.3, D.c + m, D.line + 1.3]); this.fronts.push([D.c, D.line + (D.line <= this.z0 + 0.2 ? 0.55 : -0.55)]); }
      else { this.block.push([D.line - 1.3, D.c - m, D.line + 1.3, D.c + m]); this.fronts.push([D.line + (D.line <= this.x0 + 0.2 ? 0.55 : -0.55), D.c]); }
    }
    this.last = null;
    this.topSpots = [];
  }

  fits(rect, it, side) {
    if (rect[0] < this.x0 - 0.001 || rect[1] < this.z0 - 0.001 || rect[2] > this.x1 + 0.001 || rect[3] > this.z1 + 0.001) return false;
    for (const q of this.placed) if (over(rect, q, 0.05)) return false;
    for (const q of this.block) if (over(rect, q)) return false;
    if (side && it.h > 0.8) {
      for (const W of this.r.wins) {
        if (W.side !== side || W.y > it.h) { if (W.side !== side) continue; }
        if (W.y < it.h && (side === 'n' || side === 's' ? rect[0] < W.e && rect[2] > W.s : rect[1] < W.e && rect[3] > W.s)) return false;
      }
    }
    return this.passes(rect);
  }

  // every door stays in reach of every other one, with room to walk
  passes(rect) {
    const F = this.fronts;
    if (F.length < 2) return true;
    const S = 0.3, hull = 0.45, nx = Math.ceil(this.w / S), nz = Math.ceil(this.d / S), g = new Uint8Array(nx * nz);
    const mark = (q) => {
      const a = Math.max(0, Math.floor((q[0] - hull - this.x0) / S)), c = Math.min(nx - 1, Math.floor((q[2] + hull - this.x0) / S));
      const e = Math.max(0, Math.floor((q[1] - hull - this.z0) / S)), f = Math.min(nz - 1, Math.floor((q[3] + hull - this.z0) / S));
      for (let z = e; z <= f; z++) for (let x = a; x <= c; x++) g[z * nx + x] = 1;
    };
    mark(rect);
    for (const q of this.placed) mark(q);
    const idx = ([x, z]) => Math.max(0, Math.min(nz - 1, Math.floor((z - this.z0) / S))) * nx + Math.max(0, Math.min(nx - 1, Math.floor((x - this.x0) / S)));
    const start = idx(F[0]);
    g[start] = 2;
    const st = [start];
    while (st.length) {
      const i = st.pop(), x = i % nx, z = (i / nx) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = x + dx, c = z + dz;
        if (a < 0 || c < 0 || a >= nx || c >= nz) continue;
        const j = c * nx + a;
        if (!g[j]) { g[j] = 2; st.push(j); }
      }
    }
    for (let i = 1; i < F.length; i++) if (g[idx(F[i])] !== 2) return false;
    return true;
  }

  put(it, cx, cz, q, rect) {
    const s = this.K.sub(cx, cz, q, false, this.P.y);
    it.draw(s);
    this.placed.push(rect);
    this.last = { it, cx, cz, q, rect };
    if (it.top && chance(0.45)) this.topSpots.push({ x: cx, z: cz, y: this.P.y + it.h });
    return this.last;
  }

  // against a wall: in a corner if there is one free, otherwise anywhere along it
  wall(it, o = {}) {
    const sides = o.side ? [o.side] : shuffle(['n', 's', 'w', 'e']);
    for (const side of sides) {
      const along = side === 'n' || side === 's', a0 = along ? this.x0 : this.z0, a1 = along ? this.x1 : this.z1, len = a1 - a0;
      if (it.w > len) continue;
      const cand = o.at !== undefined ? [o.at] : [a0 + it.w / 2 + 0.03, a1 - it.w / 2 - 0.03];
      if (o.at === undefined) { if (chance(0.5)) cand.reverse(); for (let i = 0; i < 3; i++) cand.push(a0 + it.w / 2 + Math.random() * (len - it.w)); }
      const g = o.gap ?? 0.03;
      for (const c of cand) {
        let rect, cx, cz;
        if (side === 'n') { cx = c; cz = this.z0 + g + it.d / 2; rect = [c - it.w / 2, this.z0 + g, c + it.w / 2, this.z0 + g + it.d]; }
        else if (side === 's') { cx = c; cz = this.z1 - g - it.d / 2; rect = [c - it.w / 2, this.z1 - g - it.d, c + it.w / 2, this.z1 - g]; }
        else if (side === 'w') { cx = this.x0 + g + it.d / 2; cz = c; rect = [this.x0 + g, c - it.w / 2, this.x0 + g + it.d, c + it.w / 2]; }
        else { cx = this.x1 - g - it.d / 2; cz = c; rect = [this.x1 - g - it.d, c - it.w / 2, this.x1 - g, c + it.w / 2]; }
        if (!this.fits(rect, it, side)) continue;
        const res = this.put(it, cx, cz, Q_OF[side], rect);
        res.side = side;
        return res;
      }
    }
    return null;
  }

  // free in the room, around a point
  at(it, cx, cz, q = 0) {
    const hw = (q & 1 ? it.d : it.w) / 2, hd = (q & 1 ? it.w : it.d) / 2, rect = [cx - hw, cz - hd, cx + hw, cz + hd];
    if (!this.fits(rect, it)) return null;
    return this.put(it, cx, cz, q, rect);
  }

  center(it, q = this.w >= this.d ? 0 : 1) {
    const cx = (this.x0 + this.x1) / 2, cz = (this.z0 + this.z1) / 2;
    for (let i = 0; i < 5; i++) {
      const r = i * 0.45, a = Math.random() * 6.28;
      const res = this.at(it, cx + Math.cos(a) * r, cz + Math.sin(a) * r, q);
      if (res) return res;
    }
    return null;
  }

  // in front of what was placed last, facing it: the low table before the sofa
  front(it, gap = 0.55) {
    const L = this.last;
    if (!L) return null;
    const fx = [0, 1, 0, -1][L.q], fz = [1, 0, -1, 0][L.q], off = L.it.d / 2 + gap + it.d / 2;
    return this.at(it, L.cx + fx * off, L.cz + fz * off, L.q);
  }

  // right beside what was placed last, along the same wall
  beside(it) {
    const L = this.last;
    if (!L || !L.side) return null;
    const ax = L.side === 'n' || L.side === 's';
    for (const s of chance(0.5) ? [1, -1] : [-1, 1]) {
      const off = (L.it.w + it.w) / 2 + 0.06;
      const c = ax ? L.cx + s * off : L.cz + s * off;
      const prev = L;
      const res = this.wall(it, { side: L.side, at: c });
      if (res) return res;
      this.last = prev;
    }
    return null;
  }

  // rows of the same thing with aisles, as far as the room allows
  rows(it, stepX, stepZ, q = 0, margin = 0.2) {
    const iw = q & 1 ? it.d : it.w, id = q & 1 ? it.w : it.d;
    const nx = Math.max(1, Math.floor((this.w - margin * 2 + stepX - iw) / stepX)), nz = Math.max(1, Math.floor((this.d - margin * 2 + stepZ - id) / stepZ));
    const ox = (this.x0 + this.x1) / 2 - (nx - 1) * stepX / 2, oz = (this.z0 + this.z1) / 2 - (nz - 1) * stepZ / 2;
    let n = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (this.at(it, ox + i * stepX, oz + j * stepZ, q)) n++;
    return n;
  }

  // only looks: on the floor, on the ceiling, on the walls
  rug(m = pick(['carpetRed', 'carpetBlue', 'carpetBeige', 'carpetGrey'])) {
    const cx = (this.x0 + this.x1) / 2, cz = (this.z0 + this.z1) / 2, w = Math.min(this.w - 1.2, 3.2), d = Math.min(this.d - 1.2, 2.3), y = this.P.y;
    if (w < 1 || d < 1) return;
    this.K.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + 0.012, cz + d / 2, m, { ...DECO, faces: '+y' });
  }
  lamp(s = 0.3) {
    const cx = (this.x0 + this.x1) / 2, cz = (this.z0 + this.z1) / 2, H = this.P.y + this.P.h - SLAB;
    this.K.box(cx - s, H - 0.05, cz - s, cx + s, H, cz + s, 'lampOn', { ...DECO, faces: '-y+x-x+z-z' });
  }
  lamps(step = 5.5) {
    const H = this.P.y + this.P.h - SLAB, nx = Math.max(1, Math.round(this.w / step)), nz = Math.max(1, Math.round(this.d / step));
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = this.x0 + this.w * (i + 0.5) / nx, z = this.z0 + this.d * (j + 0.5) / nz;
      this.K.box(x - 0.6, H - 0.05, z - 0.14, x + 0.6, H, z + 0.14, 'lampOn', { ...DECO, faces: '-y+x-x+z-z' });
    }
  }
  // a flat thing on a free stretch of wall: picture, board, screen
  flat(w, h, y, mat, o = {}) {
    const r = this.r;
    for (const side of shuffle(['n', 's', 'w', 'e'])) {
      const along = side === 'n' || side === 's', a0 = (along ? this.x0 : this.z0) + w / 2 + 0.2, a1 = (along ? this.x1 : this.z1) - w / 2 - 0.2;
      if (a1 < a0) continue;
      for (let i = 0; i < 3; i++) {
        const c = a0 + Math.random() * (a1 - a0);
        const line = side === 'n' ? this.z0 : side === 's' ? this.z1 : side === 'w' ? this.x0 : this.x1;
        const hit = r.wins.some((W) => W.side === side && c + w / 2 > W.s - 0.1 && c - w / 2 < W.e + 0.1) || r.doors.some((D) => D.ax === (along ? 'x' : 'z') && Math.abs(D.line - line) < 0.3 && Math.abs(D.c - c) < D.w / 2 + w / 2 + 0.2);
        if (hit) continue;
        const rect = along ? [c - w / 2, line - 0.3, c + w / 2, line + 0.3] : [line - 0.3, c - w / 2, line + 0.3, c + w / 2];
        if (this.placed.some((q) => over(rect, q))) continue;
        const s = this.K.sub(along ? c : line, along ? line : c, Q_OF[side], false, this.P.y);
        s.box(-w / 2 - 0.04, y - 0.04, 0, w / 2 + 0.04, y + h + 0.04, 0.02, o.frame || 'woodDark', { ...DECO, faces: '+z+x-x+y-y' });
        s.box(-w / 2, y, 0.02, w / 2, y + h, 0.021, mat, { ...DECO, faces: '+z' });
        return true;
      }
    }
    return false;
  }
  art() { this.flat(rnd(0.6, 1.3), rnd(0.5, 0.9), 1.35, pick(['canvasRed', 'canvasBlue', 'canvasYellow', 'canvasGreen', 'plasterOchre', 'plasterBlue', 'wallNavy'])); }

  // where things can lie
  loot() {
    const r = this.r, area = this.w * this.d, P = this.P;
    if (r.noLoot || (r.type === 'stair' && r.chests === undefined)) return;
    const nChest = r.chests ?? (area < 5 ? 0 : area < 28 ? 1 : area < 60 ? 2 : area < 120 ? 3 : 4);
    const nFloor = r.items ?? (area < 7 ? 1 : area < 22 ? 1 : area < 50 ? 2 : area < 120 ? 3 : 5);
    const taken = [];
    const free = (x, z, m) => {
      const q = [x - m, z - m, x + m, z + m];
      if (x - m < this.x0 || z - m < this.z0 || x + m > this.x1 || z + m > this.z1) return false;
      return !this.placed.some((a) => over(q, a)) && !this.block.some((a) => over(q, a)) && !taken.some((t) => (t[0] - x) ** 2 + (t[1] - z) ** 2 < 2.2 * 2.2);
    };
    const place = (n, m, kind) => {
      for (let i = 0; i < n; i++) for (let k = 0; k < 16; k++) {
        const x = this.x0 + m + Math.random() * (this.w - 2 * m), z = this.z0 + m + Math.random() * (this.d - 2 * m);
        if (!free(x, z, m)) continue;
        taken.push([x, z]);
        this.K.spot(x, P.y, z, { indoor: !r.outdoor, kind });
        break;
      }
    };
    place(nChest, 0.62, 'room');
    place(nFloor, 0.32, 'floor');
    for (const t of this.topSpots) this.K.spot(t.x, t.y, t.z, { indoor: !r.outdoor, kind: 'floor' });
  }
}

// ---------------------------------------------------------------------------
// Recipes: what goes into which room
// ---------------------------------------------------------------------------
const RECIPE = {
  living(p) {
    const s = p.wall(sofa); if (s) { p.front(coffeeTable, 0.5); }
    const o = s && { n: 's', s: 'n', w: 'e', e: 'w' }[s.side];
    if (p.w * p.d > 12) p.wall(tvStand, { side: o });
    p.wall(bookshelf); if (chance(0.6)) p.wall(armchair); if (chance(0.5)) p.wall(plant); if (chance(0.3)) p.wall(piano); if (chance(0.3)) p.wall(dresser);
    p.rug(); p.art(); if (chance(0.5)) p.art(); p.lamp();
  },
  bed(p) {
    if (p.wall(bed) && chance(0.8)) p.beside(nightstand);
    p.wall(wardrobe); if (chance(0.6)) p.wall(dresser); if (chance(0.3)) p.wall(armchair); if (chance(0.3)) p.wall(plant);
    if (chance(0.5)) p.rug(); p.art(); p.lamp();
  },
  suite(p) { RECIPE.bed(p); p.wall(sofa); p.wall(desk); p.wall(plant); },
  kitchen(p) {
    const n = Math.min(3.6, Math.max(p.w, p.d) - 1.2);
    const k = p.wall(kitchenRun(Math.max(1.5, n))); if (k && chance(0.7)) p.beside(fridge);
    if (p.w * p.d > 11) p.center(diningTable);
    p.lamp();
  },
  bath(p) { p.wall(tub); p.wall(toilet); p.wall(sink); p.lamp(0.2); },
  office(p) { p.wall(desk); p.wall(desk); if (p.w * p.d > 18) p.wall(desk); p.wall(cabinet); if (chance(0.6)) p.wall(cabinet); if (chance(0.6)) p.wall(plant); if (chance(0.5)) p.wall(bookshelf); p.flat(1.6, 1.0, 1.1, 'paintWhite', { frame: 'metal' }); p.lamps(); },
  study(p) { p.wall(desk); p.wall(bookshelf); p.wall(bookshelf); p.wall(armchair); p.rug(); p.art(); p.lamp(); },
  openoffice(p) { p.rows(cubicle, 5.6, 5.4); p.wall(cabinet); p.wall(cabinet); p.wall(plant); p.wall(plant); p.lamps(4.5); },
  meeting(p) { p.center(longTable(Math.min(5.2, Math.max(p.w, p.d) - 2.4))); p.flat(2.2, 1.2, 0.95, 'screen', { frame: 'black' }); p.wall(plant); p.lamps(); },
  server(p) { p.rows(rack, 2.6, 2.2); p.lamps(4); },
  classroom(p) { p.rows(schoolDesk, 1.9, 1.6, 0, 1.2); p.flat(3.2, 1.2, 0.95, 'chalk', { frame: 'woodDark' }); p.wall(cabinet); p.lamps(); },
  ward(p) { p.wall(wardBed); p.wall(wardBed); p.wall(wardBed); p.wall(wardBed); p.wall(cabinet); p.lamps(); },
  lab(p) { p.rows(benchLab, 3.6, 2.6); p.wall(shelfMetal); p.wall(fridge); p.lamps(); },
  lobby(p) { p.wall(reception); p.wall(sofa); p.wall(sofa); p.wall(plant); p.wall(plant); p.wall(plant); p.rug('carpetRed'); p.art(); p.lamps(); },
  shop(p) { p.wall(counter(2.4)); p.wall(fridge); p.wall(fridge); p.rows(gondola(Math.min(3.4, p.w - 3.4)), 99, 2.6, 0, 1.2); p.lamps(); },
  market(p) { p.rows(gondola(3.2), 5.0, 3.4, 0, 1.5); p.wall(counter(3)); p.wall(fridge); p.lamps(); },
  storeroom(p) { p.wall(shelfMetal); p.wall(shelfMetal); p.wall(crates); if (chance(0.7)) p.wall(drums); if (p.w * p.d > 18) p.wall(shelfMetal); },
  bar(p) {
    const n = Math.max(p.w, p.d), side = p.w >= p.d ? 'n' : 'w', w = Math.min(n - 2.6, 7.5);
    const a = side === 'n' ? (p.x0 + p.x1) / 2 : (p.z0 + p.z1) / 2;
    p.wall(bottles(w), { side, at: a }); p.at(barCounter(w), side === 'n' ? a : p.x0 + 1.75, side === 'n' ? p.z0 + 1.75 : a, side === 'n' ? 0 : 1);
    for (let i = 0; i < 6; i++) { const x = p.x0 + 1.2 + Math.random() * (p.w - 2.4), z = p.z0 + 3.2 + Math.random() * Math.max(0.1, p.d - 4.4); p.at(roundTable, x, z, 0); }
    p.art(); p.lamps(3.5);
  },
  restaurant(p) { p.rows(diningTable, 3.4, 2.9, 0, 0.9); p.wall(plant); p.art(); p.lamps(3.5); },
  garage(p) { p.wall(workbench); p.wall(toolCabinet); p.wall(tires); p.wall(tires); p.wall(drums); if (p.w * p.d > 45 && !p.r.noCar) p.center(carStatic, 1); p.lamps(); },
  archive(p) { p.rows(bookshelf, 99, 1.9, 1 - (p.w >= p.d ? 1 : 0), 0.3); p.rows(shelfMetal, 3.4, 2.6, p.w >= p.d ? 1 : 0, 1.0); p.wall(cabinet); p.lamps(); },
  attic(p) { p.wall(crates); p.wall(bedSingle); if (chance(0.6)) p.wall(dresser); },
  barn(p) { p.wall(hay); p.wall(hay); p.wall(hay); p.center(hay); p.wall(crates); },
  bunk(p) { const rows = Math.floor((p.d - 0.4) / 2.6); for (let i = 0; i < 5; i++) { p.wall(bunkBed); } p.wall(locker); p.wall(locker); p.lamps(); void rows; },
  gym(p) { p.wall(bleachers(Math.min(14, Math.max(p.w, p.d) - 4))); p.wall(locker); p.wall(locker); p.center(bench); p.lamps(5); },
  hall(p) { if (chance(0.6)) p.wall(plant); if (chance(0.5)) p.wall(bench); if (chance(0.4)) p.wall(dresser); p.art(); p.lamp(); },
  corridor(p) { if (chance(0.3) && Math.min(p.w, p.d) > 2.2) p.wall(bench); p.lamps(6); },
  terrace(p) { p.wall(deckChair); p.wall(deckChair); p.wall(planter); p.wall(planter); if (p.w * p.d > 18) p.center(roundTable); },
  court(p) { p.wall(planter); p.wall(planter); p.wall(bench); p.wall(bench); },
};
RECIPE.market = RECIPE.market; RECIPE.chapel = () => {}; RECIPE.stair = () => {}; RECIPE.empty = (p) => { if (chance(0.5)) p.wall(crates); };

export function furnish(P, r) {
  const p = new Packer(P, r);
  const fill = r.fill === false ? null : RECIPE[r.type];
  if (fill && p.w > 1.2 && p.d > 1.2) fill(p);
  if (r.extra) r.extra(p);
  p.loot();
}

export const ITEMS = { fireplace, bed, bedSingle, wardrobe, dresser, bookshelf, shelfMetal, sofa, armchair, coffeeTable, tvStand, fridge, diningTable, roundTable, desk, cabinet, locker, rack, counter, barCounter, bottles, workbench, toolCabinet, tires, crates, drums, hay, bunkBed, plant, deckChair, planter, bench, pew, carStatic, gondola, longTable, kitchenRun, chair, reception };
