# CHANGELOG — asuka_bot (repos-dashboard)


## v3.9 — 2026-10-30

- **📚 서재 탭 신설**: "영상 효과", "글리치", "전환"처럼 하고 싶은 걸 검색하면 ① 효과 목록 ② 관련 도구(저장소·허깅페이스) ③ 해본 기록(위키)을 한 화면에 보여준다. 별도 툴 없이 대시보드 하나로 합침
- `docs/effects.json` 신설 — 영상 효과 65개(트랜지션·자막·타이포·색감·필름룩·카메라·움직임·속도·리듬·합성·VFX·화풍 스타일·AI 편집). 근거는 video-shotcraft 레시피(150샷)·lemo-opuscar 화풍(66종)·video-use·remotion·hyperframes 실제 README. 카드마다 "이 도구로" 칩(설치된 건 ✅)·예시 갤러리 링크
- **비슷한 말 검색**: effects.json `synonyms` 묶음(영상=비디오=video, 효과=모션=애니메이션 등) + 띄어쓰기 단어별 AND 검색 → 저장소 탭에서도 "영상 효과"가 0개 → 10개로 찾아짐
- **위키 기록은 비공개라 GitHub Pages에 안 올림**: `tools/serve_library.py`(127.0.0.1:8985)로 열 때만 asuka-wiki 30-wiki 프론트매터를 실시간으로 읽어 `/wiki.json`·`/wiki-page` 제공(위키 폴더 밖 경로 차단). 바탕화면 런처 `AI프로젝트/기타/asuka 서재.command`
- 나머지 분야(3D·UI 모션·이미지)는 effects.json `kinds`에 추가하면 탭이 자동으로 생긴다
- 버전 표기·캐시 버스터 v3.8 → v3.9
- 검색 키워드: 서재, effects.json, 영상 효과, 비슷한 말, synonyms, serve_library, 위키 검색, 8985

## v3.8 — 2026-10-26

- **🧊 3D·렌더 카테고리 신설** (용도 중심 8종 → 9종): 블렌더·Three.js·3D 모델 생성·리깅·모션·3D 장면 렌더 도구를 한 칸에 모음. 미디어 생성·클로드코드 운영·개발도구·디자인·UI에 흩어져 있던 15개 이동 (mcp-for-blender·img2threejs·trellis.2·zero123plus·hi3dv1.0·3dviz-pro-max·hy-motion-1.0·motion2mixamorig·prompt2rig·cozyclay 2종·scroll-world·lingbot-map·opengeometry·gods-eye-view). 이전 값은 `category_prev`에 보관, `classified_by: asuka-3d-v38`
- **ORU 프로젝트 착수 때 이 칸을 먼저 검토**하는 규칙을 위키 oru 라우터·ORU 페이지에 기록
- 분류기(`categories.json` 두 곳): 3D·렌더 키워드 추가, 미디어 생성에서 `3d`·`render` 키워드 제거 → 앞으로 텔레그램으로 저장하는 3D 저장소는 자동으로 이 칸에 들어감. 허깅페이스 `image-to-3d`·`text-to-3d`도 3D·렌더로 (봇 재배포)
- 노루군 공유 "디자인·영상 AI 도구 10선" 반영: 없던 4개 추가 — ui-ux-pro-max-skill·penpot(디자인·UI), remotion·lemo-opuscar(미디어 생성). 이미 있던 6개(impeccable·mcp-for-blender·img2threejs·video-shotcraft·hyperframes·diagram-design)는 별 수 갱신
- `ahujasid/blender-mcp`는 `mcp-for-blender`로 이름만 바뀐 같은 저장소라 중복 카드 하나로 합침 (태그 mcp 유지, 깨진 설명 "!!!!" 교체)
- 버전 표기·캐시 버스터 v3.7 → v3.8
- 검색 키워드: 3D·렌더, 3D 카테고리, ORU 검토, blender-mcp 중복, remotion, penpot, ui-ux-pro-max

## v3.7 — 2026-10-24

- **프롬프트 탭 폐지**: 대시보드 탭·카드·삭제 API(`/api/prompts`, `/api/prompt/delete`), 봇 명령(`/prompt` `/p` `/plist` `/pdelete`), "링크 아닌 글은 프롬프트로 저장" 동작 전부 제거. `docs/prompts.json`(25개) 삭제 — 원본은 깃 기록(v3.6 커밋 54406fc)에 남음
- 프롬프트 25개 중 허깅페이스 링크는 0개. Threads 공유 링크(`l.threads.com/?u=`)에 감싸여 봇이 놓친 깃허브 저장소 2개를 저장소 탭으로 이관: `hybirdss/hycli`(에이전트·자동화), `black-forest-labs/flux-3-image-klein`(미디어 생성, 분류기가 기타를 줘서 수동 지정). notes에 이관 표시, saved_at은 원래 프롬프트 저장 시각
- **허깅페이스 탭 신설**: 텔레그램에 `huggingface.co`(또는 `hf.co`) 모델·데이터셋·스페이스 링크를 보내면 깃허브와 같은 흐름으로 저장 → `docs/hf.json` (공개 API, 키 불필요). 아이디 형식 `hf:owner/name`, `hf:datasets/owner/name`, `hf:spaces/owner/name`
- 분류는 용도 중심 8종 그대로: 작업 종류(pipeline_tag) 표 → 키워드 분류기 → 종류별 기본값(기타 저장 방지). 데이터셋은 항상 문서·데이터, 스페이스는 사용 모델의 작업 종류로 보충
- 대시보드: 상단 탭 "📦 저장소 / 🤗 허깅페이스", 허깅페이스 모드에서는 워크스페이스 탭 자리에 종류 탭(모델·데이터셋·스페이스), 카드에 좋아요·다운로드·작업 종류 표시, 검색·카테고리 칩·설치상태·즐겨찾기·정렬(별↔좋아요) 공용
- 봇: `/add` `/retag` `/delete`가 허깅페이스도 처리, 링크가 아닌 글에는 안내 메시지. Threads 등 `?u=` 래퍼 링크를 풀어서 인식
- **주간 보고(월 09:00)에만 허깅페이스 추가** (`/찾아`·`/list`·`/search`는 저장소 전용 유지): 저장한 자료 중 파일 업데이트·좋아요 급등(+10), 지금 뜨는 모델 2·스페이스 2 추천(➕ 🤗 저장 버튼). 주당 오래된 순 10개씩 갱신(Workers subrequest 50 제한). 추천에서 성인물·도박·딥페이크·크랙 의심 이름과 좋아요 적은 것은 제외
- wrangler.toml: `PROMPTS_PATH` → `HF_PATH = "docs/hf.json"`. 봇 재배포 완료
- AI 한글 설명에 중국어·일본어 한자가 섞이면 다음 모델로 다시 생성(마지막 모델이면 한자만 제거)
- 봇 배포 완료 2026-10-24 (Version a2b97e0d → bb863777), 실서버 발송 없는 주간 보고 점검 통과
- 버전 표기·캐시 버스터 v3.4 → v3.7
- 검색 키워드: 허깅페이스, huggingface, hf.json, 프롬프트 폐지, Threads 래퍼, 주간 보고 허깅페이스

## v3.6 — 2026-10-04

- **분류기 폴백 버그 근본 수정**: 봇 워커는 `CATEGORIES_PATH = data/categories.json`을 읽는데, 이 파일이 v3.3(07-30) 이후에도 구 19종(v1) 그대로였다 → 신규 북마크가 `cc-저장소`·`기타ai`·`mcp` 같은 구 카테고리로 저장돼 왔음. `data/categories.json`을 `docs/categories.json`(용도 중심 8종)과 동일하게 맞춤. 봇은 런타임에 GitHub에서 읽으므로 재배포 불필요
- 분류기가 읽는 키 `name_patterns`를 8종 각 카테고리에 추가(기존 `name_pattern`과 같은 값) — 이름 패턴 가산점이 다시 동작
- 08-14 이후 텔레그램으로 저장된 신규 51개 포함, 구 카테고리에 머물던 **52개를 8종으로 수동 재분류**(`classified_by: asuka-recls-v2`, 구 값은 `category_v1`에 백업), Claude Code에 붙여 쓰는 것은 태그 `cc`, MCP 서버는 태그 `mcp`
- 결과 분포(181개): 미디어 생성 38 · 에이전트·자동화 30 · 개발도구 29 · 디자인·UI 25 · 클로드코드 운영 21 · 문서·데이터 21 · 리서치·수집 10 · 글쓰기·카피 7
- 남은 흠: 키워드 점수가 전부 0이면 분류기가 여전히 `기타`를 돌려준다(8종에 없는 값) — 그런 항목은 주기 재분류 때 정리
- 검색 키워드: 분류기 폴백 버그, data/categories.json, CATEGORIES_PATH, 재분류, category_v1, 181개

## v3.5 — 2026-08-14

- 봇 워커에 `POST /api/notify?secret=<WEBHOOK_SECRET>` 신설 — 로컬 잡이 @asuka_noroobot 명의로 임의 텍스트를 보낼 수 있는 입구. body 원문이 곧 메시지, 수신자는 ALLOWED_USER_IDS 첫 번째(노루군), `alarm_muted` KV 스위치 존중, parseMode 없이 전송(임의 텍스트 마크다운 파싱 실패 방지), 4000자 컷
- 첫 소비자: asuka-wiki 주간 리포트(launchd 매주 일 21:00, `~/projects/asuka-wiki/_meta/weekly_report.sh`) — 위키 한 주 활동 요약을 이 봇으로 발송
- 시크릿 신규 발급 없음(기존 WEBHOOK_SECRET 재사용), 검증: 실발송 http=200
- 검색 키워드: /api/notify, 임의 메시지 발송, 위키 주간 리포트, wiki-weekly, launchd

## v3.4 — 2026-08-08

- 설치상태 추적 기능 신설 — data.json에 `status` 필드("설치"/"대기"/"탈락") 추가, 콤보 부품 프로젝트 실적 기준 14개 심기 (설치 10: hallmark·officecli·book-to-skill·graphify·ai-marketing-skills·insane-research·insane-search·img2threejs·oh-my-design·kordoc / 대기 1: smartstore-cli(TOS 승인 대기) / 탈락 3: tencentdb-agent-memory·scroll-world·airi)
- 카드에 설치상태 뱃지 표시 (카테고리 필 안 구분선 형식, 상태별 색상)
- 설치상태 필터 칩 줄 추가 (카테고리 칩 아래, 재클릭 시 해제, 전체 기준 카운트) — 검색어로도 "설치/대기/탈락" 검색 가능
- 프롬프트 모드에서는 상태 칩 숨김 처리
- 버전 표기·캐시 버스터 v3.34 → v3.4 동기화 (styles.css / app.js 쿼리스트링 포함)
- 봇(워커)은 기존 항목 제자리 수정 방식이라 status 필드 보존 확인 완료 — 워커 재배포 불필요

## v3.34 — 2026-07-30

- 검색엔진 색인 차단(noindex 메타) 적용 — docs/index.html `<head>` 최상단에 `<meta name="robots" content="noindex, nofollow">` 삽입 (구글·네이버 등 검색 노출 방지, robots.txt 방식은 noindex 미전달 문제로 미사용)
- 버전 표기·캐시 버스터 v3.33 → v3.34 동기화 (styles.css / app.js 쿼리스트링 포함)

## v3.33 — 2026-07-30 (캐시 버스터 + 칩 줄 상단 고정)

- **캐시 버스터 도입**: app.js·styles.css를 `?v=3.33` 쿼리로 로드 — GitHub Pages 10분 캐시 때문에 배포해도 사용자 브라우저가 옛 코드를 물고 있던 문제 근절 (v3.32가 "안 바뀐 것처럼" 보였던 원인). **앞으로 버전 올릴 때 이 쿼리도 반드시 같이 올린다**
- 칩 줄(.filter-section) position:sticky 상단 고정 — 목록을 깊이 스크롤해도 카테고리 즉시 전환
- 키워드: 캐시 버스터, cache bust, sticky, 칩 고정, Pages 캐시

## v3.32 — 2026-07-30 (카테고리 칩 상시 유지 — "뒤로가기" 진짜 원인 수정)

- **버그 원인**: renderChips가 카테고리 필터까지 적용된 목록으로 칩을 재생성 → 카테고리 하나 고르면 위 메뉴에서 다른 칩이 전부 사라져 '전체'를 거쳐야만 이동 가능했음 (노루군 "전체 누르고 다시 선택 안 하고 바로바로 넘어가게")
- **수정**: 칩은 카테고리 무시 목록(applyFilter ignoreCategory)으로 그림 — 위 메뉴는 항상 전 카테고리 노출 + 선택은 하이라이트만, 아래 목록만 히든 필터. 칩끼리 직행 전환 실측 검증(미디어 생성→에이전트·자동화, 칩 9개 유지)
- 키워드: 칩 사라짐, 카테고리 이동, ignoreCategory, renderChips

## v3.31 — 2026-07-30 (소수정 — 새 카테고리 이모지)

- v3.3 재분류 후 새 8종 카테고리에 이모지 매핑이 없어 카드가 전부 📦로 표시되던 것 수정 (🎨✍️🎬📄🔍🤖🧩🛠️)
- 카테고리 클릭 = 기존 히든(필터) 방식 유지 확정 — 하이라이트 모드는 노루군이 실물 확인 후 기각(2026-07-30), 배포 전 폐기

## v3.3 — 2026-07-30 (카테고리 재정립 — 용도 중심 8종)

- **노루군 반려("분류가 제대로 안 됐다") → 19종 → 용도 중심 8종 재편**: 디자인·UI / 글쓰기·카피 / 미디어 생성 / 문서·데이터 / 리서치·수집 / 에이전트·자동화 / 클로드코드 운영 / 개발도구. 잡동사니(기타·기타ai·한국어·api리소스)와 미디어 6분할(이미지/비디오/음성/3d/텍스트/문서) 해체
- **cc 축은 태그로 보존**: 구 cc-스킬/cc-저장소 소속 + 설치형 스킬 전부에 태그 `cc` 부여 — 도메인 우선 원칙(better-* UI 스킬 → 디자인·UI + cc). 구 분류는 각 항목 `category_v1` 필드에 백업(롤백·학습용)
- 103개 전량 재분류(98건 이동), categories.json v2(새 키워드 가중치 — 봇 자동 분류가 새 체계로 작동, 앱·봇 모두 런타임 fetch라 재배포 불필요), 대시보드 v3.3 표기
- 키워드: 카테고리 재정립, 재분류, 8종, cc 태그, category_v1, categories.json v2

## v3.2 — 2026-07-26
- 대시보드 즐겨찾기 기능 추가: 카드마다 ☆ 별 버튼(클릭 시 ★ 토글, localStorage `asuka_favs`에 저장 — 보는 브라우저별로 유지), 툴바에 "☆ 즐겨찾기" 필터 버튼(즐겨찾기만 보기).
- 기본 정렬은 기존대로 최근 저장순(`saved_desc`) 확정 — 코드상 이미 기본값이었음을 확인.
- 헤드리스 브라우저로 실동작 검증: 토글·저장·새로고침 유지·별 클릭 시 저장소 새 탭 안 열림.
- 키워드: 즐겨찾기, favorites, 별 버튼, localStorage, 최신순 정렬, favToggle

## v3.1 — 2026-07-26
- `claude-code` 카테고리(15개)를 2개로 분리: **cc-스킬**(Claude Code에 설치해 에이전트에 붙여 쓰는 스킬·플러그인·CLAUDE.md, 11개) / **cc-저장소**(클론·설치해 독립 실행하는 툴·템플릿·하네스, 4개 — claude-codex-battery, webtoon-harness, llm-wiki, cc-cache-fix).
- `data/categories.json`(봇용)·`docs/categories.json`(대시보드용) 동시 갱신, 분류 규칙에 cc_skill_vs_repo 기준 추가, 신규 저장 시 "skill/plugin" 키워드 유무로 자동 구분.
- 대시보드 이모지: cc-스킬 🧩 / cc-저장소 🤖, 푸터에 버전 표기(v3.1) 추가.
- 키워드: 카테고리 분리, claude-code, cc-스킬, cc-저장소, 스킬 분류, 재분류

## v3 — 2026-07-20
- 주간 보고서 txt 첨부 방식 폐기 → 텔레그램 메시지 본문 분할 전송으로 교체. 채팅 메시지는 파일 뷰어를 안 거치므로 인코딩 문제 원천 제거.
- 사후 확인: BOM 붙인 txt(v2 수정본)도 정상 표시됨을 실기기로 확인. v2 배포 직후 깨진 채 온 보고서는 배포 전파 전에 트리거되어 옛 코드가 만든 파일이었음. 교훈: deploy 직후 바로 트리거하지 말고 대기 후 dry 모드로 새 코드 확인.
- `digest.ts`에 `chunkText`(4096자 제한 대비 3900자 줄 단위 분할, 무손실) 추가, `telegram.ts`의 `sendDocument` 삭제(호출처 없음).
- 키워드: 주간보고, 다이제스트, txt 깨짐, 모지바케, 인코딩, 메시지 분할, chunkText, sendDocument 제거

## v2 — 2026-07-20
- 주간 보고서 txt 한글 깨짐(모지바케, 인코딩 깨짐) 수정: 텔레그램 `sendDocument`로 보내는 텍스트 파일에 UTF-8 BOM(`﻿`)을 붙이고 MIME 타입을 `text/plain; charset=utf-8`로 지정. 폰·윈도우 뷰어가 인코딩을 잘못 추측해 읽을 수 없는 문자로 보이던 문제 해결.
- 주간 보고서 푸터에 버전 표기(`asuka_bot v2`) 추가.
- 키워드: 주간보고, 다이제스트, digest, 텔레그램 첨부, txt 깨짐, BOM, UTF-8, sendDocument

## v1 — 이전
- GitHub 저장소 북마크 봇 + 대시보드 초기 버전 (텔레그램 링크 저장, 주간 다이제스트 cron, GitHub Pages 대시보드).
