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
const confirmFilterEl = document.getElementById("confirmFilter");
const resultAreaEl = document.getElementById("resultArea");

const detailBarcodeEl = document.getElementById("detailBarcode");
const detailIsbnEl = document.getElementById("detailIsbn");
const detailTitleEl = document.getElementById("detailTitle");
const detailAuthorEl = document.getElementById("detailAuthor");
const detailLocationEl = document.getElementById("detailLocation");
const detailConfirmEl = document.getElementById("detailConfirm");

const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("deleteBtn");

const logBox = document.getElementById("log");

// 선택된 도서
let selectedBook = null;

// 검색 결과/페이지네이션 상태
let currentRows = [];
let currentPage = 1;
const PAGE_SIZE = 50;
const MAX_RESULTS = 2000; // 한 번의 검색에서 최대 가져오는 문서 수


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

// 검색 인덱스용 normalize
function normalizeForIndex(str) {
  return String(str || "").toLowerCase().replace(/\s+/g, "");
}

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

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// =============================
// 3. 검색
// =============================
async function searchBooks() {
  const type = searchTypeEl.value;
  const keywordRaw = (searchKeywordEl.value || "").trim();
  const filterVal = confirmFilterEl.value; // all / confirmed / unconfirmed

  let rows = [];

  try {
    if (type === "title") {
      rows = await searchByTitle(keywordRaw);
    } else if (type === "author") {
      rows = await searchByAuthor(keywordRaw);
    } else {
      rows = await searchByBarcode(keywordRaw);
    }
  } catch (e) {
    console.error(e);
    logError("검색 중 오류가 발생했습니다: " + e.message);
    return;
  }

  // info_confirmed 필터
  const filtered = rows.filter(row => {
    const c = row.info_confirmed === "Y" ? "Y" : "N";
    if (filterVal === "confirmed") {
      return c === "Y";
    }
    if (filterVal === "unconfirmed") {
      return c === "N";
    }
    return true; // 전체
  });

  currentRows = filtered;
  currentPage = 1;
  selectedBook = null;
  clearDetail();

  renderCurrentPage();
}

async function searchByTitle(keywordRaw) {
  const rows = [];
  const normKey = normalizeForIndex(keywordRaw);

  // 1) 검색어 없음 → 전체 조회 (타이틀 기준 정렬, 상한 MAX_RESULTS)
  if (!keywordRaw) {
    const snap = await db
      .collection("books")
      .orderBy("title")
      .limit(MAX_RESULTS)
      .get();

    snap.forEach(doc => {
      const d = doc.data();
      rows.push({
        docId: doc.id,
        title: d.title || "",
        author: d.author || "",
        book_barcode: d.book_barcode || "",
        isbn: d.isbn || "",
        door_no: d.door_no || "",
        slot_no: d.slot_no || "",
        location_code: d.location_code || "",
        info_confirmed: d.info_confirmed || "N",
      });
    });

    return rows;
  }

  // 2) 검색어 길이 >= 2 → title_index 사용
  if (normKey.length >= 2) {
    try {
      const snapIndex = await db
        .collection("books")
        .where("title_index", "array-contains", normKey)
        .limit(MAX_RESULTS)
        .get();

      snapIndex.forEach(doc => {
        const d = doc.data();
        rows.push({
          docId: doc.id,
          title: d.title || "",
          author: d.author || "",
          book_barcode: d.book_barcode || "",
          isbn: d.isbn || "",
          door_no: d.door_no || "",
          slot_no: d.slot_no || "",
          location_code: d.location_code || "",
          info_confirmed: d.info_confirmed || "N",
        });
      });

      return rows;
    } catch (e) {
      console.error("title_index 검색 오류:", e);
      // 아래 legacy 로 폴백
    }
  }

  // 3) 검색어 길이 1 또는 index 실패 → legacy (prefix + includes)
  const start = keywordRaw;
  const end = keywordRaw + "\uf8ff";

  const snapLegacy = await db
    .collection("books")
    .orderBy("title")
    .startAt(start)
    .endAt(end)
    .limit(MAX_RESULTS)
    .get();

  snapLegacy.forEach(doc => {
    const d = doc.data();
    const title = d.title || "";
    const normTitle = normalizeForIndex(title);

    if (!normKey || normTitle.includes(normKey)) {
      rows.push({
        docId: doc.id,
        title,
        author: d.author || "",
        book_barcode: d.book_barcode || "",
        isbn: d.isbn || "",
        door_no: d.door_no || "",
        slot_no: d.slot_no || "",
        location_code: d.location_code || "",
        info_confirmed: d.info_confirmed || "N",
      });
    }
  });

  return rows;
}

async function searchByAuthor(keywordRaw) {
  const rows = [];
  const normKey = normalizeForIndex(keywordRaw);

  // 검색어 없음 → author 기준 전체 조회
  if (!keywordRaw) {
    const snap = await db
      .collection("books")
      .orderBy("author")
      .limit(MAX_RESULTS)
      .get();

    snap.forEach(doc => {
      const d = doc.data();
      rows.push({
        docId: doc.id,
        title: d.title || "",
        author: d.author || "",
        book_barcode: d.book_barcode || "",
        isbn: d.isbn || "",
        door_no: d.door_no || "",
        slot_no: d.slot_no || "",
        location_code: d.location_code || "",
        info_confirmed: d.info_confirmed || "N",
      });
    });

    return rows;
  }

  // 검색어 있음 → prefix + includes 방식
  const start = keywordRaw;
  const end = keywordRaw + "\uf8ff";

  const snap = await db
    .collection("books")
    .orderBy("author")
    .startAt(start)
    .endAt(end)
    .limit(MAX_RESULTS)
    .get();

  snap.forEach(doc => {
    const d = doc.data();
    const author = d.author || "";
    const normAuthor = normalizeForIndex(author);

    if (!normKey || normAuthor.includes(normKey)) {
      rows.push({
        docId: doc.id,
        title: d.title || "",
        author,
        book_barcode: d.book_barcode || "",
        isbn: d.isbn || "",
        door_no: d.door_no || "",
        slot_no: d.slot_no || "",
        location_code: d.location_code || "",
        info_confirmed: d.info_confirmed || "N",
      });
    }
  });

  return rows;
}

async function searchByBarcode(keywordRaw) {
  const rows = [];

  if (!keywordRaw) {
    // 바코드 검색인데 검색어 없으면 결과 없음 처리
    return rows;
  }

  const snap = await db
    .collection("books")
    .where("book_barcode", "==", keywordRaw)
    .limit(MAX_RESULTS)
    .get();

  snap.forEach(doc => {
    const d = doc.data();
    rows.push({
      docId: doc.id,
      title: d.title || "",
      author: d.author || "",
      book_barcode: d.book_barcode || "",
      isbn: d.isbn || "",
      door_no: d.door_no || "",
      slot_no: d.slot_no || "",
      location_code: d.location_code || "",
      info_confirmed: d.info_confirmed || "N",
    });
  });

  return rows;
}


// =============================
// 4. 검색결과 테이블 + 페이지네이션
// =============================
function renderCurrentPage() {
  const total = currentRows.length;

  if (total === 0) {
    resultAreaEl.innerHTML =
      `<div class="result-empty">검색 결과가 없습니다.</div>`;
    return;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageRows = currentRows.slice(start, end);

  const table = buildResultTable(pageRows);
  const pager = buildPager(totalPages);

  const wrapper = document.createElement("div");
  wrapper.appendChild(table);
  wrapper.appendChild(pager);

  resultAreaEl.innerHTML = "";
  resultAreaEl.appendChild(wrapper);
}

function buildResultTable(rows) {
  const table = document.createElement("table");
  table.className = "result-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:34%;">제목</th>
        <th style="width:20%;">저자</th>
        <th style="width:14%;">정보 상태</th>
        <th style="width:16%;">바코드</th>
        <th style="width:16%;">현재 위치</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement("tbody");

  rows.forEach(row => {
    const tr = document.createElement("tr");
    tr.className = "result-row";
    tr.dataset.docId = row.docId;

    let locText = "미등록";
    if (row.location_code) {
      const d = String(parseInt(row.door_no || "0", 10));
      const s = String(parseInt(row.slot_no || "0", 10));
      locText = `${d}번문 ${s}번칸`;
    }

    const confirmed = row.info_confirmed === "Y";
    const statusLabel = confirmed ? "정보 확정" : "정보 미확정";
    const statusClass = confirmed ? "confirmed" : "unconfirmed";

    tr.innerHTML = `
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.author)}</td>
      <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      <td>${escapeHtml(row.book_barcode)}</td>
      <td>${escapeHtml(locText)}</td>
    `;

    tr.addEventListener("click", () => {
      selectRow(tr, row);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  return table;
}

function buildPager(totalPages) {
  const nav = document.createElement("div");
  nav.className = "pagination";

  if (totalPages <= 1) {
    return nav;
  }

  function addBtn(label, page, disabled, active) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = "page-btn";
    if (disabled) btn.classList.add("disabled");
    if (active) btn.classList.add("active");
    btn.addEventListener("click", () => {
      if (disabled) return;
      currentPage = page;
      renderCurrentPage();
    });
    nav.appendChild(btn);
  }

  const total = totalPages;
  const cur = currentPage;

  addBtn("<<", 1, cur === 1, false);
  addBtn("<", cur - 1, cur === 1, false);

  const maxPagesToShow = 5;
  let start = Math.max(1, cur - 2);
  let end = Math.min(total, start + maxPagesToShow - 1);
  start = Math.max(1, end - maxPagesToShow + 1);

  for (let p = start; p <= end; p++) {
    addBtn(String(p), p, false, p === cur);
  }

  addBtn(">", cur + 1, cur === total, false);
  addBtn(">>", total, cur === total, false);

  return nav;
}

function selectRow(tr, rowData) {
  document
    .querySelectorAll(".result-row.selected")
    .forEach(el => el.classList.remove("selected"));

  tr.classList.add("selected");
  selectedBook = { ...rowData };

  fillDetailFromSelected();
}


// =============================
// 5. 상세 정보 패널
// =============================
function clearDetail() {
  detailBarcodeEl.value = "";
  detailIsbnEl.value = "";
  detailTitleEl.value = "";
  detailAuthorEl.value = "";
  detailLocationEl.value = "";
  detailConfirmEl.value = "N";
}

function fillDetailFromSelected() {
  if (!selectedBook) {
    clearDetail();
    return;
  }

  detailBarcodeEl.value = selectedBook.book_barcode || "";
  detailIsbnEl.value = selectedBook.isbn || "";
  detailTitleEl.value = selectedBook.title || "";
  detailAuthorEl.value = selectedBook.author || "";
  detailLocationEl.value = selectedBook.location_code || "";

  const c = selectedBook.info_confirmed === "Y" ? "Y" : "N";
  detailConfirmEl.value = c;
}


// =============================
// 6. 도서 정보 저장 (제목/저자/위치/정보상태)
// =============================
async function saveBookInfo() {
  if (!selectedBook) {
    logError("수정할 도서가 선택되지 않았습니다.");
    return;
  }

  const newTitle = (detailTitleEl.value || "").trim();
  const newAuthor = (detailAuthorEl.value || "").trim();
  const newLocCodeRaw = (detailLocationEl.value || "").trim();
  let newConfirm = (detailConfirmEl.value || "N");

  if (!newTitle) {
    logError("제목은 비워둘 수 없습니다.");
    detailTitleEl.focus();
    return;
  }

  const oldTitle = selectedBook.title || "";
  const oldAuthor = selectedBook.author || "";
  const oldLocCode = selectedBook.location_code || "";
  const oldConfirm = selectedBook.info_confirmed === "Y" ? "Y" : "N";

  const titleChanged = newTitle !== oldTitle;
  const authorChanged = newAuthor !== oldAuthor;

  let locationChanged = false;
  let fromLocText = "";
  let toLocText = "";

  let confirmChanged = newConfirm !== oldConfirm;

  let updateData = {
    title: newTitle,
    author: newAuthor || null,
    title_index: buildTitleIndex(newTitle),
  };

  // 위치 변경 처리 (빈 값이면 위치 변경 안 하는 것으로 간주)
  if (newLocCodeRaw) {
    if (!/^[0-9]{5}$/.test(newLocCodeRaw)) {
      logError("책장바코드는 5자리 숫자로 입력해주세요.");
      detailLocationEl.focus();
      return;
    }

    if (newLocCodeRaw !== oldLocCode) {
      const newDoor = newLocCodeRaw.slice(0, 3);
      const newSlot = newLocCodeRaw.slice(3);

      const newDoorNum = String(parseInt(newDoor, 10));
      const newSlotNum = String(parseInt(newSlot, 10));

      if (oldLocCode) {
        const oldDoorNum = String(parseInt(selectedBook.door_no || "0", 10));
        const oldSlotNum = String(parseInt(selectedBook.slot_no || "0", 10));
        fromLocText = `[${oldDoorNum}번문 ${oldSlotNum}번칸]`;
      } else {
        fromLocText = "[미등록]";
      }

      toLocText = `[${newDoorNum}번문 ${newSlotNum}번칸]`;

      updateData.location_code = newLocCodeRaw;
      updateData.door_no = newDoor;
      updateData.slot_no = newSlot;
      updateData.location_updated_at =
        firebase.firestore.FieldValue.serverTimestamp();

      locationChanged = true;
    }
  }

  // 여기서 "수정되었으면 정보확정으로 바꿀래?" 팝업
  const anyDataChanged = titleChanged || authorChanged || locationChanged;
  if (anyDataChanged && !confirmChanged && newConfirm === "N") {
    const ok = window.confirm(
      "도서 정보가 수정되었습니다.\n이 도서를 '정보 확정' 상태로 변경할까요?"
    );
    if (ok) {
      newConfirm = "Y";
      confirmChanged = newConfirm !== oldConfirm;
      detailConfirmEl.value = "Y";
    }
  }

  if (confirmChanged) {
    updateData.info_confirmed = newConfirm;
  }

  if (!titleChanged && !authorChanged && !locationChanged && !confirmChanged) {
    log(`${getTimeTag()} [INFO] - 변경된 내용이 없습니다.`);
    return;
  }

  const docId = selectedBook.docId;

  try {
    await db.collection("books").doc(docId).update(updateData);

    // selectedBook 갱신
    selectedBook.title = newTitle;
    selectedBook.author = newAuthor;
    if (locationChanged) {
      selectedBook.location_code = newLocCodeRaw;
      selectedBook.door_no = newLocCodeRaw.slice(0, 3);
      selectedBook.slot_no = newLocCodeRaw.slice(3);
    }
    if (confirmChanged) {
      selectedBook.info_confirmed = newConfirm;
    }

    // 변경된 항목만 로그에 포함
    const changes = [];

    if (titleChanged) {
      changes.push(`제목: ${oldTitle} → ${newTitle}`);
    }

    if (authorChanged) {
      changes.push(`저자: ${oldAuthor || "-"} → ${newAuthor || "-"}`);
    }

    if (locationChanged) {
      changes.push(`위치: ${fromLocText} → ${toLocText}`);
    }

    if (confirmChanged) {
      const oldLabel = oldConfirm === "Y" ? "정보 확정" : "정보 미확정";
      const newLabel = newConfirm === "Y" ? "정보 확정" : "정보 미확정";
      changes.push(`정보상태: ${oldLabel} → ${newLabel}`);
    }

    const changeText = changes.join(" | ");

    log(
      `${getTimeTag()} [정보수정성공] - 바코드 ${selectedBook.book_barcode} | ${changeText}`
    );

    // 다시 검색해서 목록 갱신
    searchBooks();
  } catch (e) {
    console.error(e);
    logError("도서 정보 저장 중 오류가 발생했습니다: " + e.message);
  }
}


// =============================
// 7. 도서 삭제
// =============================
async function deleteBook() {
  if (!selectedBook) {
    logError("삭제할 도서가 선택되지 않았습니다.");
    return;
  }

  const barcode = selectedBook.book_barcode;
  const title = selectedBook.title || "";

  const ok = window.confirm(
    `정말 삭제하시겠습니까?\n\n바코드: ${barcode}\n제목: ${title}`
  );
  if (!ok) return;

  try {
    await db.collection("books").doc(selectedBook.docId).delete();

    log(
      `${getTimeTag()} [삭제성공] - 바코드 ${barcode} | 제목: ${title}`
    );

    selectedBook = null;
    clearDetail();
    searchBooks();
  } catch (e) {
    console.error(e);
    logError("도서 삭제 중 오류가 발생했습니다: " + e.message);
  }
}


// =============================
// 8. 이벤트 바인딩
// =============================
searchKeywordEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchBooks();
});

searchTypeEl.addEventListener("change", () => {
  searchKeywordEl.focus();
});

confirmFilterEl.addEventListener("change", () => {
  searchBooks();
});

saveBtn.addEventListener("click", saveBookInfo);
deleteBtn.addEventListener("click", deleteBook);

// 페이지 진입 시 검색창에 포커스
searchKeywordEl.focus();
