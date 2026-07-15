const fs = require('fs');
const path = require('path');

const srcFiles = [
  { name: 'bus-icon.png', required: true },
  { name: 'school-location-icon.png', required: true }
];

const destinations = [
  path.join(__dirname, '../apps/admin_dashboard/public/assets'),
  path.join(__dirname, '../apps/driver_app/assets'),
  path.join(__dirname, '../apps/parent_app/assets')
];

const rootDir = path.join(__dirname, '..');

// Clean up old school-icon.png in destinations
destinations.forEach(destDir => {
  const oldSchoolIcon = path.join(destDir, 'school-icon.png');
  if (fs.existsSync(oldSchoolIcon)) {
    try {
      fs.unlinkSync(oldSchoolIcon);
      console.log(`Deleted obsolete icon: ${path.relative(rootDir, oldSchoolIcon)}`);
    } catch (err) {
      console.warn(`Failed to delete obsolete icon ${oldSchoolIcon}:`, err.message);
    }
  }
});

// Sync logic
srcFiles.forEach(file => {
  const srcPath = path.join(rootDir, file.name);
  if (!fs.existsSync(srcPath)) {
    if (file.required) {
      console.error(`Required asset not found: ${srcPath}`);
      process.exit(1);
    }
    return;
  }

  destinations.forEach(destDir => {
    try {
      fs.mkdirSync(destDir, { recursive: true });
      const destPath = path.join(destDir, file.name);
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied ${file.name} -> ${path.relative(rootDir, destPath)}`);
    } catch (err) {
      console.error(`Failed to copy to ${destDir}:`, err.message);
    }
  });
});

console.log("Assets synchronized successfully!");
