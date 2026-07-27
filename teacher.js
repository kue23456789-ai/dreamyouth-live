<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#1226C9" />
  <meta name="robots" content="noindex, nofollow" />
  <title>DREAM YOUTH · 교육목자 자료실</title>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap" rel="stylesheet" />
  <link rel="stylesheet" as="style" crossorigin
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />

  <link rel="stylesheet" href="style.css" />
  <link rel="stylesheet" href="admin.css" />
  <link rel="stylesheet" href="teacher.css" />
</head>
<body class="admin-body">

  <header class="admin-header">
    <span class="brand">DREAM YOUTH</span>
    <span class="admin-tag">교육목자</span>
  </header>

  <main class="admin-main">

    <!-- 이름 입력 화면 -->
    <section id="gateView" class="admin-card">
      <h1 class="admin-h1">교육목자 자료실</h1>
      <p class="admin-desc">선생님 성함을 입력하고 들어와주세요.</p>

      <label class="admin-label">이름</label>
      <input id="nameInput" class="admin-input" type="text" placeholder="예: 김OO" />

      <button id="btnEnter" class="admin-btn admin-btn-primary" style="margin-top:14px;">들어가기</button>
    </section>

    <!-- 자료 화면 -->
    <div id="contentView" class="hidden">
      <p id="welcomeMsg" class="admin-desc" style="margin-bottom:14px;"></p>
      <div id="weekList"></div>
    </div>

  </main>

  <script src="teacher.js"></script>
</body>
</html>
