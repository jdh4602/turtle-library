// =============================
// Firebase 초기화
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
const storage = firebase.storage();

// =============================
// DOM 참조
// =============================
const doorTableBody = document.getElementById("doorTableBody");
const loadStateEl = document.getElementById("loadState");
const filterSelect = document.getElementById("filterSelect");

// 상태
let doorList = [];
let doorMetaMap = {};
let currentFilter = "none"; // 기본: 이미지 없음


// =============================
// 문번호 / 책장 이미지 데이터 로드
// =============================
async function loadDoorData() {
  try {
    loadStateEl.textContent = "문 번호 목록을 불러오는 중...";

    // 1) books 컬렉션에서 door_no 목록 추출
    const booksSnap = await db.collection("books").get();
    const doorSet = new Set();

    booksSnap.forEach(doc => {
      const data = doc.data() || {};
      if (data.door_no) {
        doorSet.add(String(data.door_no));
      }
    });

    // 2) doors 컬렉션에서 메타데이터 조회
    const doorsSnap = await db.collection("doors").get();
    doorMetaMap = {};
    doorsSnap.forEach(doc => {
      doorMetaMap[doc.id] = doc.data() || {};
    });

    // 3) 문번호 정렬 (숫자 기준)
    doorList = Array.from(doorSet).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    renderDoorTable();

    loadStateEl.textContent =
      doorList.length > 0
        ? `총 ${doorList.length}개 문 번호를 불러왔습니다.`
        : "등록된 문 번호가 없습니다.";
  } catch (err) {
    console.error(err);
    loadStateEl.textContent = "오류가 발생했습니다. (콘솔 확인)";
  }
}


// =============================
// 테이블 렌더링
// =============================
function renderDoorTable() {
  doorTableBody.innerHTML = "";

  const filtered = doorList.filter(doorNo => {
    const meta = doorMetaMap[doorNo];
    const hasImage = !!(meta && meta.image_url);

    if (currentFilter === "has") return hasImage;
    if (currentFilter === "none") return !hasImage;
    return true; // all
  });

  filtered.forEach(doorNo => {
    const tr = document.createElement("tr");

    // 문 번호
    const tdDoor = document.createElement("td");
    tdDoor.className = "door-no";
    tdDoor.textContent = doorNo;

    // 위치 이미지 (링크 or 없음)
    const tdStatus = document.createElement("td");
    const meta = doorMetaMap[doorNo];
    const hasImage = !!(meta && meta.image_url);

    if (hasImage) {
      const filePath = meta.storage_path || "";
      const fileName = filePath.split("/").pop() || "이미지 파일";

      const link = document.createElement("a");
      link.href = meta.image_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = fileName;
      link.className = "file-link";

      tdStatus.appendChild(link);
    } else {
      const span = document.createElement("span");
      span.className = "status status-none";
      span.textContent = "이미지 없음";
      tdStatus.appendChild(span);
    }

    // 파일 등록 / 이미지 삭제 버튼
    const tdAction = document.createElement("td");
    tdAction.className = "action-cell";

    const uploadBtn = document.createElement("button");
    uploadBtn.textContent = "파일 등록";
    uploadBtn.className = "btn btn-upload";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";

    uploadBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;

      uploadBtn.disabled = true;
      uploadBtn.textContent = "업로드 중...";

      try {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `doors/${doorNo}.${ext}`;
        const ref = storage.ref().child(path);

        // 업로드 (같은 경로면 덮어쓰기)
        await ref.put(file);
        const url = await ref.getDownloadURL();

        // doors 컬렉션에 기록
        await db.collection("doors").doc(doorNo).set(
          {
            door_no: doorNo,
            image_url: url,
            storage_path: path,
            updated_at: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // 로컬 캐시 갱신
        doorMetaMap[doorNo] = {
          ...(doorMetaMap[doorNo] || {}),
          image_url: url,
          storage_path: path,
        };

        renderDoorTable();
      } catch (err) {
        console.error(err);
        alert("파일 업로드 중 오류가 발생했습니다. (콘솔 확인)");
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "파일 등록";
        fileInput.value = "";
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "이미지 삭제";
    deleteBtn.className = "btn btn-danger";
    deleteBtn.disabled = !hasImage;

    deleteBtn.addEventListener("click", async () => {
      const metaForDelete = doorMetaMap[doorNo];
      const hasImageNow = !!(metaForDelete && metaForDelete.image_url);
      if (!hasImageNow) return;

      const ok = window.confirm(
        `문 번호 ${doorNo}의 책장 이미지를 삭제하시겠습니까?`
      );
      if (!ok) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = "삭제 중...";

      try {
        // Storage 파일 삭제 (경로가 있을 때만)
        try {
          if (metaForDelete && metaForDelete.storage_path) {
            const ref = storage.ref().child(metaForDelete.storage_path);
            await ref.delete();
          }
        } catch (storageErr) {
          // 파일이 없어도 크게 문제는 아니니까 콘솔만 남김
          console.warn("Storage 삭제 중 오류 (무시 가능):", storageErr);
        }

        // Firestore 필드 제거
        await db
          .collection("doors")
          .doc(doorNo)
          .set(
            {
              door_no: doorNo,
              image_url: firebase.firestore.FieldValue.delete(),
              storage_path: firebase.firestore.FieldValue.delete(),
              updated_at: firebase.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

        // 로컬 캐시 갱신
        if (!doorMetaMap[doorNo]) {
          doorMetaMap[doorNo] = { door_no: doorNo };
        }
        delete doorMetaMap[doorNo].image_url;
        delete doorMetaMap[doorNo].storage_path;

        renderDoorTable();
      } catch (err) {
        console.error(err);
        alert("이미지 삭제 중 오류가 발생했습니다. (콘솔 확인)");
        deleteBtn.disabled = false;
        deleteBtn.textContent = "이미지 삭제";
      }
    });

    tdAction.appendChild(uploadBtn);
    tdAction.appendChild(deleteBtn);
    tdAction.appendChild(fileInput);

    tr.appendChild(tdDoor);
    tr.appendChild(tdStatus);
    tr.appendChild(tdAction);

    doorTableBody.appendChild(tr);
  });
}


// =============================
// 이벤트
// =============================
filterSelect.addEventListener("change", e => {
  currentFilter = e.target.value;
  renderDoorTable();
});

// 초기 로딩
loadDoorData();
