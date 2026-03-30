import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const workspaceDir = process.cwd();
const inputPath = path.join(workspaceDir, 'artifacts', 'bsmi', 'all-histories.json');
const outputDir = path.join(workspaceDir, 'artifacts', 'bsmi', 'attachments');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  await ensureDir(outputDir);
  const raw = await fs.readFile(inputPath, 'utf8');
  const data = JSON.parse(raw);

  const attachments = new Map();
  for (const entry of data.histories || []) {
    for (const q of entry.result.quiz || []) {
      for (const att of q.attachment || []) {
        attachments.set(att.url, att.filename || path.basename(att.url));
      }
      for (const opt of q.options || []) {
        if (opt.attachment?.url) {
          attachments.set(opt.attachment.url, opt.attachment.filename || path.basename(opt.attachment.url));
        }
      }
    }
  }

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const cookies = await context.cookies('https://metrology.bsmi.gov.tw');
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  const manifest = {};
  for (const [url, filename] of attachments.entries()) {
    const safeName = filename.replace(/[<>:"/\\|?*]+/g, '_');
    const absUrl = url.startsWith('http') ? url : `https://metrology.bsmi.gov.tw${url}`;
    const outPath = path.join(outputDir, safeName);

    try {
      await fs.access(outPath);
      manifest[url] = outPath;
      continue;
    } catch {}

    const response = await fetch(absUrl, {
      headers: {
        Cookie: cookieHeader,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to download ${absUrl}: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(outPath, Buffer.from(arrayBuffer));
    manifest[url] = outPath;
  }

  await fs.writeFile(path.join(workspaceDir, 'artifacts', 'bsmi', 'attachments-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
