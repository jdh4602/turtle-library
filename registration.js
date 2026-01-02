// =====================
// 0. (선택) 국립중앙도서관 ISBN API 키
// =====================
const NLK_API_KEY =
  "aa44adca43593e8866a20baf2b384d61564b3953ad7ab8f60d5124341dca5d26";

// =====================
// 1. Firebase 초기화 (compat)
// =====================
const firebaseConfig = {
  apiKey: "AIzaSyA_BkguverEd0Cz8XA24ktcAodk9TH-GeI",
  authDomain: "turtle-library-book-db.firebaseapp.com",
  projectId: "turtle-library-book-db",
  storageBucket: "turtle-library-book-db.firebasestorage.app",
  messagingSenderId: "611950738800",
  appId: "1:611950738800:web:7d9474d358c0a33bd6e3b5",
};

if (firebase.apps && firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// =====================
// 2. DOM 요소
// =====================
const shelfInput = document.getElementById("shelfInput");
const currentLocationDiv = document.getElementById("currentLocation");

const isbnInput = document.getElementById("isbnInput");
const fetchBookBtn = document.getElementById("fetchBookBtn");
const titleInput = document.getElementById("titleInput");
const authorInput = document.getElementById("authorInput");

const bookBarcodeInput = document.getElementById("bookBarcodeInput");
const saveBtn = document.getElementById("saveBtn");
const logBox = document.getElementById("log");

// =====================
// 3. 상태
// =====================
let currentLocation = null; // { door_no, slot_no, location_code }

// =====================
// 4. 로그 출력
// =====================
function appendLog(msg) {
  if (!logBox) return;
  const now = new Date().toISOString();
  logBox.textContent = `[${now}] ${msg}\n` + logBox.textContent;
}

// =====================
// 5. 책장 바코드 → 위치 설정
// =====================
function applyShelfCode(raw) {
  const code = (raw || "").trim();

  if (!code) {
    alert("문-칸 바코드를 입력해 주세요. (예: 00101)");
    return;
  }
  if (!/^[0-9]{5}$/.test(code)) {
    alert("문-칸 바코드는 숫자 5자리여야 합니다. (예: 00101)");
    appendLog(`[ERROR] 잘못된 문-칸 바코드: ${code}`);
    return;
  }

  const door_no = code.slice(0, 3);
  const slot_no = code.slice(3);

  currentLocation = {
    door_no,
    slot_no,
    location_code: code,
  };

  if (currentLocationDiv) {
    currentLocationDiv.textContent = `현재 위치: 문 ${door_no}, 칸 ${slot_no} (코드: ${code})`;
  }

  appendLog(
    `[INFO] 위치 설정 완료 → 문 ${door_no}, 칸 ${slot_no}, 코드 ${code}`
  );

  shelfInput.value = "";
  if (isbnInput) isbnInput.focus();
}

if (shelfInput) {
  shelfInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      applyShelfCode(shelfInput.value);
    }
  });
}

// =====================
// 6. ISBN 조회 (NLK → Google Books 폴백)
// =====================
async function fetchFromNLK(isbn) {
  const url = new URL("https://www.nl.go.kr/seoji/SearchApi.do");
  url.searchParams.set("cert_key", NLK_API_KEY);
  url.searchParams.set("result_style", "json");
  url.searchParams.set("page_no", "1");
  url.searchParams.set("page_size", "10");
  url.searchParams.set("isbn", isbn);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`NLK HTTP ${res.status}`);

  const data = await res.json();
  const list =
    data.docs ||
    data.seojiList ||
    data.items ||
    data.result ||
    data.rows ||
    [];

  if (!Array.isArray(list) || list.length === 0) return null;

  const first = list[0] || {};
  const title =
    first.TITLE ||
    first.title ||
    first.bookname ||
    first.book_name ||
    "";
  const authorRaw =
    first.AUTHOR ||
    first.author ||
    first.authors ||
    first.author_name ||
    "";
  const author = Array.isArray(authorRaw)
    ? authorRaw.join(", ")
    : String(authorRaw || "");

  if (!title && !author) return null;
  return { title, author };
}

async function fetchFromGoogleBooks(isbn) {
  const url =
    "https://www.googleapis.com/books/v1/volumes?q=isbn:" +
    encodeURIComponent(isbn);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);

  const data = await res.json();
  if (!data.items || !data.items.length) return null;

  const info = data.items[0].volumeInfo || {};
  const title = info.title || "";
  const author =
    (info.authors && Array.isArray(info.authors)
      ? info.authors.join(", ")
      : "") || "";

  if (!title && !author) return null;
  return { title, author };
}

async function handleFetchBook() {
  if (!isbnInput) return;
  const isbn = isbnInput.value.trim();

  if (!isbn) {
    alert("ISBN 바코드를 입력해 주세요.");
    return;
  }

  appendLog(`[INFO] ISBN 조회 시작 → ${isbn}`);

  let result = null;

  // 1) 국립중앙도서관
  try {
    if (NLK_API_KEY && !NLK_API_KEY.includes("여기에_")) {
      result = await fetchFromNLK(isbn);
      if (result) {
        appendLog(
          `[OK][NLK] 조회 성공 → 제목: ${result.title}, 저자: ${result.author}`
        );
      } else {
        appendLog("[INFO][NLK] 결과 없음 → Google Books로 폴백");
      }
    } else {
      appendLog("[INFO][NLK] 키 미설정 → Google Books로 진행");
    }
  } catch (e) {
    appendLog(`[ERROR][NLK] 조회 실패: ${e.message} → Google Books로 폴백`);
  }

  // 2) Google Books 폴백
  if (!result) {
    try {
      result = await fetchFromGoogleBooks(isbn);
      if (result) {
        appendLog(
          `[OK][Google] 조회 성공 → 제목: ${result.title}, 저자: ${result.author}`
        );
      } else {
        appendLog("[INFO][Google] 결과 없음");
      }
    } catch (e) {
      appendLog(`[ERROR][Google] 조회 실패: ${e.message}`);
    }
  }

  if (!result) {
    alert("도서 정보를 찾지 못했습니다. 제목/저자를 직접 입력해 주세요.");
    if (titleInput) titleInput.focus();
    return;
  }

  if (titleInput) titleInput.value = result.title || "";
  if (authorInput) authorInput.value = result.author || "";

  if (bookBarcodeInput) bookBarcodeInput.focus();
}

if (fetchBookBtn) {
  fetchBookBtn.addEventListener("click", () => {
    handleFetchBook().catch((e) => {
      console.error(e);
      alert("도서 정보 조회 중 오류가 발생했습니다.");
    });
  });
}

if (isbnInput) {
  isbnInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleFetchBook().catch((e) => {
        console.error(e);
        alert("도서 정보 조회 중 오류가 발생했습니다.");
      });
    }
  });
}

// =====================
// 7. Firestore 저장 (info_confirmed: "N" 포함)
// =====================
async function handleSaveBook() {
  if (!currentLocation) {
    alert("먼저 책장 바코드를 스캔해 위치를 설정해 주세요.");
    if (shelfInput) shelfInput.focus();
    return;
  }

  if (!db) {
    alert("Firebase 초기화 오류: Firestore 인스턴스를 찾을 수 없습니다.");
    return;
  }

  const book_barcode = (bookBarcodeInput?.value || "").trim();
  const isbn = (isbnInput?.value || "").trim();
  const title = (titleInput?.value || "").trim();
  const author = (authorInput?.value || "").trim();

  if (!book_barcode) {
    alert("도서 바코드를 입력해 주세요.");
    if (bookBarcodeInput) bookBarcodeInput.focus();
    return;
  }
  if (!/^[0-9]{3,20}$/.test(book_barcode)) {
    alert("도서 바코드는 숫자 3~20자리로 입력해 주세요.");
    if (bookBarcodeInput) bookBarcodeInput.focus();
    return;
  }
  if (!title) {
    alert("제목은 반드시 입력해야 합니다.");
    if (titleInput) titleInput.focus();
    return;
  }

  const payload = {
    author: author || null,
    book_barcode,
    door_no: currentLocation.door_no,
    isbn: isbn || null,
    location_code: currentLocation.location_code,
    location_updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    slot_no: currentLocation.slot_no,
    title,
    // 🔹 신규 필드
    info_confirmed: "N",
  };

  try {
    const ref = db.collection("books").doc(book_barcode);
    await ref.set(payload, { merge: false });

    appendLog(
      `[OK] 저장 완료 → 바코드 ${book_barcode}, 위치 ${currentLocation.location_code}, info_confirmed=N`
    );

    if (bookBarcodeInput) bookBarcodeInput.value = "";
    if (isbnInput) isbnInput.value = "";
    if (titleInput) titleInput.value = "";
    if (authorInput) authorInput.value = "";

    if (isbnInput) isbnInput.focus();
  } catch (e) {
    console.error(e);
    appendLog(`[ERROR] 저장 실패: ${e.message}`);
    alert("저장 중 오류가 발생했습니다. 콘솔 로그를 확인해 주세요.");
  }
}

if (saveBtn) {
  saveBtn.addEventListener("click", () => {
    handleSaveBook().catch((e) => {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    });
  });
}

if (bookBarcodeInput) {
  bookBarcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleSaveBook().catch((err) => {
        console.error(err);
        alert("저장 중 오류가 발생했습니다.");
      });
    }
  });
}

// =====================
// 8. 초기 포커스
// =====================
if (shelfInput) {
  shelfInput.focus();
}
