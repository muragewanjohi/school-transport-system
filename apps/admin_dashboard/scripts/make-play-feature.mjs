import sharp from "sharp";
import path from "path";

const out = "c:/Dev/School-Transpot/releases/play-store/driver";
const brand512 =
  "c:/Dev/School-Transpot/apps/admin_dashboard/public/android-chrome-512x512.png";

const svg = Buffer.from(`<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F8F9FF"/>
      <stop offset="55%" stop-color="#E8F6EE"/>
      <stop offset="100%" stop-color="#D7F0E0"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <rect x="0" y="0" width="12" height="500" fill="#006B32"/>
  <text x="64" y="210" font-family="Segoe UI, Arial, sans-serif" font-size="64" font-weight="700" fill="#0B1C30">OnTheBus</text>
  <text x="64" y="290" font-family="Segoe UI, Arial, sans-serif" font-size="64" font-weight="700" fill="#006B32">Driver</text>
  <text x="64" y="360" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="600" fill="#3D4A3E">Live trips · GPS · Boarding checklist</text>
</svg>`);

const pin = await sharp(brand512).resize(300, 300).png().toBuffer();

await sharp(svg)
  .composite([{ input: pin, left: 680, top: 100 }])
  .png()
  .toFile(path.join(out, "feature-graphic-1024x500.png"));

console.log("Wrote feature-graphic-1024x500.png");
