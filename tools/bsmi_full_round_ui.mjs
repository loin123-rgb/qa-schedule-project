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

async function textOf(locator) {
  if (await locator.count() === 0) return '';
  return ((await locator.first().textContent()) || '').replace(/\s+/g, ' ').trim();
}

async function openFreshAttempt(page) {
  await page.goto('https://metrology.bsmi.gov.tw/exam/web/#/exam/list', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(2500);

  const before = await api(page, `/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0`);
  const beforeEntry = before.json?.data?.list?.find((item) => item.exam_id === examId);
  const beforeIds = new Set((beforeEntry?.history || []).map((item) => item.time_id));

  const buttons = page.locator('button.btn.btn--secondary.btn--xs');
  await buttons.nth(2).click();
  await page.waitForTimeout(2500);
  await page.locator('button.btn.btn--md.btn--primary').click();
  await page.waitForTimeout(3000);

  const after = await api(page, `/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0`);
  const afterEntry = after.json?.data?.list?.find((item) => item.exam_id === examId);
  const openAttempt = [...(afterEntry?.history || [])].reverse().find(
    (item) => !beforeIds.has(item.time_id) || !item.answer_close_time,
  );

  if (!openAttempt) {
    throw new Error('Could not identify the fresh attempt.');
  }

  return openAttempt;
}

async function answerAllA(page) {
  const visitLog = [];

  for (let step = 0; step < 90; step += 1) {
    const header = await textOf(page.locator('.question__header div').first());
    const match = header.match(/Q\s*(\d+)/i);
    const qNo = match ? Number(match[1]) : null;
    if (!qNo) break;

    const actionText = await textOf(page.locator('.question-card__action-group .btn--primary').first());
    visitLog.push({
      step,
      qNo,
      actionText,
      question: await textOf(page.locator('.question__title').first()),
      url: page.url(),
    });

    const firstRadio = page.locator('mat-radio-button').first();
    if (await firstRadio.count()) {
      await firstRadio.click();
      await page.waitForTimeout(250);
    }

    const previousHeader = header;
    await page.locator('.question-card__action-group .btn--primary').first().click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('.cdk-overlay-pane');
    const dialogText = await textOf(dialog);
    if (dialogText) {
      const confirm = dialog.locator('.btn--primary, button').last();
      if (await confirm.count()) {
        await confirm.click();
        await page.waitForTimeout(1500);
      }
    }

    if (!page.url().includes('/exam/question')) {
      break;
    }

    for (let retry = 0; retry < 12; retry += 1) {
      const currentHeader = await textOf(page.locator('.question__header div').first());
      if (currentHeader && currentHeader !== previousHeader) break;
      await page.waitForTimeout(300);
    }
  }

  return visitLog;
}

async function openDetailView(page) {
  await page.waitForTimeout(2500);
  const resultButtons = page.locator('button.btn');
  const count = await resultButtons.count();
  for (let i = 0; i < count; i += 1) {
    const text = await textOf(resultButtons.nth(i));
    if (text.includes('詳細作答情況')) {
      await resultButtons.nth(i).click();
      await page.waitForTimeout(3000);
      return true;
    }
  }

  if (count >= 2) {
    await resultButtons.nth(count - 1).click();
    await page.waitForTimeout(3000);
    return true;
  }

  return false;
}

async function main() {
  await ensureDir(outDir);

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().at(-1);
  if (!page) throw new Error('No Chrome page found.');

  const attempt = await openFreshAttempt(page);
  const visitLog = await answerAllA(page);

  const afterList = await api(page, `/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0`);
  const afterEntry = afterList.json?.data?.list?.find((item) => item.exam_id === examId);
  const finished = [...(afterEntry?.history || [])].reverse().find((item) => item.time_id === attempt.time_id) || null;

  let result = null;
  if (finished?.answer_close_time) {
    result = await api(page, `/exam/api/v1/evaluation/examinee/practice/${examId}/${attempt.time_id}/result`);
  }

  const openedDetail = await openDetailView(page);
  const detailText = await textOf(page.locator('body'));
  await page.screenshot({ path: path.join(outDir, 'latest-detail-page.png'), fullPage: true });

  const payload = {
    selectedHistory: finished,
    visitLog,
    openedDetail,
    detailUrl: page.url(),
    detailText,
    result: result?.json ?? result?.text ?? null,
  };

  await fs.writeFile(path.join(outDir, 'latest-result.json'), JSON.stringify(payload, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'run-all-a.json'), JSON.stringify(payload, null, 2), 'utf8');
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
