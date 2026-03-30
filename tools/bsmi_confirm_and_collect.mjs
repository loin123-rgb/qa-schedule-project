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

async function main() {
  await ensureDir(outDir);

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().at(-1);
  if (!page) throw new Error('No Chrome page found.');

  const dialogPrimary = page.locator('.cdk-overlay-pane .btn--primary, .cdk-overlay-pane button').first();
  if (await dialogPrimary.count()) {
    await dialogPrimary.click();
    await page.waitForTimeout(2500);
  }

  const completeText = await page.locator('body').textContent();

  const afterList = await api(page, `/exam/api/v1/evaluation/examinee/practice?offset=0&size=15&year=115&level=0`);
  const afterEntry = afterList.json?.data?.list?.find((item) => item.exam_id === examId);
  const history = afterEntry?.history || [];
  const latestClosed = [...history].reverse().find((item) => item.answer_close_time) || null;

  let result = null;
  if (latestClosed?.time_id) {
    result = await api(page, `/exam/api/v1/evaluation/examinee/practice/${examId}/${latestClosed.time_id}/result`);
  }

  const payload = {
    selectedHistory: latestClosed,
    afterList: afterList.json ?? afterList.text,
    result: result?.json ?? result?.text ?? null,
    pageText: completeText,
  };

  await fs.writeFile(path.join(outDir, 'run-all-a.json'), JSON.stringify(payload, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'latest-result.json'), JSON.stringify(payload, null, 2), 'utf8');
  await page.screenshot({ path: path.join(outDir, 'latest-page.png'), fullPage: true });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
