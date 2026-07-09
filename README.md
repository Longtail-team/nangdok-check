# 전래동화 출석체크 (래퍼)

낭독스쿨 출석 앱(Google Apps Script)을 **전체화면 + 홈 화면 앱 아이콘**으로 감싸는 껍데기 사이트입니다.
실제 출석 로직·시트 연결은 계속 Apps Script가 담당하고, 여기엔 iframe 래퍼 한 장만 있습니다.

## 파일 구성
| 파일 | 역할 |
|------|------|
| `index.html` | 전체화면 iframe + 자동 로그인(`?p=`) + PWA 설정 |
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

## 🔴 필수 — Apps Script 에서 iframe 임베드 허용 (이거 안 하면 화면이 빈칸)
구글은 기본적으로 Apps Script 앱을 다른 사이트 iframe 안에 넣지 못하게 막습니다
(X-Frame-Options). 그래서 **서버 코드(`Code.gs`)의 `doGet` 에 한 줄을 추가**해야 합니다:

```js
function doGet(e){
  return HtmlService.createTemplateFromFile('WebAppIndex').evaluate()
    .setTitle('전래동화 출석체크')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);  // ← 이 줄 추가
}
```
추가 후 **배포 → 배포 관리 → 편집(연필) → 버전: 새 버전 → 배포** 로 재배포해야 적용됩니다.
(`.../exec` 주소는 그대로 유지됩니다.)

## ⚠️ 필수 — Apps Script 접근 권한
Apps Script 배포 설정에서 **"액세스 권한: 모든 사용자(Anyone)"** 여야
외부(개인 Gmail) 사용자도 출석 체크가 가능합니다.

## (선택) 수동 로그인도 자동 기억되게 하려면
`WebAppIndex.html` 의 로그인/로그아웃 성공 지점에 아래 한 줄씩 추가 후 Apps Script 재배포:
```js
// 로그인 성공 시
try{ parent.postMessage({t:'rd_login', p:digits(phone)}, '*'); }catch(e){}
// 로그아웃 시
try{ parent.postMessage({t:'rd_logout'}, '*'); }catch(e){}
```
안 넣어도 `?p=` 개인 링크와 앱 자체 기억으로 대부분 자동 로그인됩니다.
