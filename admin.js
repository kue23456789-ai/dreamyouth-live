<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#1226C9" />
  <meta name="robots" content="noindex, nofollow" />
  <title>DREAM YOUTH · 관리자</title>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap" rel="stylesheet" />
  <link rel="stylesheet" as="style" crossorigin
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />

  <link rel="stylesheet" href="style.css" />
  <link rel="stylesheet" href="admin.css" />
</head>
<body class="admin-body">

  <header class="admin-header">
    <span class="brand">DREAM YOUTH</span>
    <span class="admin-tag">ADMIN</span>
  </header>

  <main class="admin-main">

    <!-- 로딩 안내 -->
    <section id="loadingView" class="admin-card">
      <h1 class="admin-h1">불러오는 중…</h1>
      <p class="admin-desc" id="loadingMsg">현재 사이트의 데이터를 불러오고 있어요.</p>
    </section>

    <!-- 편집 화면 -->
    <div id="editView" class="hidden">

      <div class="admin-card" style="background:#fff8e6; border-color:#ffe4a3;">
        <p class="admin-desc" style="color:#8a5a00; margin-bottom:0;">
          💡 이 페이지는 파일을 <b>다운로드</b>하는 방식이에요. 수정 후 저장 버튼을 누르면 파일이 다운로드되고,
          그 파일을 GitHub 저장소에 <b>드래그해서 다시 올리면(Add file → Upload files → Commit)</b> 사이트에 반영돼요.
        </p>
      </div>

      <!-- 빠른 진행 제어 (예배 중 가장 많이 씀) -->
      <section class="admin-card admin-card-highlight">
        <h2 class="admin-h2">🔴 지금 진행 중인 순서</h2>
        <p class="admin-desc">버튼을 누르면 data.json 파일이 바로 다운로드돼요. GitHub에 다시 올리면 반영됩니다.</p>
        <div id="liveButtons" class="live-btn-grid"></div>
        <button id="btnLiveOff" class="admin-btn admin-btn-ghost">예배 시작 전으로 되돌리기</button>
      </section>

      <!-- 탭 -->
      <nav class="admin-tabs" id="adminTabs">
        <button class="admin-tab active" data-tab="worship">예배 정보</button>
        <button class="admin-tab" data-tab="order">예배 순서</button>
        <button class="admin-tab" data-tab="songs">찬양 리스트</button>
        <button class="admin-tab" data-tab="notices">공지사항</button>
        <button class="admin-tab" data-tab="servants">섬김 명단</button>
        <button class="admin-tab" data-tab="teacher">교육목자 자료</button>
      </nav>

      <!-- 예배 정보 -->
      <section class="admin-card admin-panel" data-panel="worship">
        <label class="admin-label">예배 제목</label>
        <input id="wTitle" class="admin-input" />

        <label class="admin-label">오늘의 핵심 메시지</label>
        <textarea id="wMessage" class="admin-textarea" rows="2"></textarea>

        <label class="admin-label">본문 말씀</label>
        <input id="wVerse" class="admin-input" placeholder="예: 이사야 56:7" />

        <label class="admin-label">설교자</label>
        <input id="wPreacher" class="admin-input" placeholder="예: 김규호 전도사" />
      </section>

      <!-- 예배 순서 -->
      <section class="admin-card admin-panel hidden" data-panel="order">
        <div id="orderRows"></div>
        <button class="admin-btn admin-btn-add" data-add="order">+ 순서 추가</button>
      </section>

      <!-- 찬양 리스트 -->
      <section class="admin-card admin-panel hidden" data-panel="songs">
        <div id="songRows"></div>
        <button class="admin-btn admin-btn-add" data-add="songs">+ 찬양 추가</button>
      </section>

      <!-- 공지사항 -->
      <section class="admin-card admin-panel hidden" data-panel="notices">
        <div id="noticeRows"></div>
        <button class="admin-btn admin-btn-add" data-add="notices">+ 공지 추가</button>
      </section>

      <!-- 섬김 명단 -->
      <section class="admin-card admin-panel hidden" data-panel="servants">
        <div id="servantWeeks"></div>
        <button class="admin-btn admin-btn-add" data-add="servants">+ 주차 추가</button>
      </section>

      <!-- 교육목자 자료 (선생님 전용 페이지) -->
      <section class="admin-card admin-panel hidden" data-panel="teacher">
        <h2 class="admin-h2">🔒 선생님 전용 페이지 설정</h2>
        <p class="admin-desc">
          여기서 편집한 내용은 학생용 메인 화면이 아니라 <b>선생님 전용 페이지(teacher.html)</b>에만 보여요.
          선생님들은 이름만 입력하면 바로 볼 수 있어요 (별도 비밀번호 없음).
        </p>

        <div id="teacherWeeks" style="margin-top:18px;"></div>
        <button id="btnAddTeacherWeek" class="admin-btn admin-btn-add">+ 새 주차 추가</button>

        <button id="btnSaveTeacher" class="admin-btn admin-btn-primary" style="margin-top:16px;">teacher-data.json 다운로드</button>
        <p id="teacherSaveMsg" class="admin-desc" style="margin-top:6px;"></p>
      </section>

    </div>
  </main>

  <!-- 하단 고정 저장 바 -->
  <div id="saveBar" class="save-bar hidden">
    <span id="saveStatus" class="save-status">저장되지 않은 변경사항이 있어요</span>
    <button id="btnSaveAll" class="admin-btn admin-btn-primary">data.json 다운로드</button>
  </div>

  <script src="admin.js"></script>
</body>
</html>
