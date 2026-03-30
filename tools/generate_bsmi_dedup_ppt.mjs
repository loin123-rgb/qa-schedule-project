import fs from 'node:fs/promises';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

const workspaceDir = process.cwd();
const inputPath = path.join(workspaceDir, 'artifacts', 'bsmi', 'all-histories.json');

function stripHtml(text = '') {
  return text
    .replace(/<sup>(.*?)<\/sup>/gi, '^$1')
    .replace(/<sub>(.*?)<\/sub>/gi, '_$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function choiceLetter(value) {
  const idx = Number(value) - 1;
  return idx >= 0 ? String.fromCharCode(65 + idx) : '?';
}

function optionText(option, index) {
  const text = stripHtml(option?.text || '');
  if (text) return text;
  if (option?.attachment?.filename) return `附圖選項（${option.attachment.filename}）`;
  return `選項 ${String.fromCharCode(65 + index)}`;
}

function normalizeQuestion(text) {
  return stripHtml(text).replace(/\s+/g, ' ').trim();
}

function classify(questionText) {
  const q = normalizeQuestion(questionText);
  const lawPatterns = /法|檢定|型式認證|度量衡|商品標示|包裝商品|許可|機關|實驗室|標準器|應經|合格|受託|指定實驗室/;
  const uncertaintyPatterns = /不確定度|量測方程式|標準差|擴充|矩形分配|三角形分配|常態分配|靈敏係數|追溯|校正|傳播定律|標準不確定度/;
  const statPatterns = /統計|抽樣|相關係數|平均|變異|迴歸|信賴|機率|樣本|母體|品管|品質循環|AQL/;

  if (uncertaintyPatterns.test(q)) return '量測不確定度';
  if (statPatterns.test(q)) return '統計學';
  if (lawPatterns.test(q)) return '法規';
  return '法規';
}

function buildExplanation(item) {
  const q = normalizeQuestion(item.text);
  const correctValue = item.correct_answer?.[0] || '';
  const correctLetter = choiceLetter(correctValue);
  const correctOption = item.options?.[Number(correctValue) - 1];
  const correctText = optionText(correctOption, Number(correctValue) - 1);

  if (item.type === 1) {
    return correctLetter === 'A'
      ? '題幹敘述符合相關定義、法規或量測原理，因此答案為「是」。'
      : '題幹敘述與相關定義、法規或量測原理不符，因此答案為「否」。';
  }
  if (/何者非|為非|不是|不包括|有誤/.test(q)) {
    return `題目要求找出不符合條件的選項；只有「${correctText}」不屬於題幹所述範圍，因此答案為 ${correctLetter}。`;
  }
  if (/組合|何者正確|最適合|最為正確|最恰當/.test(q)) {
    return `依題意逐一判斷後，最符合題幹要求的是「${correctText}」，因此答案為 ${correctLetter}。`;
  }
  return `本題重點在「${q.slice(0, 24)}」；符合題意或規定的選項是「${correctText}」，因此答案為 ${correctLetter}。`;
}

function addText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x, y, w, h,
    margin: 0.04,
    fontFace: 'Microsoft JhengHei',
    color: '1F2937',
    fit: 'shrink',
    valign: 'top',
    ...opts,
  });
}

async function main() {
  const outputArg = process.argv[2];
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const outputPath = outputArg || path.join(workspaceDir, 'artifacts', 'bsmi', `計量技術人員考試_去重解析_${stamp}.pptx`);

  const raw = await fs.readFile(inputPath, 'utf8');
  const data = JSON.parse(raw);

  const dedup = new Map();
  for (const entry of data.histories || []) {
    const timeId = entry.history.time_id;
    const score = entry.history.score;
    for (const quiz of entry.result.quiz || []) {
      const key = normalizeQuestion(quiz.text);
      if (!dedup.has(key)) {
        dedup.set(key, {
          ...quiz,
          sourceTimeId: timeId,
          sourceScore: score,
          category: classify(quiz.text),
        });
      }
    }
  }

  const items = [...dedup.values()].sort((a, b) => {
    const categoryOrder = ['統計學', '法規', '量測不確定度'];
    const ca = categoryOrder.indexOf(a.category);
    const cb = categoryOrder.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return normalizeQuestion(a.text).localeCompare(normalizeQuestion(b.text), 'zh-Hant');
  });

  const counts = items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'OpenAI Codex';
  pptx.company = 'OpenAI';
  pptx.subject = 'BSMI 計量技術人員考試去重解析';
  pptx.title = '計量技術人員考試_去重解析';
  pptx.lang = 'zh-TW';

  const cover = pptx.addSlide();
  cover.background = { color: 'F7FBFC' };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.8, fill: { color: '0EA5A8' }, line: { color: '0EA5A8' } });
  addText(cover, '乙級計量技術人員考試', 0.7, 1.0, 5.8, 0.45, { fontSize: 24, bold: true, color: '0F172A' });
  addText(cover, '多回合去重題庫解析', 0.7, 1.52, 5.8, 0.35, { fontSize: 16, bold: true, color: '0EA5A8' });
  addText(cover, `去重後題目數：${items.length} 題`, 0.8, 2.35, 3.5, 0.3, { fontSize: 18, bold: true });
  addText(cover, `統計學：${counts['統計學'] || 0} 題`, 0.8, 2.82, 3.5, 0.25, { fontSize: 12 });
  addText(cover, `法規：${counts['法規'] || 0} 題`, 0.8, 3.12, 3.5, 0.25, { fontSize: 12 });
  addText(cover, `量測不確定度：${counts['量測不確定度'] || 0} 題`, 0.8, 3.42, 3.8, 0.25, { fontSize: 12 });
  addText(cover, `來源回合數：${(data.histories || []).length} 回合`, 0.8, 3.72, 3.5, 0.25, { fontSize: 12 });
  addText(cover, '說明：本檔依各回合詳細作答情況彙整，依題幹去除重複題後輸出；正解以平台結果為準。', 0.8, 4.5, 9.6, 0.5, { fontSize: 12, color: '334155' });

  let currentCategory = '';
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.category !== currentCategory) {
      currentCategory = item.category;
      const section = pptx.addSlide();
      section.background = { color: 'FFFFFF' };
      section.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: currentCategory === '統計學' ? 'F0FDF4' : currentCategory === '法規' ? 'EFF6FF' : 'FFFBEB' }, line: { color: 'FFFFFF' } });
      addText(section, currentCategory, 0.8, 2.2, 4.5, 0.7, { fontSize: 30, bold: true, color: '0F172A' });
      addText(section, `本分類共 ${counts[currentCategory] || 0} 題`, 0.85, 3.05, 3.5, 0.3, { fontSize: 15, color: '475569' });
    }

    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.55, fill: { color: '0EA5A8' }, line: { color: '0EA5A8' } });
    addText(slide, `${item.category}｜第 ${i + 1} 題`, 0.45, 0.12, 4.2, 0.25, { fontSize: 20, bold: true, color: 'FFFFFF' });
    addText(slide, item.type === 1 ? '是非題' : '選擇題', 11.55, 0.14, 0.9, 0.22, { fontSize: 12, bold: true, color: 'E6FFFB', align: 'right' });

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.45, y: 0.78, w: 12.3, h: 1.1,
      rectRadius: 0.07,
      fill: { color: 'F8FAFC' },
      line: { color: 'CBD5E1', pt: 1 },
    });
    addText(slide, normalizeQuestion(item.text), 0.7, 0.98, 11.8, 0.72, { fontSize: 17, bold: true });

    const optionBaseY = 2.1;
    const optionGap = item.options.length <= 2 ? 0.88 : 0.72;
    item.options.forEach((option, idx) => {
      const value = String(idx + 1);
      const isCorrect = (item.correct_answer || []).includes(value);
      const y = optionBaseY + idx * optionGap;
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.72, y, w: 11.9, h: optionGap - 0.12,
        rectRadius: 0.05,
        fill: { color: isCorrect ? 'DCFCE7' : 'F8FAFC' },
        line: { color: isCorrect ? '22C55E' : 'CBD5E1', pt: 1.1 },
      });
      addText(slide, `${choiceLetter(value)}. ${optionText(option, idx)}`, 0.95, y + 0.09, 10.9, optionGap - 0.22, {
        fontSize: 14.5,
        bold: isCorrect,
      });
      if (isCorrect) {
        addText(slide, '正解', 11.65, y + 0.09, 0.55, 0.2, { fontSize: 10.5, bold: true, color: '15803D', align: 'center' });
      }
    });

    const boxY = item.options.length <= 2 ? 4.15 : 5.12;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.72, y: boxY, w: 11.95, h: 1.52,
      rectRadius: 0.05,
      fill: { color: 'EFF6FF' },
      line: { color: '93C5FD', pt: 1 },
    });
    addText(slide, `正確答案：${choiceLetter(item.correct_answer?.[0] || '')}　｜　來源回合：${item.sourceTimeId}`, 0.95, boxY + 0.14, 10.8, 0.22, { fontSize: 12.5, bold: true, color: '1D4ED8' });
    addText(slide, `解析：${buildExplanation(item)}`, 0.95, boxY + 0.46, 10.9, 0.72, { fontSize: 13.5, color: '1E293B' });
  }

  await pptx.writeFile({ fileName: outputPath });
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
