import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = path.join(process.cwd(), 'artifacts', 'bsmi');
const examId = 151;

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function api(page, url, options = {}) {
  return page.evaluate(async ({ url, options }) => {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, ok: response.ok, json, text };
  }, { url, options });
}

async function visibleText(locator) {
  if (await locator.count() === 0) return '';
  return ((await locator.first().textContent()) || '').replace(/\s+/g, ' ').trim();
}

async function clickIfVisible(locator) {
  if (await locator.count() === 0) return false;
  const target = locator.first();
  if (!(await target.isVisible().catch(() => false))) return false;
  await target.click();
  return true;
}

async function dismissDialogs(page) {
  for (let i = 0; i < 5; i += 1) {
    const closeBtn = page.locator('.dialog__title button, .cdk-overlay-pane button').filter({ hasText: 'close' });
    const confirmBtn = page.locator('.cdk-overlay-pane .btn--primary, .cdk-overlay-pane button');
    const dialogText = await visibleText(page.locator('.cdk-overlay-pane'));
    if (!dialogText) break;

    if (dialogText.includes('測驗已交卷') || dialogText.includes('不能再應考')) {
      if (await clickIfVisible(confirmBtn)) {
        await page.waitForTimeout(800);
      }
      continue;
    }

    if (await clickIfVisible(confirmBtn)) {
      await page.waitForTimeout(800);
      continue;
    }

    if (await clickIfVisible(closeBtn)) {
      await page.waitForTimeout(800);
      continue;
    }

    break;
  }
}

async function goToPracticeList(page) {
  await page.goto('https://metrology.bsmi.gov.tw/exam/web/#/exam/list', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(3000);
}

async function startNewAttempt(page) {
  await goToPracticeList(page);
  await dismissDialogs(page);

  const enterButtons = page.locator('button.btn.btn--secondary.btn--xs');
  const buttonCount = await enterButtons.count();
  if (buttonCount < 3) {
    throw new Error(`Expected at least 3 action buttons on practice list, got ${buttonCount}.`);
  }

  await enterButtons.nth(2).click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: '開始測驗' }).click();
  await page.waitForTimeout(2500);
}

async function answerAllA(page) {
  const visitLog = [];
  for (let step = 0; step < 90; step += 1) {
    await dismissDialogs(page);

    const headerText = await visibleText(page.locator('.question__header div').first());
    const match = headerText.match(/Q\s*(\d+)/i);
    const qNo = match ? Number(match[1]) : null;
    const qText = await visibleText(page.locator('.question__title').first());
    const actionText = await visibleText(page.locator('.question-card__action-group .btn--primary').first());
    visitLog.push({ step, qNo, qText, actionText, url: page.url() });

    if (qNo === null) {
      break;
    }

    const firstRadio = page.locator('mat-radio-button').first();
    if (await firstRadio.count()) {
      await firstRadio.click();
      await page.waitForTimeout(300);
    }

    const beforeHeader = headerText;
    const primaryButton = page.locator('.question-card__action-group .btn--primary').first();
    await primaryButton.click();
    await page.waitForTimeout(1200);

    const dialogText = await visibleText(page.locator('.cdk-overlay-pane').first());
    if (dialogText) {
      const confirmButton = page.locator('.cdk-overlay-pane .btn--primary, .cdk-overlay-pane button').first();
      if (await confirmButton.count()) {
        await confirmButton.click();
        await page.waitForTimeout(1500);
      }
    }

    for (let retry = 0; retry < 10; retry += 1) {
      const currentHeader = await visibleText(page.locator('.question__header div').first());
      const overlayText = await visibleText(page.locator('.cdk-overlay-pane').first());
      if (!page.url().includes('/exam/question')) return visitLog;
      if (overlayText.includes('測驗已交卷') || overlayText.includes('不能再應考')) {
        throw new Error(`Attempt ended unexpectedly: ${overlayText}`);
      }
      if (currentHeader !== beforeHeader) break;
      await page.waitForTimeout(400);
    }
  }

  return visitLog;
}

async function main() {
  await ensureDir(outDir);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().at(-1);
  if (!page) throw new Error('No Chrome page found on debug session.');

  const beforeList = await api(page, `/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0`);
  const beforeEntry = beforeList.json?.data?.list?.find((item) => item.exam_id === examId);
  const beforeHistoryIds = new Set((beforeEntry?.history || []).map((item) => item.time_id));

  await startNewAttempt(page);
  const visitLog = await answerAllA(page);
  await page.waitForTimeout(2000);

  const afterList = await api(page, `/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0`);
  const afterEntry = afterList.json?.data?.list?.find((item) => item.exam_id === examId);
  const newHistory = (afterEntry?.history || []).find((item) => !beforeHistoryIds.has(item.time_id)) || null;

  let result = null;
  if (newHistory?.time_id) {
    result = await api(page, `/exam/api/v1/evaluation/examinee/practice/${examId}/${newHistory.time_id}/result`);
  }

  const output = {
    beforeList: beforeList.json ?? beforeList.text,
    afterList: afterList.json ?? afterList.text,
    newHistory,
    visitLog,
    result: result?.json ?? result?.text ?? null,
  };

  await fs.writeFile(path.join(outDir, 'ui-all-a.json'), JSON.stringify(output, null, 2), 'utf8');
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
