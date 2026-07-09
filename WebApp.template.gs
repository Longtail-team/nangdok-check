/**
 * @file WebApp.gs  (템플릿 — 과정마다 이 코드를 그대로 쓰고 "설정탭"만 채우면 됨)
 * @description 낭독 출석 웹앱 (서버). 기존 출석/상장 프로젝트에 "함께" 추가하세요.
 *              기존 전역(SOURCE_SPREADSHEET_ID, TARGET_SPREADSHEET_ID, TARGET_SHEET_NAME,
 *              COLUMN_MAP, DEFAULT_CHECKBOX_COUNT, calculateAttendanceDirectly)을 재사용합니다.
 *
 * ── 새 과정 배포 체크리스트 ─────────────────────────────────────
 *  1) 이 코드를 과정 프로젝트에 추가(기존 함수들 재사용).
 *  2) 원본 '설정' 탭 채우기:  B4=과정명 / B5=개강일(날짜) / B6=기간(주) / B7=메인색상(hex, 선택)
 *  3) 인증시트 D2 = 체크박스 수(=총 학습일). 12주→60, 24주→120.
 *  4) 배포 → 액세스 "모든 사용자(Anyone)" → 새 버전 배포.
 *  5) Netlify 프론트(index.html)의 const API 를 이 과정 exec 주소로.
 *
 * 흐름: 연락처 입력 → 원본시트에서 그 행의 인스타 확인 → 인증시트에서 같은 인스타 가족 행 전부 표시
 *       → 도장 체크 시 인증시트 칸을 켜고, calculateAttendanceDirectly로 출석(E)·달성율(F) 인라인 재계산
 *       → 기존 상장·출석율 메일 자동화는 수정 없이 그대로 동작.
 */

// =================================================================
// ⚙️ 웹앱 설정 — 실제 값에 맞게 확인하세요
// =================================================================
const WEBAPP_SOURCE_SHEET_NAME   = '설문지 응답 시트1'; // 원본 신청서 "응답 탭" 이름 (기존 01 파일 SOURCE_SHEET_NAME과 동일)
const WEBAPP_SETTINGS_SHEET_NAME = '설정';           // 원본시트 설정 탭: B4=과정명, B5=개강일, B6=기간(주), B7=메인색상(hex)
const WEBAPP_COURSE_TITLE        = '낭독 출석';        // 설정탭 B4 못 읽을 때만 쓰는 백업 제목
const WEBAPP_COURSE_SUBTITLE     = '매일 낭독하고 도장 모으기 🌱';
const WEBAPP_MAIN_COLOR          = '#6FA766';        // 설정탭 B7 비었을 때 기본 색

// =================================================================
// 진입점 — 데이터(JSON) API. 화면은 Netlify가 그림(구글 배지 없음).
// =================================================================
function doGet(e) {
  var p  = (e && e.parameter) ? e.parameter : {};
  var fn = p.fn;
  var cb = p.callback || 'callback';
  var out;
  try {
    if      (fn === 'getConfig')        out = getConfig();
    else if (fn === 'getFamilyByPhone') out = getFamilyByPhone(p.a0);
    else if (fn === 'getLeaderboard')   out = getLeaderboard();
    else if (fn === 'getBootstrap')     out = getBootstrap(p.a0);
    else if (fn === 'submitCheck')      out = submitCheck(Number(p.a0), Number(p.a1), p.a2 === 'true');
    else                                out = { ok:false, error:'알 수 없는 요청: ' + fn };
  } catch (err) {
    out = { ok:false, error:String((err && err.message) || err) };
  }
  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(out) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/** 화면 초기 설정값 — 과정명·색은 설정탭에서 읽음(과정마다 코드 수정 불필요) */
function getConfig() {
  const sched = _getSchedule_();
  let title = WEBAPP_COURSE_TITLE;   // 설정 못 읽으면 이 값으로 대체
  let color = WEBAPP_MAIN_COLOR;
  try {
    const s = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(WEBAPP_SETTINGS_SHEET_NAME);
    if (s) {
      const course = String(s.getRange('B4').getValue() || '').trim();   // 과정명 (예: 전래동화 1기)
      if (course) title = course + ' 출석페이지';                         // → "전래동화 1기 출석페이지"
      const c = String(s.getRange('B7').getValue() || '').trim();        // 메인색상 hex (예: #6FA766)
      if (/^#[0-9a-fA-F]{6}$/.test(c)) color = c;                        // 형식 맞을 때만 적용
    }
  } catch (e) {}
  return { title: title, subtitle: WEBAPP_COURSE_SUBTITLE, mainColor: color, schedule: sched };
}

/** 초기 데이터 한 번에 묶어서 반환 → 화면 로딩 속도↑ (서버 왕복 3→1) */
function getBootstrap(phoneInput) {
  var out = { ok: true };
  try { out.config = getConfig(); } catch (e) { out.config = null; }
  try { out.leaderboard = getLeaderboard(); } catch (e) { out.leaderboard = { ok: false }; }
  if (phoneInput && String(phoneInput).length >= 8) {
    try { out.family = getFamilyByPhone(phoneInput); } catch (e) { out.family = { ok: false, error: String(e) }; }
  }
  return out;
}

// =================================================================
// 로그인: 연락처 → 가족 조회
// =================================================================
function getFamilyByPhone(phoneInput) {
  try {
    const digits = _digits(phoneInput);
    if (digits.length < 8) return { ok: false, error: '연락처를 정확히 입력해 주세요.' };

    const src = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(WEBAPP_SOURCE_SHEET_NAME);
    if (!src) return { ok: false, error: '원본시트를 찾을 수 없습니다. (탭 이름 확인 필요)' };

    const cols = _sourceCols_(src);
    if (cols.phone < 0 || cols.instagram < 0) {
      return { ok: false, error: '원본시트에서 연락처/인스타 열을 찾지 못했어요.' };
    }

    const data = src.getDataRange().getValues();
    let instagram = null;
    for (let r = 1; r < data.length; r++) {
      if (_digits(data[r][cols.phone - 1]) === digits) {
        instagram = String(data[r][cols.instagram - 1] || '').trim();
        break;
      }
    }
    if (!instagram) {
      return { ok: false, error: '등록된 연락처를 찾지 못했어요. 신청 시 입력한 번호가 맞는지 확인해 주세요.' };
    }
    return _buildFamilyPayload_(instagram);
  } catch (e) {
    return { ok: false, error: '조회 중 오류: ' + e.message };
  }
}

/** 같은 인스타를 가진 인증시트 행 = 한 가족 */
function _buildFamilyPayload_(instagram) {
  const tsheet = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID).getSheetByName(TARGET_SHEET_NAME);
  const lastRow = tsheet.getLastRow();
  const checkboxCount = Number(tsheet.getRange('D2').getValue()) || DEFAULT_CHECKBOX_COUNT;
  const startCol = COLUMN_MAP.TARGET.START_ATTENDANCE;      // 8 (H)
  const width = startCol - 1 + checkboxCount;
  const wantHandle = _igHandle(instagram);

  const members = [];
  if (lastRow >= 3) {
    const values = tsheet.getRange(3, 1, lastRow - 2, width).getValues();
    values.forEach((row, i) => {
      if (_igHandle(row[COLUMN_MAP.TARGET.INSTAGRAM - 1]) !== wantHandle) return;
      const checks = row.slice(startCol - 1, startCol - 1 + checkboxCount).map(v => v === true);
      members.push({
        rowIndex: i + 3,
        name: _familyName_(row[COLUMN_MAP.TARGET.NAME - 1]),          // 가족 화면용(괄호 앞 이름)
        instagram: String(row[COLUMN_MAP.TARGET.INSTAGRAM - 1] || '').trim(),
        handle: _igHandle(row[COLUMN_MAP.TARGET.INSTAGRAM - 1]),
        total: Number(row[COLUMN_MAP.TARGET.TOTAL - 1]) || checkboxCount,
        completed: Number(row[COLUMN_MAP.TARGET.COMPLETED - 1]) || 0,
        checks: checks
      });
    });
  }
  if (members.length === 0) {
    return { ok: false, error: '연락처는 확인됐지만 인증시트에서 명단을 찾지 못했어요. 관리자에게 문의해 주세요.' };
  }
  return { ok: true, instagram: instagram, checkboxCount: checkboxCount, members: members };
}

// =================================================================
// 체크 기록 (오늘/밀린 날) + 출석 인라인 재계산
// =================================================================
function submitCheck(rowIndex, dayIndex, checked) {
  const lock = LockService.getScriptLock();
  try {
    lock.tryLock(10000);
    const sched = _getSchedule_();
    if (sched.todayIndex && dayIndex > sched.todayIndex) {
      return { ok: false, error: '아직 오지 않은 날은 체크할 수 없어요.' };
    }
    const tsheet = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID).getSheetByName(TARGET_SHEET_NAME);
    const col = COLUMN_MAP.TARGET.START_ATTENDANCE - 1 + dayIndex;   // 7 + dayIndex
    tsheet.getRange(rowIndex, col).setValue(!!checked);

    // ★ 기존 함수 재사용: TRUE 개수 세어 출석(E)·달성율(F) 갱신 (onEdit이 안 도는 문제 해결)
    calculateAttendanceDirectly(tsheet, rowIndex);

    const v = tsheet.getRange(rowIndex, COLUMN_MAP.TARGET.COMPLETED, 1, 2).getValues()[0];
    return { ok: true, completed: Number(v[0]) || 0, rate: Number(v[1]) || 0 };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// =================================================================
// 리더보드: 가족(=인스타 핸들) 단위 1줄 집계
//   · 오늘의 성실왕 : 가족 중 한 명이라도 오늘 출석 → 노출
//   · 이번주 꾸준왕 : 가족 "평균 달성율"(최근 14일 기준) 순
// =================================================================
function getLeaderboard() {
  try {
    const tsheet = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID).getSheetByName(TARGET_SHEET_NAME);
    const lastRow = tsheet.getLastRow();
    if (lastRow < 3) return { ok: true, today: [], week: [] };

    const checkboxCount = Number(tsheet.getRange('D2').getValue()) || DEFAULT_CHECKBOX_COUNT;
    const startCol = COLUMN_MAP.TARGET.START_ATTENDANCE;
    const width = startCol - 1 + checkboxCount;
    const sched = _getSchedule_();
    const todayIdx = sched.todayIndex || 0;

    // 최근 14일(달력 기준) 안에 드는 "일차" 집합 + 그 창의 총 일수(평균 분모)
    const recentDays = new Set();
    if (sched.dates && todayIdx >= 1) {
      const todayMs = _parseISO_(sched.dates[todayIdx - 1].iso).getTime();
      const from = todayMs - 13 * 86400000;
      for (let d = 1; d <= Math.min(todayIdx, sched.dates.length); d++) {
        const t = _parseISO_(sched.dates[d - 1].iso).getTime();
        if (t >= from && t <= todayMs) recentDays.add(d);
      }
    }
    const windowDays = recentDays.size;   // 최근 14일 안의 출석 가능일 수 (평균 달성율 분모)

    const values = tsheet.getRange(3, 1, lastRow - 2, width).getValues();

    // ── 인스타 핸들로 가족 묶기 ──
    const fam = {};   // handle → { handle, url, penName, memberCount, todayAny, recentSum }
    values.forEach(row => {
      const name = String(row[COLUMN_MAP.TARGET.NAME - 1] || '').trim();
      const ig = String(row[COLUMN_MAP.TARGET.INSTAGRAM - 1] || '').trim();
      if (!name || !ig) return;
      const handle = _igHandle(ig);
      if (!handle) return;
      const checks = row.slice(startCol - 1, startCol - 1 + checkboxCount);

      let g = fam[handle];
      if (!g) { g = fam[handle] = { handle: handle, url: _igUrl(ig), penName: '', memberCount: 0, todayAny: false, recentSum: 0 }; }
      g.memberCount++;

      // 대표 필명: 괄호 안 필명이 있는 행(보통 부모)을 우선 사용
      const pen = _penNameOnly_(name);
      if (pen && !g.penName) g.penName = pen;

      if (todayIdx >= 1 && checks[todayIdx - 1] === true) g.todayAny = true;

      let rc = 0;
      recentDays.forEach(d => { if (checks[d - 1] === true) rc++; });
      g.recentSum += rc;   // 가족 구성원들의 최근 14일 출석 수 합
    });

    const today = [], week = [];
    Object.keys(fam).forEach(h => {
      const g = fam[h];
      const denom = windowDays * g.memberCount;                 // 가족 전체 분모
      const avgRate = denom > 0 ? Math.round((g.recentSum / denom) * 100) : 0;   // 가족 평균 달성율(%)
      const item = {
        display: g.penName || g.handle,                          // 실명 대신 필명/핸들
        handle: g.handle,
        url: g.url,
        extra: g.memberCount > 1 ? (g.memberCount - 1) : 0,      // +N 배지 (대표 외 인원)
        avgRate: avgRate
      };
      if (g.todayAny) today.push(item);
      if (g.recentSum > 0) week.push(item);
    });

    today.sort((a, b) => b.avgRate - a.avgRate);
    week.sort((a, b) => b.avgRate - a.avgRate);

    return { ok: true, today: today.slice(0, 20), week: week.slice(0, 20) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// =================================================================
// 스케줄: 원본 '설정' B5(개강일)·B6(주수) → 평일 시퀀스 자동 생성
// =================================================================
function _getSchedule_() {
  const tz = Session.getScriptTimeZone();
  const out = { ok: false, dates: [], todayIndex: 0, total: 0, weeks: 0,
                startLabel: '', endLabel: '', startISO: '', endISO: '' };
  try {
    const tsheet = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID).getSheetByName(TARGET_SHEET_NAME);
    const checkboxCount = Number(tsheet.getRange('D2').getValue()) || DEFAULT_CHECKBOX_COUNT;

    const s = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(WEBAPP_SETTINGS_SHEET_NAME);
    let startRaw = s ? s.getRange('B5').getValue() : null;              // 개강일 = 설정!B5
    let weeks = s ? parseInt(s.getRange('B6').getValue(), 10) : NaN;   // 기간(주) = 설정!B6

    const start = startRaw ? new Date(startRaw) : null;
    if (!start || isNaN(start.getTime())) { out.total = checkboxCount; return out; }

    const total = checkboxCount;                    // 인증시트 D2 = 체크박스 수 (60/120)
    const dates = [];
    const cur = new Date(start); cur.setHours(0, 0, 0, 0);
    while (dates.length < total) {
      const w = cur.getDay();
      if (w >= 1 && w <= 5) {                        // 월~금 고정 (공휴일·방학 무관)
        dates.push({
          iso: Utilities.formatDate(cur, tz, 'yyyy-MM-dd'),
          m: cur.getMonth() + 1, d: cur.getDate(), dow: '일월화수목금토'[cur.getDay()]
        });
      }
      cur.setDate(cur.getDate() + 1);
    }

    const todayISO = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    let todayIndex = 0;
    for (let i = 0; i < dates.length; i++) { if (dates[i].iso <= todayISO) todayIndex = i + 1; }

    out.ok = true;
    out.dates = dates;
    out.total = total;
    out.weeks = weeks || Math.ceil(total / 5);
    out.todayIndex = todayIndex;                    // 0=개강 전
    out.startISO = dates[0].iso;
    out.endISO = dates[dates.length - 1].iso;
    out.startLabel = dates[0].m + '.' + dates[0].d + ' ' + dates[0].dow;
    out.endLabel = dates[total - 1].m + '.' + dates[total - 1].d + ' ' + dates[total - 1].dow;
    return out;
  } catch (e) {
    return out;
  }
}

// =================================================================
// 원본시트 열 헤더 매핑 (번호 고정 대신 헤더 이름으로)
// =================================================================
function _sourceCols_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => String(h || '').replace(/\s+/g, ''));
  const find = pred => { for (let i = 0; i < headers.length; i++) if (pred(headers[i])) return i + 1; return -1; };

  // 이름(실명) 열: '실명' 우선, 없으면 '이름'(단, 자녀 제외)
  const name = find(h => h.includes('실명')) !== -1
    ? find(h => h.includes('실명'))
    : find(h => h.includes('이름') && !h.includes('자녀'));

  // 인스타 열: '인스타계정' 우선 (헤더 "실명(인스타 필명)"에 낚이지 않도록)
  let instagram = find(h => h.includes('인스타계정'));
  if (instagram < 0) instagram = find(h => h.includes('계정') && !h.includes('실명') && !h.includes('필명'));
  if (instagram < 0) instagram = find(h => h.includes('인스타') && !h.includes('실명') && !h.includes('필명'));

  return {
    email:     find(h => h.includes('이메일')),
    name:      name,
    instagram: instagram,
    phone:     find(h => h.includes('연락처') || h.includes('전화') || h.includes('휴대')),
    child:     find(h => h.includes('자녀이름'))
  };
}

// =================================================================
// 유틸
// =================================================================
function _digits(s) { return String(s == null ? '' : s).replace(/[^0-9]/g, ''); }

function _igHandle(v) {
  let s = String(v || '').trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^instagram\.com\//, '').replace(/^@/, '');
  s = s.replace(/[\/?].*$/, '');
  return s;
}
function _igUrl(v) {
  const h = _igHandle(v);
  return h ? ('https://instagram.com/' + h) : '';
}
/** 가족 화면용: "김애지(my.morning.glory)" → "김애지", "리아" → "리아" */
function _familyName_(raw) {
  const s = String(raw || '').trim();
  const i = s.indexOf('(');
  return (i > 0 ? s.slice(0, i) : s).trim();
}
/** 리더보드(공개)용: 괄호 안 필명 우선, 없으면 인스타 핸들 (실명 노출 방지) */
function _publicName_(raw, ig) {
  const s = String(raw || '').trim();
  const m = s.match(/\(([^)]+)\)/);
  if (m && m[1].trim()) return m[1].trim();
  return _igHandle(ig) || s;
}
/** 괄호 안 필명만 반환 (없으면 빈 문자열) — 가족 대표 이름 선정용 */
function _penNameOnly_(raw) {
  const m = String(raw || '').match(/\(([^)]+)\)/);
  return (m && m[1].trim()) ? m[1].trim() : '';
}
function _parseISO_(iso) {
  const p = String(iso).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
