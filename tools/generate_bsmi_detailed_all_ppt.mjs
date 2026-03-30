import fs from 'node:fs/promises';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

const workspaceDir = process.cwd();
const inputPath = path.join(workspaceDir, 'artifacts', 'bsmi', 'all-histories.json');
const manifestPath = path.join(workspaceDir, 'artifacts', 'bsmi', 'attachments-manifest.json');
const attachmentDir = path.join(workspaceDir, 'artifacts', 'bsmi', 'attachments');

function stripHtml(text = '') {
  return text
    .replace(/<sup>(.*?)<\/sup>/gi, '^$1')
    .replace(/<sub>(.*?)<\/sub>/gi, '_$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuestion(text) {
  return stripHtml(text).replace(/\s+/g, ' ').trim();
}

function choiceLetter(value) {
  const idx = Number(value) - 1;
  return Number.isFinite(idx) && idx >= 0 ? String.fromCharCode(65 + idx) : '?';
}

function optionText(option, index) {
  const text = stripHtml(option?.text || '');
  if (text) return text;
  if (option?.attachment?.filename) return `附圖選項（${option.attachment.filename}）`;
  return `選項 ${String.fromCharCode(65 + index)}`;
}

function questionHasImages(item) {
  return (item.attachment || []).length > 0 || (item.options || []).some((o) => o.attachment?.url);
}

function classify(questionText) {
  const q = normalizeQuestion(questionText);
  if (/不確定度|傳播定律|標準不確定度|擴充不確定度|靈敏係數|矩形分配|三角形分配|常態分配|追溯性|校正鏈|量測方程式|解析度/.test(q)) {
    return '量測不確定度';
  }
  if (/平均|標準差|自由度|變異|相關係數|樣本|母體|抽樣|迴歸|機率|信賴|統計|AQL|品質循環|管制圖/.test(q)) {
    return '統計學';
  }
  return '法規';
}

function classifyLawSource(questionText) {
  const q = normalizeQuestion(questionText);
  if (/ISO\/IEC 17025/.test(q)) return 'ISO/IEC 17025:2017';
  if (/JCGM|GUM/.test(q)) return 'JCGM 100:2008（GUM）';
  if (/商品標示/.test(q)) return '商品標示法';
  if (/定量包裝/.test(q)) return '定量包裝商品管理相關規定';
  if (/型式認證/.test(q)) return '度量衡器型式認證管理相關規定';
  if (/檢定|檢查|法定度量衡器|度量衡單位|標準器|指定實驗室|受託/.test(q)) return '度量衡法及相關子法';
  return '度量衡法、ISO/IEC 17025 或計量技術通則';
}

function summarizeConcept(questionText) {
  const q = normalizeQuestion(questionText);
  if (/自由度/.test(q)) return '自由度通常取樣本數 n 減 1。';
  if (/平均/.test(q)) return '平均數等於全部觀測值總和除以觀測次數。';
  if (/矩形分配/.test(q)) return '矩形分配表示區間內各值出現機率相等。';
  if (/三角形分配/.test(q)) return '三角形分配表示中心附近機率較高，兩端較低。';
  if (/ISO\/IEC 17025/.test(q)) return '題目重點通常落在人員、設備、追溯性、紀錄與報告等要求。';
  if (/度量衡法/.test(q) || /法定度量衡/.test(q)) return '題目核心通常是法定單位、檢定檢查、型式認證或法定管理義務。';
  return '作答時先辨識題目所屬主題，再對照定義、公式或法規條文。';
}

function buildCalculationDetail(item) {
  const q = normalizeQuestion(item.text);
  const numbers = [...q.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const lines = [];

  if (/平均/.test(q) && numbers.length >= 4) {
    const values = numbers;
    const sum = values.reduce((acc, value) => acc + value, 0);
    const mean = sum / values.length;
    lines.push(`1. 先把題目中的觀測值相加：${values.join(' + ')} = ${sum.toFixed(5).replace(/0+$/, '').replace(/\.$/, '')}`);
    lines.push(`2. 平均數 x̄ = 總和 / 筆數 = ${sum.toFixed(5).replace(/0+$/, '').replace(/\.$/, '')} / ${values.length} = ${mean.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`);
    lines.push(`3. 若題目或選項以小數點後兩位表示，則可寫成 ${mean.toFixed(2)}。`);
  }

  if (/自由度/.test(q) && numbers.length >= 1) {
    const n = numbers.length;
    lines.push(`4. 這裡共有 n = ${n} 筆觀測值，因此樣本自由度 ν = n - 1 = ${n - 1}。`);
  }

  if (/相關係數為1/.test(q)) {
    lines.push('1. 相關係數 r = 1 代表線性關係達到完全正相關。');
    lines.push('2. 若 r = -1 才是完全負相關；r 接近 0 則代表線性相關性弱。');
  }

  if (/解析度/.test(q) && /矩形分配/.test(q)) {
    lines.push('1. 解析度造成的誤差常以半刻度或半解析度作為區間半寬 a。');
    lines.push('2. 若題目指定為矩形分配，標準不確定度通常用 u = a / √3。');
    lines.push('3. 依選項再判斷 a 取值是半刻度還是半解析度。');
  }

  if (/三角形分配/.test(q)) {
    lines.push('1. 三角形分配適用於量值集中在中心、越靠近邊界機率越低的情況。');
    lines.push('2. 若已知區間半寬為 a，三角形分配的標準不確定度常寫成 u = a / √6。');
  }

  if (/矩形分配/.test(q) && !/解析度/.test(q)) {
    lines.push('1. 題意若表示區間內任何值出現機率相同，屬於矩形分配。');
    lines.push('2. 區間半寬為 a 時，矩形分配的標準不確定度常寫成 u = a / √3。');
  }

  return lines;
}

function buildSourceDetail(item) {
  const q = normalizeQuestion(item.text);
  const source = classifyLawSource(q);
  const details = [];

  if (/ISO\/IEC 17025/.test(q)) {
    if (/設備|儀器/.test(q)) details.push('出處方向：ISO/IEC 17025:2017 第 6.4 節「設備」。');
    else if (/追溯/.test(q)) details.push('出處方向：ISO/IEC 17025:2017 第 6.5 節「量測追溯性」。');
    else if (/紀錄/.test(q)) details.push('出處方向：ISO/IEC 17025:2017 第 7.5 節「技術紀錄」或第 8.4 節「紀錄管制」。');
    else if (/報告|校正證書|結果/.test(q)) details.push('出處方向：ISO/IEC 17025:2017 第 7.8 節「結果報告」。');
    else details.push('出處方向：ISO/IEC 17025:2017 相關要求條文。');
  } else if (/不確定度|矩形分配|三角形分配|傳播定律|靈敏係數/.test(q)) {
    details.push('出處方向：JCGM 100:2008（GUM）與量測不確定度評估通則。');
  } else if (/商品標示/.test(q)) {
    details.push('出處方向：商品標示法有關淨重、容量、度量標示之規定。');
  } else if (/定量包裝/.test(q)) {
    details.push('出處方向：定量包裝商品管理及抽測相關規定。');
  } else if (/型式認證/.test(q)) {
    details.push('出處方向：度量衡法及法定度量衡器型式認證管理規範。');
  } else if (/檢定|檢查|度量衡器|法定度量衡/.test(q)) {
    details.push('出處方向：度量衡法、施行細則及法定度量衡器管理規定。');
  }

  return { source, details };
}

function buildDetailedExplanation(item) {
  const q = normalizeQuestion(item.text);
  const correctValue = item.correct_answer?.[0] || '';
  const correctLetter = choiceLetter(correctValue);
  const correctOption = item.options?.[Number(correctValue) - 1];
  const correctText = optionText(correctOption, Number(correctValue) - 1);
  const sourceInfo = buildSourceDetail(item);
  const calcLines = buildCalculationDetail(item);
  const lines = [];

  lines.push(`正確答案：${correctLetter}（${correctText}）`);

  if (calcLines.length > 0) {
    lines.push('解題步驟：');
    lines.push(...calcLines);
  } else if (item.type === 1) {
    if (correctLetter === 'A') {
      lines.push('解題步驟：題幹敘述與相關定義、法規或量測原理一致，因此判定為「是」。');
    } else {
      lines.push('解題步驟：題幹敘述與相關定義、法規或量測原理不一致，因此判定為「否」。');
    }
  } else if (/何者非|為非|不是|不包括|有誤/.test(q)) {
    lines.push(`解題步驟：題目要求找出不符合條件的選項；只有「${correctText}」不屬於題幹要求，因此選 ${correctLetter}。`);
  } else {
    lines.push(`解題步驟：先辨識本題主題，再逐一比較選項；最符合題意或規定的是「${correctText}」，因此答案為 ${correctLetter}。`);
  }

  lines.push(`關鍵觀念：${summarizeConcept(q)}`);
  lines.push(`參考出處：${sourceInfo.source}`);
  for (const detail of sourceInfo.details) {
    lines.push(detail);
  }

  return lines;
}

function addText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x,
    y,
    w,
    h,
    margin: 0.04,
    fontFace: 'Microsoft JhengHei',
    color: '1F2937',
    fit: 'shrink',
    valign: 'top',
    breakLine: false,
    ...opts,
  });
}

async function main() {
  const outputArg = process.argv[2];
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const outputPath = outputArg || path.join(workspaceDir, 'artifacts', 'bsmi', `計量技術人員考試_完整詳解_${stamp}.pptx`);

  const raw = await fs.readFile(inputPath, 'utf8');
  const data = JSON.parse(raw);
  let manifest = {};
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    manifest = {};
  }
  const attachmentFiles = new Map();
  try {
    const files = await fs.readdir(attachmentDir);
    for (const file of files) {
      attachmentFiles.set(file.toLowerCase(), path.join(attachmentDir, file));
    }
  } catch {}

  function resolveAttachmentPath(attachment) {
    if (!attachment) return null;
    if (attachment.filename) {
      const byName = attachmentFiles.get(attachment.filename.toLowerCase());
      if (byName) return byName;
    }
    if (attachment.url && manifest[attachment.url]) {
      return manifest[attachment.url];
    }
    if (attachment.url) {
      const basename = path.basename((attachment.url.startsWith('http') ? attachment.url : `https://metrology.bsmi.gov.tw${attachment.url}`).split('?')[0]).toLowerCase();
      const byBase = attachmentFiles.get(basename);
      if (byBase) return byBase;
    }
    return null;
  }

  const dedup = new Map();
  for (const entry of data.histories || []) {
    const timeId = entry.history.time_id;
    for (const quiz of entry.result.quiz || []) {
      const key = normalizeQuestion(quiz.text);
      if (!dedup.has(key)) {
        dedup.set(key, {
          ...quiz,
          sourceTimeId: timeId,
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
  pptx.subject = 'BSMI 計量技術人員考試完整詳解';
  pptx.title = '計量技術人員考試_完整詳解';
  pptx.lang = 'zh-TW';

  const cover = pptx.addSlide();
  cover.background = { color: 'F7FBFC' };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.8, fill: { color: '0EA5A8' }, line: { color: '0EA5A8' } });
  addText(cover, '乙級計量技術人員考試', 0.7, 1.0, 5.8, 0.45, { fontSize: 24, bold: true, color: '0F172A' });
  addText(cover, '全部回合整合詳解版', 0.7, 1.52, 5.8, 0.35, { fontSize: 16, bold: true, color: '0EA5A8' });
  addText(cover, `去重後題目數：${items.length} 題`, 0.8, 2.3, 4.2, 0.35, { fontSize: 18, bold: true });
  addText(cover, `統計學：${counts['統計學'] || 0} 題`, 0.8, 2.82, 3.8, 0.25, { fontSize: 12 });
  addText(cover, `法規：${counts['法規'] || 0} 題`, 0.8, 3.12, 3.8, 0.25, { fontSize: 12 });
  addText(cover, `量測不確定度：${counts['量測不確定度'] || 0} 題`, 0.8, 3.42, 4.2, 0.25, { fontSize: 12 });
  addText(cover, `來源回合數：${(data.histories || []).length} 回合`, 0.8, 3.72, 3.8, 0.25, { fontSize: 12 });
  addText(cover, '說明：本檔以所有已完成回合為來源，依題幹去重後重建為詳解版。計算題盡量列出計算步驟；法規題與標準題列出可對照的出處方向。', 0.8, 4.45, 10.0, 0.6, { fontSize: 12, color: '334155' });

  let currentCategory = '';
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.category !== currentCategory) {
      currentCategory = item.category;
      const section = pptx.addSlide();
      const fill = currentCategory === '統計學' ? 'F0FDF4' : currentCategory === '法規' ? 'EFF6FF' : 'FFFBEB';
      section.background = { color: 'FFFFFF' };
      section.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: fill }, line: { color: fill } });
      addText(section, currentCategory, 0.9, 2.15, 4.8, 0.7, { fontSize: 30, bold: true, color: '0F172A' });
      addText(section, `本分類共 ${counts[currentCategory] || 0} 題`, 0.95, 3.0, 4.0, 0.3, { fontSize: 15, color: '475569' });
    }

    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.55, fill: { color: '0EA5A8' }, line: { color: '0EA5A8' } });
    addText(slide, `${item.category}｜第 ${i + 1} 題`, 0.45, 0.12, 4.3, 0.25, { fontSize: 20, bold: true, color: 'FFFFFF' });
    addText(slide, item.type === 1 ? '是非題' : '選擇題', 11.45, 0.14, 1.0, 0.22, { fontSize: 12, bold: true, color: 'E6FFFB', align: 'right' });

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.45, y: 0.78, w: 12.35, h: 1.18,
      rectRadius: 0.06,
      fill: { color: 'F8FAFC' },
      line: { color: 'CBD5E1', pt: 1 },
    });
    addText(slide, normalizeQuestion(item.text), 0.7, 0.98, 11.9, 0.78, { fontSize: 17, bold: true });

    if ((item.attachment || []).length > 0) {
      let qImgX = 8.7;
      const qImgY = 1.02;
      for (const qAttachment of item.attachment.slice(0, 2)) {
        const qPath = resolveAttachmentPath(qAttachment);
        if (!qPath) continue;
        try {
          slide.addImage({
            path: qPath,
            x: qImgX,
            y: qImgY,
            w: 1.8,
            h: 0.7,
            sizing: { type: 'contain', x: qImgX, y: qImgY, w: 1.8, h: 0.7 },
          });
          qImgX += 1.9;
        } catch {}
      }
    }

    const hasImages = questionHasImages(item);
    const optionBaseY = 2.12;
    const optionGap = hasImages ? 1.22 : item.options.length <= 2 ? 0.86 : 0.68;
    item.options.forEach((option, idx) => {
      const value = String(idx + 1);
      const isCorrect = (item.correct_answer || []).includes(value);
      const y = optionBaseY + idx * optionGap;
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.72, y, w: 11.95, h: optionGap - 0.1,
        rectRadius: 0.05,
        fill: { color: isCorrect ? 'DCFCE7' : 'F8FAFC' },
        line: { color: isCorrect ? '22C55E' : 'CBD5E1', pt: 1.1 },
      });
      addText(slide, `${choiceLetter(value)}. ${optionText(option, idx)}`, 0.95, y + 0.08, 10.9, optionGap - 0.2, {
        fontSize: 14,
        bold: isCorrect,
      });
      const optionImagePath = resolveAttachmentPath(option.attachment);
      if (optionImagePath) {
        try {
          slide.addImage({
            path: optionImagePath,
            x: 1.25,
            y: y + 0.34,
            w: 3.2,
            h: 0.68,
            sizing: { type: 'contain', x: 1.25, y: y + 0.34, w: 3.2, h: 0.68 },
          });
        } catch {}
      }
      if (isCorrect) {
        addText(slide, '正解', 11.7, y + 0.08, 0.5, 0.2, { fontSize: 10.5, bold: true, color: '15803D', align: 'center' });
      }
    });

    const detailLines = buildDetailedExplanation(item);
    const boxY = hasImages ? Math.min(6.2, optionBaseY + item.options.length * optionGap + 0.15) : item.options.length <= 2 ? 4.12 : 4.95;
    const boxH = hasImages ? 1.15 : 2.0;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.72, y: boxY, w: 11.95, h: boxH,
      rectRadius: 0.05,
      fill: { color: 'EFF6FF' },
      line: { color: '93C5FD', pt: 1 },
    });
    addText(slide, `來源回合：${item.sourceTimeId}`, 0.95, boxY + 0.12, 2.2, 0.2, { fontSize: 11.5, bold: true, color: '1D4ED8' });
    addText(slide, detailLines.join('\n'), 0.95, boxY + 0.35, 10.95, boxH - 0.45, { fontSize: hasImages ? 10.2 : 12.2, color: '1E293B', breakLine: true, fit: 'shrink' });
  }

  await pptx.writeFile({ fileName: outputPath });
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
