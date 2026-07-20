# CHANGELOG — asuka_bot (repos-dashboard)

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
