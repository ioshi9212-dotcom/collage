import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/editor/printGeometryIntegration.test.mjs';
let source = readFileSync(path, 'utf8');
const before = "assert.match(app, /spreadPrintGeometry.*>PNG разворота</, 'spread export must receive spread print geometry');";
const after = "assert.match(app, /const activeSpreadPrintGeometry = spreadPageCount === 1 \\? pagePrintGeometry : spreadPrintGeometry;/, 'opening spread must use page geometry while book pairs use spread geometry');\nassert.match(app, /activeSpreadPrintGeometry.*>PNG разворота</, 'spread export must receive the active book-spread print geometry');";
if (!source.includes(before)) throw new Error('Legacy spread print assertion not found');
source = source.replace(before, after);
writeFileSync(path, source);
console.log('Book spread print integration assertion updated');
