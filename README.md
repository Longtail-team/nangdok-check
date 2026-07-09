# 전래동화 출석체크 (Netlify 프론트엔드)

낭독스쿨 과정별 출석체크 앱. **화면은 이 Netlify 사이트가 직접 그리고**,
데이터(출석/시트)는 Google Apps Script를 **JSON API로만** 호출합니다.

> **왜 이 구조인가:** 예전엔 Apps Script가 화면을 그려서 (1) 상단에 구글 회색 배지가
> 붙고 (2) iframe 임베드가 모바일에서 공백이 되고 (3) 아이폰 주소창이 남았음.
> → Apps Script를 **데이터 API**로만 쓰고 UI를 우리 도메인으로 옮겨 **셋 다 해결**.

## 동작
- 홈 아이콘/주소 접속 → 이 사이트가 바로 출석 UI 렌더 (iframe·리다이렉트 없음)
- 서버 호출은 `call('getConfig' | 'getFamilyByPhone' | 'getLeaderboard' | 'submitCheck', …)`
  → 내부적으로 **JSONP(GET)** 로 Apps Script `API`(`.../exec`) 호출 (CORS 회피)
- `?p=010…` 로 개인 링크 자동 로그인, 연락처는 기기에 기억(재로그인 없음)

## 파일 구성
| 파일 | 역할 |
|------|------|
| `index.html` | 출석 앱 본체(UI+로직) + JSONP API 호출 + PWA |
| `manifest.json` · `icons/` · `sw.js` | 홈 화면 앱 아이콘(🐯) · 설치 · 껍데기 캐시 |
| `netlify.toml` | 빌드 없음, sw·manifest 캐시 최소화 |
| `WebApp.template.gs` | **Apps Script 서버 코드 완성 템플릿**(새 과정마다 재사용) |

## 과정 API 주소 바꾸려면
`index.html` 상단의 `const API = ".../exec"` 값만 수정. (과정마다 다른 exec)

## 🔴 Apps Script 쪽 세팅 (새 과정 배포 = 코드 그대로, 설정탭만)
`WebApp.template.gs` 를 과정 프로젝트에 넣고:
1. 원본 **설정 탭**: `B4=과정명` · `B5=개강일(날짜)` · `B6=기간(주)` · `B7=메인색상 hex(선택)`
2. **인증시트 D2** = 체크박스 수(총 학습일). 12주→60, 24주→120
3. 배포 액세스 권한 = **"모든 사용자(Anyone)"** → 새 버전 배포
4. 제목은 자동으로 **"{과정명} 출석페이지"**, 색은 B7 반영

## 배포 (GitHub → Netlify)
GitHub `Longtail-team/nangdok-check` 에 커밋하면 Netlify 자동 재배포.
