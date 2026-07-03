/*
 * Class Tube 링크 점검 스크립트
 *
 * 사용법: node check-links.mjs
 * (Node.js 18+ 필요. 매달 1일 GitHub Actions로 자동 실행됨. 수동 실행도 가능)
 *
 * videos.json 안의 모든 영상 ID를 읽어서 실제 YouTube 썸네일이
 * 존재하는지 확인합니다. 삭제되었거나 비공개로 전환된 영상은
 * "no thumbnail" 플레이스홀더(약 1KB 이하)를 반환하므로 이를
 * 기준으로 깨진 링크를 찾아냅니다.
 *
 * videos.json 스키마: [{"id":"유튜브ID","title":"제목", ...}, ...]
 * (최상위가 바로 영상 배열)
 *
 * 깨진 링크가 하나라도 있으면 process.exit(1)로 종료합니다
 * (GitHub Actions가 실패를 감지해서 이슈를 자동 생성하도록 하기 위함).
 */
import fs from 'fs';

const jsonPath = new URL('./videos.json', import.meta.url);

let videos;
try {
  const raw = fs.readFileSync(jsonPath, 'utf8');
  videos = JSON.parse(raw);
} catch (e) {
  console.error(`videos.json을 읽거나 파싱할 수 없습니다: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(videos)) {
  console.error('videos.json 최상위는 배열([...])이어야 합니다.');
  process.exit(1);
}

console.log(`총 ${videos.length}개 영상 확인 중...`);

const CONCURRENCY = 20;
const suspicious = [];
let checked = 0;

async function checkOne(v) {
  try {
    const res = await fetch(`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`);
    const len = parseInt(res.headers.get('content-length') || '0');
    // 응답 바디를 명시적으로 비워야 커넥션이 깔끔히 닫힘
    // (특히 Windows + 최신 Node에서 body 미소비 상태로 process.exit() 시
    // libuv assertion 크래시가 나는 문제 방지)
    await res.arrayBuffer().catch(() => {});
    checked++;
    if (!res.ok || len < 2000) suspicious.push({ ...v, status: res.status, len });
  } catch (e) {
    suspicious.push({ ...v, error: e.message });
  }
  if (checked % 100 === 0) console.log(`  ${checked}/${videos.length}...`);
}

const queue = [...videos];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await checkOne(queue.shift());
  })
);

console.log(`\n확인 완료: ${checked}개 중 의심스러운 영상 ${suspicious.length}개`);
if (suspicious.length) {
  console.log('\n아래 ID들을 YouTube에서 직접 확인 후 videos.json에서 삭제하세요:');
  suspicious.forEach(s => console.log(`  ${s.id} | ${s.title} | ${s.error || 'len=' + s.len}`));
  fs.writeFileSync('suspicious-links.json', JSON.stringify(suspicious, null, 2));
  console.log('\n상세 내역이 suspicious-links.json 에 저장되었습니다.');
  console.log(`\n::error::깨진 유튜브 링크 ${suspicious.length}건 발견 (suspicious-links.json 참고)`);
  process.exit(1);
} else {
  console.log('모든 링크가 정상입니다.');
  process.exit(0);
}
