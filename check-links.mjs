/*
 * Class Tube 링크 점검 스크립트
 *
 * 사용법: node check-links.mjs
 * (Node.js 18+ 필요. 학기 초마다 한 번씩 실행 권장)
 *
 * index.html 안의 모든 영상 ID를 추출해서 실제 YouTube 썸네일이
 * 존재하는지 확인합니다. 삭제되었거나 비공개로 전환된 영상은
 * "no thumbnail" 플레이스홀더(약 1KB 이하)를 반환하므로 이를
 * 기준으로 깨진 링크를 찾아냅니다.
 */
import fs from 'fs';

const htmlPath = new URL('./index.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');

const objRe = /\{id:"([^"]+)",title:"((?:[^"\\]|\\.)*)"/g;
let m;
const videos = [];
while ((m = objRe.exec(html)) !== null) videos.push({ id: m[1], title: m[2] });

console.log(`총 ${videos.length}개 영상 확인 중...`);

const CONCURRENCY = 20;
const suspicious = [];
let checked = 0;

async function checkOne(v) {
  try {
    const res = await fetch(`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`);
    const len = parseInt(res.headers.get('content-length') || '0');
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
  console.log('\n아래 ID들을 YouTube에서 직접 확인 후 index.html에서 삭제하세요:');
  suspicious.forEach(s => console.log(`  ${s.id} | ${s.title} | ${s.error || 'len=' + s.len}`));
  fs.writeFileSync('suspicious-links.json', JSON.stringify(suspicious, null, 2));
  console.log('\n상세 내역이 suspicious-links.json 에 저장되었습니다.');
} else {
  console.log('모든 링크가 정상입니다.');
}
