# 공동주문 백엔드 연결

현재 코드는 Supabase 설정이 비어 있으면 기존 로컬 데모로 작동하고, 설정이 있으면 여러 기기에서 공유되는 온라인 모드로 자동 전환됩니다.

## 사용자가 준비할 것

1. `https://supabase.com`에서 계정을 만들고 Free 프로젝트를 생성합니다.
2. Supabase Dashboard의 `SQL Editor`에서 `supabase/schema.sql` 전체를 실행합니다.
3. `Authentication > Sign In / Providers > Anonymous Sign-Ins`를 활성화합니다.
4. `Project Settings > API Keys`에서 아래 두 값을 복사합니다.
   - Project URL
   - Publishable Key (`sb_publishable_...`)
5. `js/config.js`의 `roomBackend`에 두 값을 입력합니다.

```js
roomBackend: Object.freeze({
  provider: "auto",
  supabaseUrl: "https://프로젝트ID.supabase.co",
  supabasePublishableKey: "sb_publishable_...",
}),
```

Publishable Key는 브라우저 공개용입니다. `Secret Key`, `service_role`, 데이터베이스 비밀번호는 코드나 GitHub에 절대 입력하지 않습니다.

## 권장 운영 설정

- 최초 기능 확인 단계에서는 CAPTCHA를 끈 상태로 테스트합니다.
- 운영 공개 전에는 익명 가입 남용 방지를 위해 Cloudflare Turnstile 또는 hCaptcha 토큰 전달 코드를 추가한 뒤 CAPTCHA를 활성화합니다.
- `lunch-mvp.vercel.app`을 Supabase Auth의 허용 사이트 URL에 등록합니다.
- 오래된 익명 사용자와 종료된 방을 정리하는 주기 작업은 운영 전 추가합니다.
- 방 UUID가 초대 토큰 역할을 하므로 초대 링크를 공개 게시하지 않습니다.

## 동작 확인

1. 첫 번째 브라우저에서 방을 만들고 링크를 복사합니다.
2. 시크릿 창이나 다른 기기에서 링크를 엽니다.
3. 다른 닉네임으로 참여하고 투표합니다.
4. 첫 번째 브라우저에서 참여자와 투표 수가 자동 갱신되는지 확인합니다.

연결 실패 시 `provider: "auto"`는 로컬 데모로 복귀합니다. 설정 오류를 강하게 표시하며 점검하려면 임시로 `provider: "supabase"`를 사용합니다.
