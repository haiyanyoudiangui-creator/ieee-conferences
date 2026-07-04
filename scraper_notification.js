/**
 * 爬取 S 级会议官网的录取通知时间 (反检测版)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');

function api(p) { return new Promise(r => {
  const req = http.get('http://localhost:3000'+p, res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>r(JSON.parse(b))); });
  req.on('error', ()=>r(null));
})}

// 防 Cloudflare 检测
const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN','zh','en'] });
  window.chrome = { runtime: {} };
`;

async function scrapeSite(page, conf) {
  let url = conf.conferenceUrl;
  if (!url) return null;
  if (!url.startsWith('http')) url = 'https://' + url;

  console.log(`  ${url.substring(0, 70)}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    const text = await page.evaluate(() => {
      // 优先找 Important Dates 区块
      const body = document.body?.innerText || '';
      return body;
    });

    const results = { eventId: conf.eventId, title: conf.eventTitle, url, dates: [], raw: '' };

    // 提取所有包含 notification/acceptance 的行及其周围的日期
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length < 5 || line.length > 300) continue;

      // 找关键词
      const kw = /notification|acceptance|录用|录取|审稿|notification.*accept/i;
      if (kw.test(line)) {
        results.dates.push(line);
        // 也取上下各 3 行
        const ctx = lines.slice(Math.max(0,i-3), Math.min(lines.length,i+4)).join(' | ');
        results.raw += ctx + '\n---\n';
      }
    }

    // 如果没找到，收集所有 Important Dates 区域
    if (results.dates.length === 0) {
      let inDates = false, dateLines = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (/important\s*dates?/i.test(trimmed)) { inDates = true; continue; }
        if (inDates && trimmed.length > 3) dateLines.push(trimmed);
        if (inDates && /^\s*$/.test(trimmed) && dateLines.length > 3) break;
      }
      if (dateLines.length > 0) {
        results.dates = dateLines;
        results.raw = dateLines.join('\n');
      }
    }

    return results;
  } catch (err) {
    return { eventId: conf.eventId, title: conf.eventTitle, url, error: err.message };
  }
}

async function main() {
  console.log('=== S 级会议录取通知爬虫 (反检测) ===\n');

  // 获取 S 级 7-10 月会议
  const all = await api('/api/conferences');
  const targets = all.conferences.filter(c => {
    if (c.tier !== 'S') return false;
    const m = (c.startDate || '').substring(5, 7);
    return ['07', '08', '09', '10'].includes(m);
  });
  console.log(`S 级 7-10月: ${targets.length} 个\n`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  await page.addInitScript(STEALTH_SCRIPT);

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const conf = targets[i];
    console.log(`[${i+1}/${targets.length}] ${conf.eventTitle.substring(0, 50)}`);
    if (!conf.conferenceUrl) { console.log('  无官网，跳过'); results.push({ eventId: conf.eventId, title: conf.eventTitle, note: '无官网' }); continue; }
    const r = await scrapeSite(page, conf);
    if (r) results.push(r);
    if (r?.dates?.length > 0) console.log(`  ✅ ${r.dates[0].substring(0, 80)}`);
    else if (r?.error) console.log(`  ❌ ${r.error}`);
    else console.log(`  ⚠️ 未找到通知日期`);
    await new Promise(rr => setTimeout(rr, 2000));
  }

  await browser.close();

  fs.writeFileSync('data/notification_s_tier.json', JSON.stringify(results, null, 2));
  const found = results.filter(r => r.dates && r.dates.length > 0).length;
  const tried = results.filter(r => r.url).length;
  console.log(`\n=== 完成: ${found}/${tried} 个找到通知日期 ===`);
  console.log('结果: data/notification_s_tier.json');
}

main().catch(err => { console.error('失败:', err.message); process.exit(1); });
