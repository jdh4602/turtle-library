// bookmanager.js

console.log("bookmanager.js loaded"); // 로딩 여부 확인용

// ✅ 1) firebaseConfig 여기에 실제 값 그대로 넣기
// Firebase 콘솔 → Project settings → General → Web app 설정에서 나온 코드 복붙
const firebaseConfig = {
  apiKey: "AIzaSyA_BkguverEd0Cz8XA24ktcAodk9TH-GeI",
  authDomain: "turtle-library-book-db.firebaseapp.com",
  projectId: "turtle-library-book-db",
  storageBucket: "turtle-library-book-db.firebasestorage.app",
  messagingSenderId: "611950738800",
  appId: "1:611950738800:web:7d9474d358c0a33bd6e3b5"
};

// 2) Firebase 초기화
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 3) DOM 요소
const bookInput       = document.getElementById("bookBarcodeInput");
const locationInput   = document.getElementById("locationInput");
const currentBookText = document.getElementById("currentBookText");
const statusEl        = document.getElementById("status");
const updateLog       = document.getElementById("updateLog");

let currentBookBarcode = "";

// 4) 상태 메시지 표시
function setStatus(msg, type = "") {
  statusEl.textContent = msg || "";
  statusEl.className = "status";
  if (type === "ok") statusEl.classList.add("ok");
  if (type === "error") statusEl.classList.add("error");
}

// 5) 업데이트 로그 추가
// 형식: [YY년 MM월 DD일 HH시 MM분] "책 제목(바코드번호)" → 문 001 / 칸 09
function addLogEntry(bookTitle, barcode, doorNumber, shelfNumber) {
  const now = new Date();

  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");

  const timeStr = `${yy}년 ${mm}월 ${dd}일 ${hh}시 ${mi}분`;

  // 처음 로딩 시 표시되는 "로그 없음" 문구 제거
  const empty = updateLog.querySelector(".log-empty");
  if (empty) empty.remove();

  const line = document.createElement("div");
  line.textContent =
    `[${timeStr}] "${bookTitle}(${barcode})" → 문 ${doorNumber} / 칸 ${shelfNumber}`;

  // 최신 로그가 위로 오도록
  updateLog.prepend(line);
}

// 6) 도서 바코드 → 엔터: 현재 도서 설정 + 책장 바코드 입력칸으로 포커스
bookInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  const value = bookInput.value.trim();
  console.log("book enter:", value);

  if (!value) {
    setStatus("도서 바코드를 먼저 스캔해 주세요.", "error");
    return;
  }

  currentBookBarcode = value;
  currentBookText.textContent = value;
  setStatus("책장 바코드를 스캔해 주세요.", "ok");

  locationInput.focus();
  locationInput.select();
});

// 7) 책장 바코드 → 엔터: Firestore 위치 업데이트 + 로그 기록 + 다시 도서 바코드로 회귀
locationInput.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  const locationCode = locationInput.value.trim();
  console.log("location enter:", currentBookBarcode, locationCode);

  if (!currentBookBarcode) {
    setStatus("먼저 도서 바코드를 스캔해 주세요.", "error");
    bookInput.focus();
    bookInput.select();
    return;
  }
  if (!locationCode) {
    setStatus("책장 바코드를 입력해 주세요.", "error");
    return;
  }

  // 예: 00109 → 문 001 / 칸 09
  const doorNumber = locationCode.slice(0, 3);
  const shelfNumber = locationCode.slice(3);

  try {
    // 1) 책 제목 조회 (title 필드 기준)
    const bookDoc = await db
      .collection("books")
      .doc(currentBookBarcode)
      .get();

    let bookTitle = "(제목 없음)";
    if (bookDoc.exists) {
      const data = bookDoc.data();
      // 실제 필드명이 다르면 여기에서 data.bookTitle / data.name 등으로 교체
      if (data.title) {
        bookTitle = data.title;
      }
    }

    // 2) 위치 정보 업데이트
    await db
      .collection("books")
      .doc(currentBookBarcode)
      .set(
        {
          locationCode,
          doorNumber,
          shelfNumber,
          locationUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    // 3) 상태 메시지 + 로그 기록
    setStatus("위치 업데이트 완료 — 다음 도서 바코드를 스캔하세요.", "ok");
    addLogEntry(bookTitle, currentBookBarcode, doorNumber, shelfNumber);

    // 4) 다음 입력 준비
    bookInput.value = "";
    locationInput.value = "";
    currentBookBarcode = "";
    currentBookText.textContent = "(없음)";

    bookInput.focus();
  } catch (err) {
    console.error("Firestore error:", err);
    setStatus("업데이트 중 오류가 발생했습니다. (콘솔 확인)", "error");
  }
});

// 8) 첫 로딩 시 도서 바코드 input에 포커스
window.addEventListener("DOMContentLoaded", () => {
  if (bookInput) {
    bookInput.focus();
  }
});