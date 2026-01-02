// bookmanager.js

console.log("bookmanager.js loaded");

/* ---------- Firebase 설정 (기존 값 그대로 입력) ---------- */

const firebaseConfig = {
  apiKey: "AIzaSyA_BkguverEd0Cz8XA24ktcAodk9TH-GeI",
  authDomain: "turtle-library-book-db.firebaseapp.com",
  projectId: "turtle-library-book-db",
  storageBucket: "turtle-library-book-db.firebasestorage.app",
  messagingSenderId: "611950738800",
  appId: "1:611950738800:web:7d9474d358c0a33bd6e3b5",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

/* ---------- DOM ---------- */

const bookInput       = document.getElementById("bookBarcodeInput");
const locationInput   = document.getElementById("locationInput");
const currentBookText = document.getElementById("currentBookText");
const statusEl        = document.getElementById("status");
const updateLog       = document.getElementById("updateLog");

let currentBookBarcode = "";

/* ---------- 상태 메시지 ---------- */

function setStatus(msg, type = "") {
  statusEl.textContent = msg || "";
  statusEl.className = "status";
  if (type === "ok") statusEl.classList.add("ok");
  if (type === "error") statusEl.classList.add("error");
}

/* ---------- 로그 출력 ---------- */

function addLogEntry(bookTitle, barcode, door_no, slot_no) {

  const now = new Date();

  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");

  const timeStr = `${yy}년 ${mm}월 ${dd}일 ${hh}시 ${mi}분`;

  const empty = updateLog.querySelector(".log-empty");
  if (empty) empty.remove();

  const line = document.createElement("div");
  line.textContent =
    `[${timeStr}] "${bookTitle}(${barcode})" → 문 ${door_no} / 칸 ${slot_no}`;

  updateLog.prepend(line);
}

/* ---------- 도서 바코드 입력 ---------- */

bookInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  const value = bookInput.value.trim();

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

/* ---------- 책장 바코드 입력 ---------- */

locationInput.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  const locationCode = locationInput.value.trim();

  if (!currentBookBarcode) {
    setStatus("먼저 도서 바코드를 스캔해 주세요.", "error");
    bookInput.focus();
    return;
  }

  if (!/^\d{5}$/.test(locationCode)) {
    setStatus("책장 바코드는 5자리 숫자여야 합니다. (예: 00109)", "error");
    locationInput.select();
    return;
  }

  // 🔥 필드명 = 기존 스키마에 맞춤
  const door_no = locationCode.slice(0, 3);
  const slot_no = locationCode.slice(3);

  try {

    /* 1) 기존 도큐먼트 조회 (제목 표시용) */

    const docRef = db.collection("books").doc(currentBookBarcode);
    const bookDoc = await docRef.get();

    let bookTitle = "(제목 없음)";
    if (bookDoc.exists && bookDoc.data().title) {
      bookTitle = bookDoc.data().title;
    }

    /* 2) 기존 필드 유지 + 위치 필드만 덮어쓰기 */

    await docRef.set(
      {
        door_no,
        slot_no,
        location_code: locationCode,
        location_updated_at: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }   // ✅ 기존 필드 유지 / 새 필드 추가 안 함
    );

    /* 3) 로그 출력 */

    addLogEntry(bookTitle, currentBookBarcode, door_no, slot_no);

    setStatus("업데이트 완료 — 다음 도서 바코드를 스캔하세요.", "ok");

    /* 4) 입력 초기화 */

    bookInput.value = "";
    locationInput.value = "";
    currentBookBarcode = "";
    currentBookText.textContent = "(없음)";
    bookInput.focus();

  } catch (err) {
    console.error(err);
    setStatus("DB 업데이트 중 오류 발생", "error");
  }
});

/* ---------- 초기 포커스 ---------- */

window.addEventListener("DOMContentLoaded", () => {
  bookInput.focus();
});
