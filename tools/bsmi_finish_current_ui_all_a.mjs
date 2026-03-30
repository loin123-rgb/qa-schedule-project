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

async function main() {
  await ensureDir(outDir);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().at(-1);
  if (!page) throw new Error('No Chrome page found.');

  const beforeList = await api(page, `/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0`);
  const beforeEntry = beforeList.json?.data?.list?.find((item) => item.exam_id === examId);
  const openAttempt = [...(beforeEntry?.history || [])].reverse().find((item) => !item.answer_close_time);
  if (!openAttempt) throw new Error('No open attempt found.');

  const visitLog = [];

  for (let step = 0; step < 90; step += 1) {
    const header = await visibleText(page.locator('.question__header div').first());
    const match = header.match(/Q\s*(\d+)/i);
    const qNo = match ? Number(match[1]) : null;
    const actionText = await visibleText(page.locator('.question-card__action-group .btn--primary').first());
    visitLog.push({
      step,
      qNo,
      actionText,
      url: page.url(),
      question: await visibleText(page.locator('.question__title').first()),
    });

    if (qNo === null) break;

    const firstRadio = page.locator('mat-radio-button').first();
    if (await firstRadio.count()) {
      await firstRadio.click();
      await page.waitForTimeout(250);
    }

    const previousHeader = header;
    await page.locator('.question-card__action-group .btn--primary').first().click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('.cdk-overlay-pane');
    const dialogText = await visibleText(dialog);
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

    for (let retry = 0; retry < 10; retry += 1) {
      const currentHeader = await visibleText(page.locator('.question__header div').first());
      if (currentHeader && currentHeader !== previousHeader) break;
      await page.waitForTimeout(350);
    }
  }

  await page.waitForTimeout(2000);

  const afterList = await api(page, `/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0`);
  const afterEntry = afterList.json?.data?.list?.find((item) => item.exam_id === examId);
  const finished = [...(afterEntry?.history || [])].reverse().find((item) => item.time_id === openAttempt.time_id) || null;
  let result = null;
  if (finished?.answer_close_time) {
    result = await api(page, `/exam/api/v1/evaluation/examinee/practice/${examId}/${openAttempt.time_id}/result`);
  }

  const payload = {
    selectedHistory: finished,
    visitLog,
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
