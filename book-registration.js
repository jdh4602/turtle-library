// =============================
// 0. 국립중앙도서관 ISBN API 키
// =============================
const NLK_API_KEY =
  "aa44adca43593e8866a20baf2b384d61564b3953ad7ab8f60d5124341dca5d26";


// =============================
// 1. Firebase 초기화 (compat)
// =============================
const firebaseConfig = {
  apiKey: "AIzaSyA_BkguverEd0Cz8XA24ktcAodk9TH-GeI",
  authDomain: "turtle-library-book-db.firebaseapp.com",
  projectId: "turtle-library-book-db",
  storageBucket: "turtle-library-book-db.firebasestorage.app",
  messagingSenderId: "611950738800",
  appId: "1:611950738800:web:7d9474d358c0a33bd6e3b5",
};

if (firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();


// =============================
// 2. DOM 요소
// =============================
const isbnInput = document.getElementById("isbnInput");
const titleInput = document.getElementById("titleInput");
const authorInput = document.getElementById("authorInput");

const bookBarcodeInput = document.getElementById("bookBarcodeInput");
const shelfInput = document.getElementById("shelfInput");

const logBox = document.getElementById("log");


// =============================
// 2-1. 로그 포맷
// =============================
function getTimeTag() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `[${hh}:${mm}:${ss}]`;
}

function log(line) {
  if (!logBox) return;
  logBox.textContent = `${line}\n` + logBox.textContent;
}

function logError(msg) {
  log(`${getTimeTag()} [ERROR] ${msg}`);
}


// =============================
// 3. 제목 검색 인덱스 유틸
// =============================

// 검색 인덱스용 정규화: 소문자 + 공백 제거
function normalizeForIndex(str) {
  return String(str || "").toLowerCase().replace(/\s+/g, "");
}

// 최소 2글자 이상 substring 인덱스 생성
function buildTitleIndex(title) {
  const t = normalizeForIndex(title);
  const set = new Set();

  for (let i = 0; i < t.length; i++) {
    for (let j = i + 2; j <= t.length; j++) {
      set.add(t.substring(i, j));
    }
  }

  return Array.from(set);
}


// =============================
// 4. ISBN 조회 (NLK → Google 폴백)
// =============================

// NLK는 숫자 + X 형태가 안정적
async function fetchFromNLK(isbnRaw) {
  const isbn = isbnRaw.replace(/[^0-9Xx]/g, "");

  const url = new URL("https://www.nl.go.kr/seoji/SearchApi.do");
  url.searchParams.set("cert_key", NLK_API_KEY);
  url.searchParams.set("result_style", "json");
  url.searchParams.set("page_no", "1");
  url.searchParams.set("page_size", "10");
  url.searchParams.set("isbn", isbn);

  const res = await fetch(url);
  if (!res.ok) throw new Error("NLK HTTP " + res.status);

  const data = await res.json();

  const total = data.TOTAL_COUNT || data.total_count;
  if (total === "0" || total === 0) return null;

  const list = Array.isArray(data.docs) ? data.docs : [];
  if (!list.length) return null;

  const d = list[0];

  return {
    title: d.TITLE || d.title || "",
    author: d.AUTHOR || d.author || "",
  };
}

async function fetchFromGoogle(isbnRaw) {
  const res = await fetch(
    "https://www.googleapis.com/books/v1/volumes?q=isbn:" +
      encodeURIComponent(isbnRaw)
  );

  if (!res.ok) throw new Error("Google HTTP " + res.status);

  const data = await res.json();
  if (!data.items || !data.items.length) return null;

  const v = (data.items[0] || {}).volumeInfo || {};

  return {
    title: v.title || "",
    author: Array.isArray(v.authors) ? v.authors.join(", ") : "",
  };
}


// =============================
// 5. ISBN 입력 → 자동 조회
// =============================
async function handleIsbnLookup() {
  const isbnRaw = (isbnInput.value || "").trim();
  if (!isbnRaw) return;

  let result = null;
  let source = null;

  // 1) 국립중앙도서관 먼저 조회
  try {
    result = await fetchFromNLK(isbnRaw);
    if (result) source = "NLK";
  } catch (e) {
    logError("NLK 조회 실패: " + e.message);
  }

  // 2) 실패 시 Google 폴백
  if (!result) {
    try {
      result = await fetchFromGoogle(isbnRaw);
      if (result) source = "GOOGLE_FALLBACK";
    } catch (e) {
      logError("Google 조회 실패: " + e.message);
    }
  }

  // 3) 둘 다 실패
  if (!result) {
    log(`${getTimeTag()} [ISBN조회실패] - 제목과 저자를 직접 입력해주세요.`);
    titleInput.focus();
    return;
  }

  // 결과 반영
  titleInput.value = result.title || "";
  authorInput.value = result.author || "";

  // 성공 로그 (단 하나만)
  if (source === "NLK") {
    log(`${getTimeTag()} [ISBN조회완료] - 국립중앙도서관`);
  } else if (source === "GOOGLE_FALLBACK") {
    log(`${getTimeTag()} [ISBN조회완료] - Google`);
  }

  // 다음 입력
  bookBarcodeInput.focus();
}


// =============================
// 6. 책장 바코드 스캔 → Firestore 저장
// =============================
async function saveBookByShelfScan() {
  const book_barcode = (bookBarcodeInput.value || "").trim();
  const isbn = (isbnInput.value || "").trim();
  const title = (titleInput.value || "").trim();
  const author = (authorInput.value || "").trim();
  const code = (shelfInput.value || "").trim();

  if (!/^[0-9]{5}$/.test(code)) {
    logError(`잘못된 책장코드: ${code}`);
    return;
  }

  if (!book_barcode) {
    logError("도서 바코드 없음");
    bookBarcodeInput.focus();
    return;
  }

  if (!title) {
    logError("제목 없음");
    titleInput.focus();
    return;
  }

  const door_no = code.slice(0, 3);
  const slot_no = code.slice(3);

  // 앞자리 0 제거 (숫자만)
  const doorNum = String(parseInt(door_no, 10));
  const slotNum = String(parseInt(slot_no, 10));

  // 🔹 제목 인덱스 생성
  const title_index = buildTitleIndex(title);

  const payload = {
    author: author || null,
    book_barcode,
    isbn: isbn || null,
    title,
    door_no,
    slot_no,
    location_code: code,
    location_updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    info_confirmed: "N",

    // 🔹 검색용 인덱스 필드
    title_index,
  };

  try {
    await db.collection("books")
      .doc(book_barcode)
      .set(payload, { merge: false });

    // 🎯 로그 포맷 — 네가 쓰던 그대로 유지
    const line =
      `${getTimeTag()} [등록완료] - ` +
      `제목: ${title} | ` +
      `저자: ${author || "-"} | ` +
      `${doorNum}번문 ${slotNum}번칸 | ` +
      `바코드: ${book_barcode}`;

    log(line);

    // 입력 초기화 + 다음 ISBN 대기
    isbnInput.value = "";
    titleInput.value = "";
    authorInput.value = "";
    bookBarcodeInput.value = "";
    shelfInput.value = "";

    isbnInput.focus();
  } catch (e) {
    logError("저장 실패: " + e.message);
  }
}


// =============================
// 7. 이벤트 바인딩
// =============================
isbnInput.addEventListener("keydown", e => {
  if (e.key === "Enter") handleIsbnLookup();
});

bookBarcodeInput.addEventListener("keydown", e => {
  if (e.key === "Enter") shelfInput.focus();
});

shelfInput.addEventListener("keydown", e => {
  if (e.key === "Enter") saveBookByShelfScan();
});

// 초기 포커스
isbnInput.focus();
