# 스쿨처치 방문 신청 API (Cloudflare Worker + D1)

## 로컬 실행

```bash
cd schoolchurch-api
npm install
npm run dev     # API  http://localhost:8787  (.dev.vars 자동 생성, 로컬 DB 마이그레이션)
npm run site    # 사이트 http://localhost:8000/school-church.html  (다른 터미널)
npm test        # API 점검 (dev 실행 중)
```

- 관리 화면: http://localhost:8000/school-church-admin.html (개발 비밀번호 `dev-admin-1234`)
- `.dev.vars`의 `DEV_PREVIEW=1` 때문에 개발 중에는 달력에 ‘예시’ 일정이 섞여 보여요. 운영에는 이 값을 넣지 않아요.

## 운영 배포

```bash
npx wrangler login
npx wrangler d1 create dreamyouth-schoolchurch   # 출력된 database_id → wrangler.toml
npm run db:remote                                 # 테이블 생성
npx wrangler secret put ADMIN_PASSWORD            # 전도사님 로그인 비밀번호
npx wrangler secret put SESSION_SECRET            # 임의의 긴 문자열 (예: openssl rand -hex 32)
npm run deploy
```

배포 후 출력된 Worker 주소를 `school-church.html`, `school-church-admin.html`의
`<meta name="sc-api-base">`에 넣어주세요. 사이트 주소가 GitHub Pages가 아니라면
`wrangler.toml`의 `ALLOWED_ORIGINS`도 바꿔주세요.

## 공개 / 관리자 정보 분리

- `GET /api/schedule` 은 SQL에서 `id, 날짜, 시간, 학교, 유형, 상태`만 조회해요. 취소된 일정은 빠져요.
- 이름·연락처·상세 장소는 `/api/admin/*` 에서만 나오고, 서버가 서명된 토큰(12시간)을 매번 확인해요.
- 로그인 실패가 15분에 8번을 넘으면 그 IP는 잠시 막혀요.
