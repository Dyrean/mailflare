import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/tmp/showreel-render/package.json");
const puppeteer = require("puppeteer-core");

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = path.join(dir, "film.html");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const arg = process.argv.find((a) => a.startsWith("--times="));
const times = arg
	? arg.slice("--times=".length).split(",").map(Number)
	: null;

const outDir = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length)
	|| "/tmp/showreel-frames";
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
	executablePath: chrome,
	headless: "new",
	args: ["--hide-scrollbars", "--disable-lcd-text", "--force-color-profile=srgb"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto("file://" + html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);

const frames = times ?? Array.from({ length: 15 * 30 }, (_, i) => i / 30);
for (let i = 0; i < frames.length; i++) {
	const t = frames[i];
	await page.evaluate((time) => window.seek(time), t);
	const name = times
		? `proof-${String(t).replace(".", "_")}.jpg`
		: `f${String(i).padStart(4, "0")}.jpg`;
	await page.screenshot({
		path: path.join(outDir, name),
		type: "jpeg",
		quality: 92,
	});
	if (!times && i % 30 === 0) process.stdout.write(`t=${t.toFixed(2)}\n`);
}
await browser.close();
console.log(outDir);
