import sharp from "sharp";
import fs from "fs";
import path from "path";

const assets = "C:/Users/Zbook/.cursor/projects/c-Dev-School-Transpot/assets";
const root = "c:/Dev/School-Transpot/releases/play-store/driver";
const phoneDir = path.join(root, "phone-screenshots");
const tablet7 = path.join(root, "tablet-7-screenshots");
const tablet10 = path.join(root, "tablet-10-screenshots");

for (const d of [phoneDir, tablet7, tablet10]) {
  fs.mkdirSync(d, { recursive: true });
}

const shots = [
  ["shot-driver-login.png", "01-login"],
  ["shot-driver-trip.png", "02-start-trip"],
  ["shot-driver-checklist.png", "03-boarding-checklist"],
  ["shot-driver-live.png", "04-live-gps"],
];

for (const [src, name] of shots) {
  const input = path.join(assets, src);
  if (!fs.existsSync(input)) {
    throw new Error(`Missing source: ${input}`);
  }
  await sharp(input)
    .resize(1080, 1920, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(phoneDir, `${name}.png`));
  await sharp(input)
    .resize(1200, 1920, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(tablet7, `${name}.png`));
  await sharp(input)
    .resize(1920, 1080, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(tablet10, `${name}.png`));
  console.log("ok", name);
}

fs.writeFileSync(
  path.join(root, "SCREENSHOTS.txt"),
  [
    "Phone screenshots (Play Console → Phone assets)",
    "===============================================",
    "Folder: releases/play-store/driver/phone-screenshots",
    "Format: PNG 1080x1920 (9:16) — 4 images",
    "",
    "01-login.png",
    "02-start-trip.png",
    "03-boarding-checklist.png",
    "04-live-gps.png",
    "",
    "Also prepared:",
    "- tablet-7-screenshots/  (1200x1920)",
    "- tablet-10-screenshots/ (1920x1080)",
    "",
    "Upload at least 2 phone screenshots; 4 recommended for promotion.",
    "Synthetic Play Review student names only.",
    "",
  ].join("\n")
);

console.log("done");
