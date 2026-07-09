# 전래동화 출석체크 (래퍼)

낭독스쿨 출석 앱(Google Apps Script)에 **홈 화면 앱 아이콘 + 자동 로그인**을 입히는 진입 페이지입니다.
실제 출석 로직·시트 연결은 계속 Apps Script가 담당합니다.

> **동작 방식(중요):** 처음엔 iframe으로 감쌌으나, 구글이 Apps Script 앱을 남의 사이트 iframe 안
> 내부 샌드박스로 띄우는 걸 모바일에서 막아(공백) → **"스마트 리다이렉트" 방식**으로 변경.
> 홈 아이콘 탭 → 이 래퍼(🐯 스플래시) → 기억한 연락처(`?p=`)로 자동 로그인된 출석앱으로 **바로 이동**.
> 앱이 iframe 없이 최상위로 실행돼서 안정적으로 뜨고, 앱 자체 기억 기능으로 재로그인도 방지됨.

## 파일 구성
| 파일 | 역할 |
|------|------|
| `index.html` | 🐯 스플래시 → 출석앱으로 리다이렉트 + 자동 로그인(`?p=`) + PWA 설정 |
| `manifest.json` | 앱 이름 "전래동화 출석체크" · 아이콘 · standalone 표시 |
| `sw.js` | 서비스워커(설치 가능하게 + 껍데기 캐시. 출석앱 데이터는 캐시 안 함) |
| `icons/` | 🐯 호랑이 아이콘 (192 / 512 / apple-touch / favicon) |
| `netlify.toml` | 빌드 없음, sw·manifest 캐시 최소화 |

## 배포 (GitHub → Netlify)
1. 이 폴더 전체를 GitHub 레포 `nangdok-check` 에 올림
2. Netlify → Add new site → Import an existing project → GitHub → `nangdok-check` 선택
3. 빌드 명령/publish 는 `netlify.toml` 이 알아서 함(그냥 Deploy)
4. 이후 수정은 GitHub 에서 커밋하면 Netlify 가 자동 재배포

## 출석 앱 주소 바꾸려면
`index.html` 안의 `EXEC` 값(`.../exec`)만 수정.

## ⚠️ 필수 — Apps Script 접근 권한
Apps Script 배포 설정에서 **"액세스 권한: 모든 사용자(Anyone)"** 여야
외부(개인 Gmail) 사용자도 출석 체크가 가능합니다.

## 참고 — doGet 의 XFrameOptions 는 이제 필수 아님
리다이렉트 방식으로 바꾼 뒤로는 iframe을 안 쓰므로
`.setXFrameOptionsMode(...ALLOWALL)` 는 **없어도 동작**합니다(넣어둬도 무해).
