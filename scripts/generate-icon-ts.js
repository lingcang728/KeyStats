const fs = require('fs');
const path = require('path');

const iconPath = path.join(__dirname, '../resources/icon.png');
const outputPath = path.join(__dirname, '../src/main/iconData.ts');

try {
  const bitmap = fs.readFileSync(iconPath);
  const base64 = bitmap.toString('base64');
  const content = `// Auto-generated icon data
export const ICON_BASE64 = 'data:image/png;base64,${base64}';
`;

  fs.writeFileSync(outputPath, content);
  console.log('Icon data generated at:', outputPath);
} catch (err) {
  console.error('Error generating icon data:', err);
}
