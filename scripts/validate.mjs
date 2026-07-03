/*
 * Class Tube videos.json 데이터 검증 스크립트
 *
 * 사용법: node scripts/validate.mjs
 * (Node.js 18+ 필요. videos.json을 수정한 뒤에는 배포 전 항상 실행 권장)
 *
 * videos.json 스키마:
 * [{"id":"youtubeVideoId","title":"제목","cat":"카테고리키","lv":"elem|mid|all",
 *   "dur":12.34,"desc":"설명(선택)","grade":"low|high(선택)"}]
 *
 * 검사 항목:
 *  - JSON 문법 유효성
 *  - 필수 필드(id,title,cat,lv,dur) 존재 여부 및 타입
 *  - id 중복 여부
 *  - cat이 27개 카테고리 키 중 하나인지
 *  - lv가 elem|mid|all 중 하나인지
 *  - grade 값 유효성 및 elem 전용 여부 (경고)
 *  - dur이 0 초과 180 이하인지 (경고)
 *  - title/desc의 이스케이프 손상 흔적 (경고)
 *  - title 공백/빈 문자열 여부
 *
 * 문제가 하나라도 있으면 exit(1), 전부 통과하면 exit(0).
 */
import fs from 'fs';

const jsonPath = new URL('../videos.json', import.meta.url);

const VALID_CATS = [
  '학교폭력예방', '생명존중', '성교육', '도박예방', '금연', '음주예방', '약물예방',
  '장애인식', '다문화', '안전교육', '건강', '정신건강', '식품안전', '환경',
  '민주시민', '통일평화', '역사', '세계시민', '봉사나눔', '인성', '미디어',
  '진로', '경제금융', '독서', '소비자교육', '개인정보', '직업창업',
];
const VALID_LV = ['elem', 'mid', 'all'];
const VALID_GRADE = ['low', 'high'];
const REQUIRED_FIELDS = ['id', 'title', 'cat', 'lv', 'dur'];

// 문제 목록: { level: 'error'|'warn', id, message }
const issues = [];
function err(id, message) {
  issues.push({ level: 'error', id, message });
}
function warn(id, message) {
  issues.push({ level: 'warn', id, message });
}

// --- 1. 파일 읽기 & JSON 파싱 ---
let raw;
try {
  raw = fs.readFileSync(jsonPath, 'utf8');
} catch (e) {
  console.error(`videos.json 파일을 읽을 수 없습니다: ${e.message}`);
  process.exit(1);
}

let videos;
try {
  videos = JSON.parse(raw);
} catch (e) {
  console.error(`videos.json JSON 문법 오류: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(videos)) {
  console.error('videos.json 최상위는 배열([...])이어야 합니다.');
  process.exit(1);
}

console.log(`총 ${videos.length}개 항목 검사 시작...\n`);

// --- 2. 항목별 검사 ---
const seenIds = new Map(); // id -> 처음 등장한 인덱스

videos.forEach((v, idx) => {
  const label = (v && typeof v === 'object' && v.id) ? v.id : `(인덱스 ${idx}, id 없음)`;

  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    err(label, `항목이 객체가 아닙니다 (인덱스 ${idx})`);
    return;
  }

  // 필수 필드 존재 여부
  for (const field of REQUIRED_FIELDS) {
    if (!(field in v) || v[field] === null || v[field] === undefined) {
      err(label, `필수 필드 '${field}'가 없습니다`);
    }
  }

  // id 타입/중복
  if ('id' in v) {
    if (typeof v.id !== 'string' || v.id.trim() === '') {
      err(label, `id는 비어있지 않은 문자열이어야 합니다 (현재: ${JSON.stringify(v.id)})`);
    } else {
      if (seenIds.has(v.id)) {
        err(v.id, `id 중복 (인덱스 ${seenIds.get(v.id)}와 ${idx}에서 중복됨)`);
      } else {
        seenIds.set(v.id, idx);
      }
    }
  }

  // title 타입/공백
  if ('title' in v) {
    if (typeof v.title !== 'string') {
      err(label, `title은 문자열이어야 합니다 (현재 타입: ${typeof v.title})`);
    } else if (v.title.trim() === '') {
      err(label, 'title이 비어있거나 공백뿐입니다');
    } else if (/\\\\/.test(v.title)) {
      warn(label, `title에 이스케이프 손상 의심 패턴(연속 백슬래시)이 있습니다: ${v.title}`);
    }
  }

  // desc (선택) 타입/이스케이프 손상
  if ('desc' in v && v.desc !== undefined && v.desc !== null) {
    if (typeof v.desc !== 'string') {
      err(label, `desc는 문자열이어야 합니다 (현재 타입: ${typeof v.desc})`);
    } else if (/\\\\/.test(v.desc)) {
      warn(label, `desc에 이스케이프 손상 의심 패턴(연속 백슬래시)이 있습니다`);
    }
  }

  // cat 타입/유효성
  if ('cat' in v) {
    if (typeof v.cat !== 'string') {
      err(label, `cat은 문자열이어야 합니다 (현재 타입: ${typeof v.cat})`);
    } else if (!VALID_CATS.includes(v.cat)) {
      err(label, `cat 값이 유효하지 않습니다: '${v.cat}' (허용된 27개 카테고리 중 하나여야 함)`);
    }
  }

  // lv 타입/유효성
  if ('lv' in v) {
    if (typeof v.lv !== 'string') {
      err(label, `lv는 문자열이어야 합니다 (현재 타입: ${typeof v.lv})`);
    } else if (!VALID_LV.includes(v.lv)) {
      err(label, `lv 값이 유효하지 않습니다: '${v.lv}' (elem|mid|all 중 하나여야 함)`);
    }
  }

  // grade (선택) 유효성 - 경고 수준
  if ('grade' in v && v.grade !== undefined && v.grade !== null) {
    if (typeof v.grade !== 'string' || !VALID_GRADE.includes(v.grade)) {
      warn(label, `grade 값이 유효하지 않습니다: '${v.grade}' (low|high 중 하나여야 함)`);
    }
    if (v.lv !== 'elem') {
      warn(label, `grade는 lv가 'elem'일 때만 의미가 있습니다 (현재 lv: '${v.lv}')`);
    }
  }

  // dur 타입/범위
  if ('dur' in v) {
    if (typeof v.dur !== 'number' || Number.isNaN(v.dur)) {
      err(label, `dur은 숫자여야 합니다 (현재 타입: ${typeof v.dur})`);
    } else if (v.dur <= 0 || v.dur > 180) {
      warn(label, `dur 값이 의심스럽습니다: ${v.dur}분 (0 초과 180 이하 권장)`);
    }
  }
});

// --- 3. 결과 출력 ---
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warn');

if (errors.length > 0) {
  console.log(`오류 ${errors.length}건:`);
  errors.forEach((i) => console.log(`  [오류] ${i.id} - ${i.message}`));
  console.log('');
}

if (warnings.length > 0) {
  console.log(`경고 ${warnings.length}건:`);
  warnings.forEach((i) => console.log(`  [경고] ${i.id} - ${i.message}`));
  console.log('');
}

console.log(`검사 완료: 총 ${videos.length}개 항목, 오류 ${errors.length}건, 경고 ${warnings.length}건`);

if (errors.length > 0) {
  console.log('\n검증 실패: 위 오류를 수정한 뒤 다시 실행하세요.');
  process.exit(1);
} else {
  console.log('\n검증 통과');
  process.exit(0);
}
