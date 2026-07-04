/**
 * IEEE 会议 Demo 服务器 v2
 * 启动: node demo/server.js
 * 访问: http://localhost:3000
 * 新增: 含金量评级、主办方筛选
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

// ============ 含金量评级体系 ============

// IEEE 旗舰学会 (S级核心标识)
const TOP_IEEE_SOCIETIES = [
  'IEEE Computer Society',
  'IEEE Communications Society',
  'IEEE Signal Processing Society',
  'IEEE Robotics and Automation Society',
  'IEEE Power & Energy Society',
  'IEEE Power Electronics Society',
  'IEEE Circuits and Systems Society',
  'IEEE Control Systems Society',
  'IEEE Information Theory Society',
  'IEEE Aerospace and Electronic Systems Society',
  'IEEE Antennas and Propagation Society',
];

// IEEE 知名学会 (A级核心标识)
const KNOWN_IEEE_SOCIETIES = [
  ...TOP_IEEE_SOCIETIES,
  'IEEE Electron Devices Society',
  'IEEE Photonics Society',
  'IEEE Vehicular Technology Society',
  'IEEE Industrial Electronics Society',
  'IEEE Industry Applications Society',
  'IEEE Instrumentation and Measurement Society',
  'IEEE Intelligent Transportation Systems Society',
  'IEEE Systems, Man, and Cybernetics Society',
  'IEEE Computational Intelligence Society',
  'IEEE Electromagnetic Compatibility Society',
  'IEEE Geoscience and Remote Sensing Society',
  'IEEE Electronics Packaging Society',
  'IEEE Reliability Society',
  'IEEE Education Society',
];

// IEEE 理事会/社区 (B级)
const IEEE_COUNCILS = [
  'IEEE Nanotechnology Council',
  'IEEE Systems Council',
  'IEEE Smart Cities Community',
  'IEEE Council on Electronic Design Automation',
  'IEEE Council on RFID',
];

// 中国顶尖大学 (A/B级加分)
const TOP_UNIVERSITIES = [
  'Tsinghua University',
  'Peking University',
  'Zhejiang University',
  'Shanghai Jiao Tong University',
  'Shanghai Jiaotong University',
  'Shanghai Jiao-Tong University',
  'Fudan University',
  'University of Science and Technology of China',
  'Nanjing University',
  "Xi'an Jiaotong University",
  'Xi an Jiaotong University',
  'Harbin Institute of Technology',
  'Huazhong University of Science & Technology',
  'Wuhan University',
  'Sun Yat-sen University',
  'Tongji University',
  'Southeast University',
  'Beihang University',
  'Beijing Institute of Technology',
  'South China University of Technology',
  'University of Electronic Science and Technology of China',
  'University of Electronic Science Technology of China',
  'University of Electronic Science and Technology of China (UESTC)',
  'University of Science & Technology of China - USTC',
  'University of Science and Technology of China (USTC)',
  'Tianjin University',
  'Nankai University',
  'Xidian University',
  'Renmin University of China',
];

// 知名大学 (B级加分)
const KNOWN_UNIVERSITIES = [
  ...TOP_UNIVERSITIES,
  'Dalian University of Technology',
  'Northwestern Polytechnical University',
  'Beijing University of Posts and Telecommunications',
  'Central South University',
  'Hunan University',
  'Jilin University',
  'Shandong University',
  'Sichuan University',
  'Chongqing University',
  'Xiamen University',
  'Northeastern University, China',
  'Southwest Jiaotong University',
  'University of Science and Technology Beijing',
  'Beijing Jiaotong University',
  'Zhengzhou University',
  'Hohai University',
  'East China Normal University',
  'Ocean University of China',
  'Soochow University',
  'Southern University of Science and Technology',
  'Westlake University',
  'City University of Hong Kong',
  'University of Macau',
  'Hong Kong Section',
];

/**
 * 判断会议含金量等级
 * 返回 { tier: 'S'|'A'|'B'|'C', reason: string }
 */
function evaluateTier(conf) {
  const sponsors = (conf.sponsors || '').split(';').map(s => s.trim()).filter(Boolean);
  const title = conf.eventTitle || '';

  // 检查是否有编号届数（含金量高的会议通常有多届历史）
  const hasEdition = /\b(\d{1,3})(st|nd|rd|th)\b/i.test(title);
  const editionNum = hasEdition ? parseInt(title.match(/\b(\d{1,3})(st|nd|rd|th)\b/i)?.[1] || '0') : 0;

  // 检查顶级 IEEE 学会
  const hasTopSociety = sponsors.some(s => TOP_IEEE_SOCIETIES.includes(s));
  const hasKnownSociety = sponsors.some(s => KNOWN_IEEE_SOCIETIES.includes(s));
  const hasCouncil = sponsors.some(s => IEEE_COUNCILS.includes(s));

  // 检查是否是 IEEE Section/Chapter
  const hasSection = sponsors.some(s => /\b(IEEE\s+)?\w+\s+Section\b/.test(s) || /\bSection\b/.test(s));
  const hasChapter = sponsors.some(s => /\bChapter\b/.test(s));

  // 检查大学
  const hasTopUni = sponsors.some(s => TOP_UNIVERSITIES.includes(s));
  const hasKnownUni = sponsors.some(s => KNOWN_UNIVERSITIES.includes(s));

  // 检查非学术主办方（可能是水会）
  const hasNonAcademic = sponsors.some(s =>
    /\b(Association|Society|Council|Federation|Foundation|Institute|Academy)\b/i.test(s) &&
    !s.startsWith('IEEE') && !s.includes('Chinese') && !s.includes('China')
  );

  const societyCount = sponsors.filter(s => KNOWN_IEEE_SOCIETIES.includes(s)).length;

  // ---- 评级逻辑 ----
  // S级: 顶级IEEE学会 + 多届历史 (>=5届)
  if (hasTopSociety && editionNum >= 5) {
    return { tier: 'S', reason: 'IEEE旗舰学会主办，多届国际会议' };
  }
  if (societyCount >= 3) {
    return { tier: 'S', reason: '多个IEEE学会联合主办' };
  }

  // A级: IEEE知名学会主办 或 顶尖大学+IEEE学会
  if (hasKnownSociety && editionNum >= 3) {
    return { tier: 'A', reason: 'IEEE知名学会主办，有一定历史' };
  }
  if (hasKnownSociety && hasTopUni) {
    return { tier: 'A', reason: 'IEEE学会+顶尖大学合办' };
  }
  if (hasKnownSociety) {
    return { tier: 'A', reason: 'IEEE知名学会主办' };
  }
  if (hasCouncil && editionNum >= 5) {
    return { tier: 'A', reason: 'IEEE理事会主办，多届会议' };
  }

  // B级: IEEE Section/Chapter 或 知名大学+IEEE
  if (hasSection || hasChapter) {
    return { tier: 'B', reason: 'IEEE区域分会/Chapter主办' };
  }
  if (hasCouncil) {
    return { tier: 'B', reason: 'IEEE理事会/社区主办' };
  }
  if (hasKnownUni) {
    return { tier: 'B', reason: '知名大学主办' };
  }
  if (sponsors.some(s => s.startsWith('IEEE'))) {
    return { tier: 'B', reason: 'IEEE相关机构主办' };
  }

  // C级: 其他
  return { tier: 'C', reason: '地方机构或非IEEE主要主办方' };
}

/**
 * 提取会议主办方分类
 */
function classifySponsors(sponsorsStr) {
  if (!sponsorsStr) return { ieeeSocieties: [], ieeeSections: [], universities: [], others: [] };
  const list = sponsorsStr.split(';').map(s => s.trim()).filter(Boolean);
  return {
    ieeeSocieties: list.filter(s => KNOWN_IEEE_SOCIETIES.includes(s) || IEEE_COUNCILS.includes(s)),
    ieeeSections: list.filter(s => /\bSection\b|\bChapter\b/.test(s)),
    universities: list.filter(s => KNOWN_UNIVERSITIES.includes(s)),
    others: list.filter(s => {
      if (KNOWN_IEEE_SOCIETIES.includes(s) || IEEE_COUNCILS.includes(s)) return false;
      if (/\bSection\b|\bChapter\b/.test(s)) return false;
      if (KNOWN_UNIVERSITIES.includes(s)) return false;
      return true;
    }),
  };
}

// ============ 加载数据 ============
const FULL_PATH = path.join(__dirname, 'data', 'ieee_conferences_full.json');
const JSON_PATH = path.join(__dirname, 'data', 'ieee_conferences.json');
const DATA_PATH = fs.existsSync(FULL_PATH) ? FULL_PATH : JSON_PATH;

function loadData() {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  const data = JSON.parse(raw);
  // 给每条数据附加评级
  return (data.conferences || []).map(c => {
    const { tier, reason } = evaluateTier(c);
    const sponsors = classifySponsors(c.sponsors);
    return { ...c, tier, tierReason: reason, sponsorsClassified: sponsors };
  });
}

// ============ API 路由 ============
const server = http.createServer((req, res) => {
  let filePath;

  if (req.url === '/') {
    filePath = path.join(__dirname, 'demo/index.html');
  } else if (req.url.startsWith('/api/conferences')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const search = url.searchParams.get('search') || '';
    const city = url.searchParams.get('city') || '';
    const format = url.searchParams.get('format') || '';
    const year = url.searchParams.get('year') || '';
    const tier = url.searchParams.get('tier') || '';
    const sponsor = url.searchParams.get('sponsor') || '';
    const month = url.searchParams.get('month') || '';

    let results = loadData();

    if (search) {
      const s = search.toLowerCase();
      results = results.filter(c =>
        c.eventTitle.toLowerCase().includes(s) ||
        (c.sponsors || '').toLowerCase().includes(s) ||
        (c.about || '').toLowerCase().includes(s)
      );
    }
    if (city) {
      results = results.filter(c => (c.location?.city || '') === city);
    }
    if (format) {
      results = results.filter(c => c.eventFormat === format);
    }
    if (year) {
      results = results.filter(c => (c.startDate || '').startsWith(year));
    }
    if (month) {
      results = results.filter(c => {
        const m = (c.startDate || '').substring(5, 7);
        return m === month;
      });
    }
    if (tier) {
      results = results.filter(c => c.tier === tier);
    }
    if (sponsor) {
      results = results.filter(c => (c.sponsors || '').includes(sponsor));
    }

    // 排序: 先按等级，再按日期
    const tierOrder = { S: 0, A: 1, B: 2, C: 3 };
    results.sort((a, b) => {
      const tDiff = (tierOrder[a.tier] || 4) - (tierOrder[b.tier] || 4);
      if (tDiff !== 0) return tDiff;
      return (a.startDate || '').localeCompare(b.startDate || '');
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ total: results.length, conferences: results }));
    return;
  } else if (req.url.startsWith('/api/filters')) {
    const confs = loadData();

    const cities = [...new Set(confs.map(c => c.location?.city || '').filter(Boolean))].sort();
    const years = [...new Set(confs.map(c => (c.startDate || '').substring(0, 4)).filter(Boolean))].sort();
    const months = [...new Set(confs.map(c => (c.startDate || '').substring(5, 7)).filter(Boolean))].sort();
    const formats = [...new Set(confs.map(c => c.eventFormat).filter(Boolean))];

    // 提取所有 IEEE 学会主办方
    const ieeeSocSet = new Set();
    const allSponsorsSet = new Set();
    confs.forEach(c => {
      if (c.sponsorsClassified) {
        c.sponsorsClassified.ieeeSocieties.forEach(s => ieeeSocSet.add(s));
      }
      if (c.sponsors) {
        c.sponsors.split(';').forEach(s => allSponsorsSet.add(s.trim()));
      }
    });
    const ieeeSocieties = [...ieeeSocSet].sort();
    const allSponsors = [...allSponsorsSet].sort();

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ cities, years, months, formats, ieeeSocieties, allSponsors }));
    return;
  } else if (req.url.startsWith('/api/stats')) {
    const confs = loadData();

    const stats = {
      total: confs.length,
      byFormat: {},
      byYear: {},
      byTier: {},
      topCities: [],
    };

    confs.forEach(c => {
      const f = c.eventFormat || 'unknown';
      stats.byFormat[f] = (stats.byFormat[f] || 0) + 1;
      const y = (c.startDate || '').substring(0, 4) || 'unknown';
      stats.byYear[y] = (stats.byYear[y] || 0) + 1;
      stats.byTier[c.tier] = (stats.byTier[c.tier] || 0) + 1;
    });

    const cityCount = {};
    confs.forEach(c => {
      const city = c.location?.city || 'Unknown';
      cityCount[city] = (cityCount[city] || 0) + 1;
    });
    stats.topCities = Object.entries(cityCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count }));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(stats));
    return;
  } else {
    filePath = path.join(__dirname, req.url);
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n✅  IEEE 会议 Demo 已启动`);
  console.log(`    打开浏览器访问: http://localhost:${PORT}\n`);

  // 打印评级分布
  const confs = loadData();
  const tierCount = {};
  confs.forEach(c => { tierCount[c.tier] = (tierCount[c.tier] || 0) + 1; });
  console.log('📊 含金量分布:', tierCount);
});
