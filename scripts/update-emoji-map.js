const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const csvPath = path.join(repoRoot, 'bilibili-emoji', 'bilibili-emoji.csv');
const outputPath = path.join(repoRoot, 'src', 'emoji-map.js');

function parseEmojiRow(line) {
  var parts = line.split(',');
  if (parts.length < 3) return null;

  var name = parts[0].trim();
  var resourceId = parts[2].trim();
  if (!name || !resourceId) return null;

  return { name: name, resourceId: resourceId };
}

function main() {
  var csv = fs.readFileSync(csvPath, 'utf8');
  var lines = csv.trim().split(/\r?\n/).slice(1);
  var entries = [];

  for (var i = 0; i < lines.length; i++) {
    var entry = parseEmojiRow(lines[i]);
    if (entry) entries.push(entry);
  }

  entries.sort(function (a, b) {
    return a.resourceId.localeCompare(b.resourceId);
  });

  var map = {};
  for (var j = 0; j < entries.length; j++) {
    map[entries[j].resourceId] = entries[j].name;
  }

  var content =
    '// Auto-generated from bilibili-emoji/bilibili-emoji.csv\n' +
    '// Do not edit manually.\n\n' +
    'export const EMOJI_ID_TO_NAME = ' + JSON.stringify(map, null, 2) + ';\n';

  fs.writeFileSync(outputPath, content, 'utf8');
  console.log('Updated ' + path.relative(repoRoot, outputPath) + ' with ' + entries.length + ' emoji mappings.');
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}