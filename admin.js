// === 전역 상태 ===
let currentShelfCode = null;

// === DOM 요소 찾기 ===
const shelfInput = document.getElementById('shelfInput');
const currentLocationEl = document.getElementById('currentLocation');
const isbnInput = document.getElementById('isbnInput');
const logEl = document.getElementById('log');

// 간단 로그 함수
function log(msg) {
  if (!logEl) return;
  const time = new Date().toISOString().slice(11, 19);
  logEl.textContent += `[${time}] ${msg}\n`;
}

// 문-칸 위치 설정 함수
function setShelfLocation(rawCode) {
  const cleaned = (rawCode || '').trim();

  // 예시: 5자리 숫자만 허용 (00101 같은 형태)
  const valid = /^\d{5}$/.test(cleaned);
  if (!valid) {
    currentShelfCode = null;
    currentLocationEl.textContent = '현재 위치: (미설정)';
    log(`잘못된 위치 코드: "${rawCode}"`);
    return;
  }

  currentShelfCode = cleaned;
  currentLocationEl.textContent = `현재 위치: ${currentShelfCode}`;
  log(`현재 위치 설정: ${currentShelfCode}`);
}

// 문-칸 입력창에서 Enter 누르면 위치 설정 + ISBN으로 포커스 이동
if (shelfInput) {
  shelfInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      setShelfLocation(e.target.value);

      // 유효하게 설정된 경우에만 다음 입력으로 포커스 이동
      if (currentShelfCode && isbnInput) {
        isbnInput.focus();
      }
    }
  });
} else {
  console.error('shelfInput 요소를 찾을 수 없습니다.');
}
