// =============================
// 0. Firebase 초기화
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
// 1. DOM
// =============================
const searchTypeEl = document.getElementById("searchType");
const searchKeywordEl = document.getElementById("searchKeyword");
const resultAreaEl = document.getElementById("resultArea");
const shelfInputEl = document.getElementById("shelfInput");
const logBox = document.getElementById("log");

let selectedBook = null;


// =============================
// 2. 로그 & 유틸
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
  logBox.value = `${line}\n` + logBox.value;
}

function logError(msg) {
  log(`${getTimeTag()} [ERROR] - ${msg}`);
}

// 제목/검색어 인덱스용 normalize (소문자 + 공백제거)
function normalizeForIndex(str) {
  return String(str || "").toLowerCase().replace(/\s+/g, "");
}


// =============================
// 3. 검색
// =============================
async function searchBooks() {
  const type = searchTypeEl.value;
  const keywordRaw = (searchKeywordEl.value || "").trim();

  if (!keywordRaw) {
    resultAreaEl.innerHTML =
      `<div class="result-empty">검색어를 입력해주세요.</div>`;
    selectedBook = null;
    return;
  }

  // 제목 검색: 최소 2글자
  if (type === "title") {
    const normKey = normalizeForIndex(keywordRaw);
    if (normKey.length < 2) {
      logError("제목 검색은 2글자 이상으로 검색해주세요!");
      resultAreaEl.innerHTML =
        `<div class="result-empty">제목 검색은 2글자 이상 입력해야 합니다.</div>`;
      selectedBook = null;
      return;
    }

    // 1차: 정식 인덱스(title_index) 기반 검색
    let rows = [];
    try {
      const snapIndex = await db
        .collection("books")
        .where("title_index", "array-contains", normKey)
        .limit(50)
        .get();

      snapIndex.forEach((doc) => {
        const d = doc.data();
        rows.push({
          docId: doc.id,
          title: d.title || "",
          author: d.author || "",
          book_barcode: d.book_barcode || "",
          door_no: d.door_no || "",
          slot_no: d.slot_no || "",
          location_code: d.location_code || "",
        });
      });
    } catch (e) {
      console.error("title_index 검색 오류:", e);
    }

    // 인덱스로 0건일 경우 → 구형 방식 fallback (prefix + includes)
    if (rows.length === 0) {
      try {
        const start = keywordRaw;
        const end = keywordRaw + "\uf8ff";

        const snapLegacy = await db
          .collection("books")
          .orderBy("title")
          .startAt(start)
          .endAt(end)
          .limit(200)
          .get();

        const normKeyLegacy = normalizeForIndex(keywordRaw);

        snapLegacy.forEach((doc) => {
          const d = doc.data();
          const title = d.title || "";
          const normTitle = normalizeForIndex(title);

          if (normTitle.includes(normKeyLegacy)) {
            rows.push({
              docId: doc.id,
              title,
              author: d.author || "",
              book_barcode: d.book_barcode || "",
              door_no: d.door_no || "",
              slot_no: d.slot_no || "",
              location_code: d.location_code || "",
            });
          }
        });
      } catch (e) {
        console.error("legacy 제목검색 오류:", e);
        logError("제목 검색 중 오류가 발생했습니다: " + e.message);
      }
    }

    if (rows.length === 0) {
      resultAreaEl.innerHTML =
        `<div class="result-empty">검색 결과가 없습니다.</div>`;
      selectedBook = null;
      return;
    }

    renderResultTable(rows);
    selectedBook = null;
    return;
  }

  // ==========================
  // 바코드 검색 (기존 방식)
  // ==========================
  try {
    const snap = await db
      .collection("books")
      .where("book_barcode", "==", keywordRaw)
      .limit(20)
      .get();

    if (snap.empty) {
      resultAreaEl.innerHTML =
        `<div class="result-empty">검색 결과가 없습니다.</div>`;
      selectedBook = null;
      return;
    }

    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data();
      rows.push({
        docId: doc.id,
        title: d.title || "",
        author: d.author || "",
        book_barcode: d.book_barcode || "",
        door_no: d.door_no || "",
        slot_no: d.slot_no || "",
        location_code: d.location_code || "",
      });
    });

    renderResultTable(rows);

    if (rows.length === 1) {
      selectRowByDocId(rows[0].docId);
    } else {
      selectedBook = null;
    }
  } catch (e) {
    console.error(e);
    logError("검색 중 오류가 발생했습니다: " + e.message);
  }
}


// =============================
// 4. 검색 결과 테이블
// =============================
function renderResultTable(rows) {
  const table = document.createElement("table");
  table.className = "result-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:40%;">제목</th>
        <th style="width:22%;">저자</th>
        <th style="width:18%;">바코드</th>
        <th style="width:20%;">현재 위치</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement("tbody");

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = "result-row";
    tr.dataset.docId = row.docId;

    let locText = "미등록";
    if (row.location_code) {
      const d = String(parseInt(row.door_no || "0", 10));
      const s = String(parseInt(row.slot_no || "0", 10));
      locText = `${d}번문 ${s}번칸`;
    }

    tr.innerHTML = `
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.author)}</td>
      <td>${escapeHtml(row.book_barcode)}</td>
      <td>${escapeHtml(locText)}</td>
    `;

    tr.addEventListener("click", () => selectRow(tr, row));

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  resultAreaEl.innerHTML = "";
  resultAreaEl.appendChild(table);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// =============================
// 5. 검색결과 선택
// =============================
function selectRow(tr, rowData) {
  document
    .querySelectorAll(".result-row.selected")
    .forEach((el) => el.classList.remove("selected"));

  tr.classList.add("selected");
  selectedBook = { ...rowData };

  // 선택 시 로그는 남기지 않음
  shelfInputEl.focus();
}

function selectRowByDocId(docId) {
  const tr = document.querySelector(`.result-row[data-doc-id="${docId}"]`);
  if (tr) tr.click();
}


// =============================
// 6. 위치 업데이트
// =============================
async function updateLocationByShelfScan() {
  const code = (shelfInputEl.value || "").trim();

  if (!selectedBook) {
    logError("위치를 변경할 도서가 선택되지 않았습니다.");
    return;
  }

  if (!/^[0-9]{5}$/.test(code)) {
    logError(`잘못된 책장코드: ${code}`);
    return;
  }

  const newDoor = code.slice(0, 3);
  const newSlot = code.slice(3);

  const newDoorNum = String(parseInt(newDoor, 10));
  const newSlotNum = String(parseInt(newSlot, 10));

  const docId = selectedBook.docId;

  // 이전 위치 (로그에서는 [ ] 포함)
  let fromText = "[미등록]";
  if (selectedBook.location_code) {
    const prevDoor = String(parseInt(selectedBook.door_no || "0", 10));
    const prevSlot = String(parseInt(selectedBook.slot_no || "0", 10));
    fromText = `[${prevDoor}번문 ${prevSlot}번칸]`;
  }

  const toText = `[${newDoorNum}번문 ${newSlotNum}번칸]`;

  try {
    await db.collection("books").doc(docId).update({
      location_code: code,
      door_no: newDoor,
      slot_no: newSlot,
      location_updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });

    selectedBook.door_no = newDoor;
    selectedBook.slot_no = newSlot;
    selectedBook.location_code = code;

    log(
      `${getTimeTag()} [위치변경성공] - ` +
        `${selectedBook.title} (${selectedBook.book_barcode}) | ${fromText} → ${toText}`
    );

    shelfInputEl.value = "";
    searchBooks();
  } catch (e) {
    console.error(e);
    logError("위치 변경 중 오류가 발생했습니다: " + e.message);
  }
}


// =============================
// 7. 이벤트 바인딩
// =============================
searchKeywordEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchBooks();
});

searchTypeEl.addEventListener("change", () => {
  searchKeywordEl.focus();
});

shelfInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") updateLocationByShelfScan();
});

// 첫 진입 시 기본 포커스
searchKeywordEl.focus();
