import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const workspaceDir = process.cwd();
const artifactsDir = path.join(workspaceDir, 'artifacts', 'bsmi');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  await ensureDir(artifactsDir);

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().at(-1);

  if (!page) {
    throw new Error('No Chrome page was available on the debug port.');
  }

  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"]')]
      .map((el) => ({
        tag: el.tagName,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        href: el.getAttribute('href') || '',
      }))
      .filter((item) => item.text || item.href);

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const lines = [];
    while (walker.nextNode()) {
      const value = walker.currentNode.nodeValue?.replace(/\s+/g, ' ').trim();
      if (value) lines.push(value);
    }

    return {
      url: location.href,
      title: document.title,
      buttons,
      texts: [...new Set(lines)].slice(0, 500),
    };
  });

  await page.screenshot({ path: path.join(artifactsDir, 'attach-probe.png'), fullPage: true });
  await fs.writeFile(path.join(artifactsDir, 'attach-probe.json'), JSON.stringify(state, null, 2), 'utf8');
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
