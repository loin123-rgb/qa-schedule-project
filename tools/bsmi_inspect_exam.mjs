import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = path.join(process.cwd(), 'artifacts', 'bsmi');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function snapshot(page, name) {
  const state = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"]')]
      .map((el, index) => ({
        index,
        tag: el.tagName,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        value: el.getAttribute('value') || '',
        href: el.getAttribute('href') || '',
        cls: el.className || '',
      }))
      .filter((item) => item.text || item.value || item.href);

    const inputs = [...document.querySelectorAll('input, textarea, select')]
      .map((el, index) => ({
        index,
        tag: el.tagName,
        type: el.getAttribute('type') || '',
        name: el.getAttribute('name') || '',
        value: el.value || '',
        checked: 'checked' in el ? Boolean(el.checked) : undefined,
        cls: el.className || '',
      }));

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const lines = [];
    while (walker.nextNode()) {
      const value = walker.currentNode.nodeValue?.replace(/\s+/g, ' ').trim();
      if (value) lines.push(value);
    }

    return {
      url: location.href,
      title: document.title,
      texts: [...new Set(lines)].slice(0, 1000),
      buttons,
      inputs,
      html: document.body.innerHTML,
    };
  });

  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  await fs.writeFile(path.join(outDir, `${name}.json`), JSON.stringify(state, null, 2), 'utf8');
}

async function main() {
  await ensureDir(outDir);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().at(-1);

  if (!page) throw new Error('No page found');

  await page.goto('https://metrology.bsmi.gov.tw/exam/web/#/exam/list', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  await snapshot(page, 'inspect-list');

  const enterButtons = page.locator('button.btn.btn--secondary.btn--xs');
  const enterCount = await enterButtons.count();
  if (enterCount > 2) {
    await enterButtons.nth(2).click();
  } else if (enterCount > 0) {
    await enterButtons.first().click();
  }

  await page.waitForTimeout(5000);
  await snapshot(page, 'inspect-exam');

  await page.getByRole('button', { name: '開始測驗' }).click();
  await page.waitForTimeout(5000);
  await snapshot(page, 'inspect-question');

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
