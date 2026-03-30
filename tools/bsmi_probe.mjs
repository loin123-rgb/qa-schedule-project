import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const HOME_URL = 'https://metrology.bsmi.gov.tw/bsmi/#/home';
const EXAM_URL = 'https://metrology.bsmi.gov.tw/exam/web/#/exam/list';
const workspaceDir = process.cwd();
const artifactsDir = path.join(workspaceDir, 'artifacts', 'bsmi');
const profileDir = path.join(workspaceDir, '.codex-bsmi-profile');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function getTextSummary(lines) {
  return [...new Set(lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

async function collectPageState(page) {
  return page.evaluate(() => {
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
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
    };
  });
}

async function pickActivePage(context) {
  const pages = context.pages().filter((page) => !page.isClosed());
  return pages.at(-1) || null;
}

async function main() {
  await ensureDir(artifactsDir);
  await ensureDir(profileDir);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 960 },
  });

  let page = await pickActivePage(context);
  if (!page) page = await context.newPage();

  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  const startedAt = Date.now();
  const maxWaitMs = 15 * 60 * 1000;
  let state = null;

  let loginConfirmed = false;

  while (Date.now() - startedAt < maxWaitMs) {
    page = await pickActivePage(context);
    if (!page) break;

    try {
      state = await collectPageState(page);
    } catch {
      await page.waitForTimeout(1000);
      continue;
    }

    const textBlob = state.texts.join('\n');
    const hasExamMarkers =
      state.url.includes('/exam/web/#/exam/list') ||
      textBlob.includes('進入考試') ||
      textBlob.includes('查看結果') ||
      textBlob.includes('模擬考試') ||
      textBlob.includes('正式考試');
    const hasLoginButton = textBlob.includes('登入');
    const hasAccountMenu = state.buttons.some((button) => button.text.includes('account_circle')) || !hasLoginButton;

    if (hasAccountMenu && !hasLoginButton) {
      loginConfirmed = true;
    }

    if (hasExamMarkers) {
      break;
    }

    if (loginConfirmed && page.url().startsWith(HOME_URL)) {
      const examLink = page.getByText('考試平台').first();
      if (await examLink.count()) {
        await examLink.click().catch(() => {});
      }
    }

    if (loginConfirmed && !page.url().includes('/exam/web/')) {
      await page.goto(EXAM_URL, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
    }

    await page.waitForTimeout(2000);
  }

  page = await pickActivePage(context);
  if (!page) {
    throw new Error('Browser window was closed before the exam page became ready.');
  }

  state = await collectPageState(page);
  await page.screenshot({ path: path.join(artifactsDir, 'probe-ready.png'), fullPage: true });
  await fs.writeFile(path.join(artifactsDir, 'probe-state.json'), JSON.stringify({
    ...state,
    textSummary: getTextSummary(state.texts),
  }, null, 2), 'utf8');

  await context.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
