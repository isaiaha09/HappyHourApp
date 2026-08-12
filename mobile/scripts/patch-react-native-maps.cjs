const fs = require('node:fs');
const path = require('node:path');

const mapSourcePath = path.resolve(__dirname, '..', 'node_modules', 'react-native-maps', 'ios', 'AirMaps', 'AIRMap.m');

if (!fs.existsSync(mapSourcePath)) {
  process.exit(0);
}

const source = fs.readFileSync(mapSourcePath, 'utf8');
const unsafeInsertion = '    [_reactSubviews insertObject:(UIView *)subview atIndex:(NSUInteger) atIndex];';
const safeInsertion = [
  '    NSUInteger insertionIndex = (NSUInteger)MIN(MAX(atIndex, 0), (NSInteger)_reactSubviews.count);',
  '    [_reactSubviews insertObject:(UIView *)subview atIndex:insertionIndex];',
].join('\n');

if (source.includes(safeInsertion)) {
  process.exit(0);
}

if (!source.includes(unsafeInsertion)) {
  throw new Error(`Could not find the expected react-native-maps insertion site in ${mapSourcePath}`);
}

fs.writeFileSync(mapSourcePath, source.replace(unsafeInsertion, safeInsertion));