import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const workspaceDir = process.cwd();
const outDir = path.join(workspaceDir, 'artifacts', 'bsmi');
const attachmentDir = path.join(outDir, 'attachments');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*]+/g, '_');
}

function uniqueNameFromUrl(absUrl, contentType) {
  const token = absUrl.includes('f=') ? absUrl.split('f=')[1] : path.basename(absUrl.split('?')[0]);
  const safe = sanitizeName(token).slice(0, 180);
  return `${safe}${extFromContentType(contentType) || '.bin'}`;
}

function extFromContentType(contentType = '') {
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('svg')) return '.svg';
  if (contentType.includes('webp')) return '.webp';
  return '';
}

async function clickDetailButton(page) {
  const buttons = page.locator('button.btn');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const text = ((await buttons.nth(i).textContent()) || '').replace(/\s+/g, ' ').trim();
    if (text.includes('詳細作答情況')) {
      await buttons.nth(i).click();
      return true;
    }
  }
  return false;
}

async function main() {
  await ensureDir(outDir);
  await ensureDir(attachmentDir);

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().at(-1);
  if (!page) throw new Error('No Chrome page found.');

  const cookies = await context.cookies('https://metrology.bsmi.gov.tw');
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const manifest = {};

  async function downloadUrl(src, suggestedName = '') {
    const absUrl = src.startsWith('http') ? src : `https://metrology.bsmi.gov.tw${src}`;
    if (manifest[src]) return;

    const response = await fetch(absUrl, {
      headers: { Cookie: cookieHeader },
    });
    if (!response.ok) return;

    const contentType = response.headers.get('content-type') || '';
    const body = Buffer.from(await response.arrayBuffer());
    let filename = sanitizeName((suggestedName || '').trim());
    if (!filename) {
      filename = sanitizeName(path.basename(absUrl.split('?')[0]) || 'image');
    }
    if (!path.extname(filename) || filename === 'resource_show') {
      filename = uniqueNameFromUrl(absUrl, contentType);
    }
    const outPath = path.join(attachmentDir, filename);
    await fs.writeFile(outPath, body);
    manifest[src] = outPath;
  }

  async function openResultDialog() {
    await page.goto('https://metrology.bsmi.gov.tw/exam/web/#/exam/list', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForTimeout(2500);
    const resultButtons = page.locator('button.btn.btn--secondary.btn--xs');
    await resultButtons.nth(3).click();
    await page.waitForTimeout(2000);
  }

  await openResultDialog();

  for (let i = 0; i < 50; i += 1) {
    const rows = page.locator('li.record');
    const count = await rows.count();
    if (i >= count) break;

    await rows.nth(i).click();
    await page.waitForTimeout(2200);
    await clickDetailButton(page);
    await page.waitForTimeout(2500);

    const images = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .map((img) => ({
          src: img.getAttribute('src') || '',
          alt: img.getAttribute('alt') || '',
        }))
        .filter((img) => img.src && !img.src.includes('logo-xxl'))
    );

    const seen = new Set();
    for (const image of images) {
      const key = `${image.src}::${image.alt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await downloadUrl(image.src, image.alt);
    }

    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
    await openResultDialog();
  }

  await fs.writeFile(path.join(outDir, 'attachments-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
