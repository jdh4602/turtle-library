// admin.js

// =====================
// 0. 국립중앙도서관 ISBN API 키
// =====================
const NLK_API_KEY = "aa44adca43593e8866a20baf2b384d61564b3953ad7ab8f60d5124341dca5d26";

// =====================
// 1. Firebase 초기화 (compat 버전)
// =====================

// 🔹 Firebase 설정 (콘솔에서 복사한 걸로 통째로 교체)
const firebaseConfig = {
  apiKey: "AIzaSyA_BkguverEd0Cz8XA24ktcAodk9TH-GeI",
  authDomain: "turtle-library-book-db.firebaseapp.com",
  projectId: "turtle-library-book-db",
  storageBucket: "turtle-library-book-db.firebasestorage.app",
  messagingSenderId: "611950738800",
  appId: "1:611950738800:web:7d9474d358c0a33bd6e3b5",
};

// 전역 firebase 객체 사용
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// =====================
// 2. DOM 요소 참조
// =====================
const shelfInput = document.getElementById("shelfInput");
const currentLocationDiv = document.getElementById("currentLocation");

const isbnInput = document.getElementById("isbnInput");
const fetchBookBtn = document.getElementById("fetchBookBtn");
const titleInput = document.getElementById("titleInput");
const authorInput = document.getElementById("authorInput");

const bookBarcodeInput = document.getElementById("bookBarcodeInput");
const saveBtn = document.getElementById("saveBtn");

const log = document.getElementById("log");

// =====================
// 3. 현재 위치 상태 (Step 1에서 설정)
// =====================
let currentLocation = {
  door_no: null,
  slot_no: null,
  location_code: null,
};

// =====================
// 4. Step 1 - 문·칸 바코드 스캔
// =====================
shelfInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  const code = shelfInput.value.trim(); // 예: "00101"
  if (code.length !== 5) {
    appendLog(`[ERROR] 문-칸 코드는 5자리여야 합니다: ${code}`);
    return;
  }

  const door_no = code.slice(0, 3); // "001"
  const slot_no = code.slice(3);    // "01"

  currentLocation = {
    door_no,
    slot_no,
    location_code: code,
  };

  currentLocationDiv.textContent =
    `현재 위치: 문 ${door_no}, 칸 ${slot_no} (코드: ${code})`;
  appendLog(`[INFO] 위치 설정 완료 → ${JSON.stringify(currentLocation)}`);

  shelfInput.value = "";
  isbnInput.focus(); // 다음 단계로 포커스
});

// =====================
// 5. Step 2 - ISBN 스캔 → 도서 정보 조회
// =====================

// 버튼 클릭 시 조회
fetchBookBtn.addEventListener("click", () => {
  const isbn = isbnInput.value.trim();
  if (!isbn) {
    alert("ISBN을 입력해 주세요.");
    return;
  }
  fetchBookInfo(isbn);
});

// 엔터로도 조회
isbnInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    fetchBookBtn.click();
  }
});

// 메인 조회 로직: 국립중앙도서관 → 실패 시 Google Books
async function fetchBookInfo(isbn) {
  // 1) 국립중앙도서관 먼저 시도
  if (NLK_API_KEY && !NLK_API_KEY.includes("여기에_국립중앙도서관")) {
    try {
      const nlkResult = await fetchFromNLK(isbn);
      if (nlkResult) {
        titleInput.value = nlkResult.title || "";
        authorInput.value = nlkResult.author || "";
        appendLog(
          `[OK][NLK] 도서 정보 조회 성공 → 제목: ${titleInput.value}, 저자: ${authorInput.value}, ISBN: ${isbn}`
        );

        // ISBN 값은 그대로 두고, 바코드 칸으로 포커스만 이동
        bookBarcodeInput.focus();
        return;
      } else {
        appendLog("[INFO][NLK] 결과 없음 → Google Books로 폴백.");
      }
    } catch (err) {
      appendLog(`[WARN][NLK] 조회 오류 → Google Books로 폴백: ${err.message}`);
    }
  } else {
    appendLog("[INFO] NLK API 키 미설정 → Google Books만 사용.");
  }

  // 2) Google Books 폴백
  try {
    const googleResult = await fetchFromGoogleBooks(isbn);
    if (googleResult) {
      titleInput.value = googleResult.title || "";
      authorInput.value = googleResult.author || "";
      appendLog(
        `[OK][Google] 도서 정보 조회 성공 → 제목: ${titleInput.value}, 저자: ${authorInput.value}, ISBN: ${isbn}`
      );

      bookBarcodeInput.focus();
      return;
    } else {
      appendLog("[WARN][Google] 해당 ISBN으로 책 정보를 찾지 못했습니다.");
      alert("책 정보를 찾지 못했습니다. 제목/저자를 직접 입력해 주세요.");
    }
  } catch (err) {
    appendLog(`[ERROR][Google] 도서 정보 조회 실패: ${err.message}`);
    alert("도서 정보 조회 중 오류가 발생했습니다.");
  }
}

// 국립중앙도서관 조회 함수
async function fetchFromNLK(isbn) {
  const url = new URL("https://www.nl.go.kr/seoji/SearchApi.do");
  url.searchParams.set("cert_key", NLK_API_KEY);
  url.searchParams.set("result_style", "json");
  url.searchParams.set("page_no", "1");
  url.searchParams.set("page_size", "10");
  url.searchParams.set("isbn", isbn);

  appendLog(`[INFO][NLK] 요청 URL: ${url.toString()}`);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  const total = parseInt(data.TOTAL_COUNT ?? "0", 10);

  if (!total || !data.docs || !Array.isArray(data.docs) || data.docs.length === 0) {
    return null;
  }

  const first = data.docs[0];

  const title = first.TITLE || "";
  const author = first.AUTHOR || "";

  if (!title && !author) {
    return null;
  }

  return { title, author };
}

// Google Books 조회 함수 (폴백용)
async function fetchFromGoogleBooks(isbn) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(
    isbn
  )}`;

  appendLog(`[INFO][Google] 요청 URL: ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data.items || data.items.length === 0) {
    return null;
  }

  const info = data.items[0].volumeInfo || {};
  const title = info.title || "";
  const author =
    (info.authors && Array.isArray(info.authors) ? info.authors.join(", ") : "") || "";

  if (!title && !author) {
    return null;
  }

  return { title, author };
}

// =====================
// 6. Step 3 - 책 바코드 스캔 → Firestore 저장
// =====================

// 엔터 → 저장 버튼 클릭
bookBarcodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    saveBtn.click();
  }
});

saveBtn.addEventListener("click", async () => {
  const book_barcode = bookBarcodeInput.value.trim();
  const isbn = isbnInput.value.trim();     // 입력칸 값 그대로 사용
  const title = titleInput.value.trim();
  const author = authorInput.value.trim();

  if (!currentLocation.location_code) {
    alert("먼저 Step 1에서 문-칸 위치를 설정해 주세요.");
    return;
  }

  // 책 바코드: 숫자 3~20자리 허용 (5자리, 8자리 등 모두 OK)
  if (!/^[0-9]{3,20}$/.test(book_barcode)) {
    alert("책 바코드는 숫자 3~20자리로 입력해 주세요.");
    return;
  }

  if (!title) {
    alert("제목은 반드시 입력해야 합니다.");
    return;
  }

  try {
    const ref = db.collection("books").doc(book_barcode);

    await ref.set(
      {
        book_barcode,
        isbn: isbn || null,
        title,
        author,
        door_no: currentLocation.door_no,
        slot_no: currentLocation.slot_no,
        location_code: currentLocation.location_code,
        location_updated_at: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    appendLog(
      `[OK] ${book_barcode} 저장/업데이트 완료 → 위치 ${currentLocation.door_no}-${currentLocation.slot_no} (${currentLocation.location_code}), ISBN: ${isbn || "(없음)"}`
    );

    // 한 권 저장 끝 → 입력값 초기화 + 다음 책 준비
    bookBarcodeInput.value = "";
    isbnInput.value = "";
    titleInput.value = "";
    authorInput.value = "";

    // 다음 ISBN 스캔을 위해 포커스
    isbnInput.focus();
  } catch (err) {
    appendLog(`[ERROR] 저장 실패: ${err.message}`);
    alert("저장 중 오류가 발생했습니다. 콘솔 로그를 확인해 주세요.");
  }
});

// =====================
// 7. 로그 출력 함수
// =====================
function appendLog(msg) {
  const now = new Date().toISOString();
  // 🔧 여기서 문법 에러 나면 전체가 멈춘다 → 백틱/따옴표 주의
  log.textContent = `[${now}] ${msg}\n` + log.textContent;
}