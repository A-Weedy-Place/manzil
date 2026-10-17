export type EntryRoad = {
  d: string;
  kind: 'highway' | 'secondary' | 'local';
};

// Original decorative road drawing, deliberately unrelated to routable map data.
// Connected regional corridors link small street grids rather than repeating a
// country-wide zigzag. The entry illustration clips these paths to its outline.
const regionalRoads: EntryRoad[] = [
  { kind: 'highway', d: 'M199 39C205 53 196 64 195 78S194 94 194 103C193 123 180 133 182 151S177 180 179 200C179 216 165 231 165 248S155 270 151 284C147 300 134 307 133 321S126 352 118 371C114 385 124 393 128 407' },
  { kind: 'highway', d: 'M179 200C164 198 149 199 138 212S115 239 106 250C94 266 88 290 73 305S55 324 48 342C45 351 38 356 27 358' },
  { kind: 'secondary', d: 'M195 78C180 78 171 87 166 101S163 119 154 129C143 145 147 162 136 178S120 191 113 207C107 220 91 229 78 235S48 242 32 236' },
  { kind: 'secondary', d: 'M194 103C206 100 218 102 229 92S247 78 259 79' },
  { kind: 'secondary', d: 'M182 151C199 150 207 139 213 125S226 112 244 115C253 117 260 120 269 130' },
  { kind: 'secondary', d: 'M179 200C193 196 202 185 207 174S218 160 228 152' },
  { kind: 'secondary', d: 'M165 248C177 245 185 235 189 222S199 210 210 207' },
  { kind: 'secondary', d: 'M151 284C162 278 177 276 184 263S189 248 194 239' },
  { kind: 'secondary', d: 'M133 321C148 322 154 333 152 347S153 366 160 375' },
  { kind: 'secondary', d: 'M118 371C107 365 94 366 80 361S59 351 48 342' },
  { kind: 'secondary', d: 'M128 397C138 390 148 389 160 393' },
  { kind: 'secondary', d: 'M138 212C142 228 132 243 127 258S112 285 112 300C112 313 122 319 133 321' },
  { kind: 'secondary', d: 'M106 250C91 249 72 254 64 266S63 290 73 305' },
  { kind: 'secondary', d: 'M73 305C88 310 91 325 88 339S89 356 99 369' },
  { kind: 'secondary', d: 'M48 342C61 341 74 345 87 351S105 357 118 371' },
  { kind: 'secondary', d: 'M195 78C208 76 215 63 221 50S234 43 244 47' },
  { kind: 'secondary', d: 'M194 103C181 110 173 124 172 138S175 147 182 151' },
  { kind: 'secondary', d: 'M182 151C165 151 158 163 157 178S166 195 179 200' },
  { kind: 'secondary', d: 'M165 248C150 250 145 265 144 276S148 282 151 284' },
  { kind: 'local', d: 'M199 39C193 33 185 34 181 43S176 57 184 61L195 65' },
  { kind: 'local', d: 'M221 50C229 59 226 70 234 77S251 92 252 102L244 115' },
  { kind: 'local', d: 'M229 92C231 101 236 107 244 115M213 125C204 121 201 111 194 103' },
  { kind: 'local', d: 'M166 101C174 95 179 91 184 82L195 78M154 129C165 132 172 130 180 122L190 114' },
  { kind: 'local', d: 'M207 174C198 170 192 160 192 149M136 178C144 182 150 180 157 178' },
  { kind: 'local', d: 'M113 207C123 204 129 205 138 212M78 235C81 246 89 251 99 252' },
  { kind: 'local', d: 'M64 266C54 264 47 268 44 276S42 293 35 299M73 305C58 301 48 303 40 310' },
  { kind: 'local', d: 'M88 339C99 339 110 334 118 328L133 321M112 300C125 297 135 298 145 300' },
  { kind: 'local', d: 'M127 258C139 252 148 247 151 234S155 216 162 209' },
  { kind: 'local', d: 'M48 342C34 336 28 341 24 351L27 358M99 369C99 382 108 390 119 390' },
];

type District = { x: number; y: number; width: number; height: number; angle: number };

// Streets meet at real drawn junctions. Each district's central road meets one
// of the regional corridors above; differing block sizes keep the view natural.
function districtStreets({ x, y, width, height, angle }: District): EntryRoad[] {
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const point = (px: number, py: number) => `${(x + px * cos - py * sin).toFixed(1)} ${(y + px * sin + py * cos).toFixed(1)}`;
  const roads: EntryRoad[] = [];

  for (let row = -2; row <= 2; row += 1) {
    const py = row * height / 2;
    roads.push({ kind: 'local', d: `M${point(-width, py)}L${point(width, py)}` });
  }
  for (let column = -2; column <= 2; column += 1) {
    const px = column * width / 2;
    roads.push({ kind: 'local', d: `M${point(px, -height)}L${point(px, height)}` });
  }

  // An outer connector rounds the rigid street blocks into an irregular town.
  roads.push({
    kind: 'local',
    d: `M${point(-width, 0)}C${point(-width * 1.5, -height * .8)} ${point(-width * .4, -height * 1.5)} ${point(0, -height)}S${point(width * 1.5, -height * 1.1)} ${point(width, 0)}C${point(width * 1.3, height * 1.1)} ${point(width * .5, height * 1.3)} ${point(0, height)}S${point(-width * 1.4, height * 1.1)} ${point(-width, 0)}`,
  });
  return roads;
}

const districts: District[] = [
  { x: 195, y: 78, width: 7, height: 7, angle: -18 },
  { x: 194, y: 103, width: 13, height: 11, angle: -25 },
  { x: 229, y: 92, width: 8, height: 8, angle: 18 },
  { x: 182, y: 151, width: 12, height: 13, angle: -14 },
  { x: 179, y: 200, width: 16, height: 13, angle: -28 },
  { x: 165, y: 248, width: 14, height: 13, angle: -19 },
  { x: 151, y: 284, width: 11, height: 10, angle: -29 },
  { x: 133, y: 321, width: 15, height: 11, angle: -17 },
  { x: 73, y: 305, width: 10, height: 9, angle: 14 },
  { x: 48, y: 342, width: 10, height: 7, angle: -9 },
  { x: 118, y: 371, width: 10, height: 11, angle: -20 },
  { x: 128, y: 397, width: 9, height: 7, angle: 12 },
];

export const entryRoadNetwork: EntryRoad[] = [
  ...regionalRoads,
  ...districts.flatMap(districtStreets),
];
