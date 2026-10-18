# Branded password recovery

The Manzil frontend includes a dedicated `/account/action` page with the entry screen's matte green background, logo, new-password and confirmation fields, separate visibility controls, English/Urdu labels, and a return-to-sign-in action. The ordinary **Forgot password?** form still requests an email through Firebase; the new page handles the link in that email.

## Behavior and boundaries

- The configured Firebase client verifies the one-time code before showing the password form, then confirms the new password only after explicit submission. Passwords must match and have at least six characters; Firebase enforces the project's actual password policy and can reject a stronger-policy violation.
- Invalid, expired, used, disabled-account, unavailable-service and transient network states stay explicit. A used-code race during confirmation removes the form. Transient verification errors offer retry; they do not silently send another email.
- The page does not sign the user in, change roles, collect trip data, activate another service, or call the Manzil API. The email, code and passwords stay in memory and are not persisted or logged. On success, the used code is removed from the current address/history entry. The page applies a no-referrer policy while mounted.
- The URL's `apiKey` and `continueUrl` are ignored. Firebase verification uses this build's configured project and API key. The only return-to-app link is `/`.
- A customized Firebase action URL applies to all email templates. `verifyEmail` and `recoverEmail` therefore show an explicit **Continue securely** link to the existing Firebase hosted handler, constructed only from the build's configured authentication domain and public API key. Those actions are not automatically applied by this page. Other modes and malformed/duplicate codes are rejected.
- The source component is `src/components/PasswordResetPage.tsx`; `src/lib/emailActions.ts` contains bounded URL parsing and safe error mapping. The page stylesheet is independent of map loading and does not mount the map or request location.

## Release configuration — not performed by this feature change

Adding a custom handler in source does **not** change links in emails already sent, the live application, or Firebase's email templates.

After the owner authorizes a release:

1. Deploy the frontend containing the handler to its intended site. Hosting's existing SPA rewrite serves `/account/action`.
2. In Firebase Console → Authentication → Templates, edit an email template, choose **Customize action URL**, and set the action URL to `https://manzil-app-v1.web.app/account/action` (or the released custom domain). This setting affects all templates; keep the hosted fallback behavior intact.
3. Confirm the build's `VITE_AUTH_MODE=firebase`, `VITE_FIREBASE_PROJECT_ID`, public web API key, app ID and `VITE_FIREBASE_AUTH_DOMAIN` refer to the intended project. Keep `authDomain` as the Firebase hosted auth domain, not `/account/action`.
4. Use a dedicated test account to request a new password-reset email, complete it on the branded page, verify new-password sign-in and used-link rejection, and check a verification/recovery link if those emails are enabled. Never use a customer's account to test a reset.

Local emulator email links normally point to the emulator's own action page. For a disposable emulator test only, take the `mode`, `oobCode` and optional `lang` from its captured reset link and open them on `http://127.0.0.1:5173/account/action`; the emulator build must still point to the isolated `demo-` project. Do not paste action links/codes into tracked documentation or share screenshots containing them.

## Verification

`tests/password-reset.test.tsx` verifies code-first loading, malformed/duplicate/foreign-link handling, stale request isolation, password confirmation and focus, visibility controls, one submission in flight, successful code removal, used/expired code rejection, transient retry, stronger server-policy failures, Urdu/RTL, safe hosted forwarding and allowlisted errors with synthetic SDK responses. The existing Auth/Firestore integration suite also exercises a disposable account's real client-SDK password-reset lifecycle against an isolated emulator; it does not send cloud email or reset an owner's account. Test run results belong in `docs/IMPLEMENTATION_STATUS.md` after execution.

Official implementation references: [Firebase custom email action handlers](https://firebase.google.com/docs/auth/custom-email-handler) and [Firebase password reset email](https://firebase.google.com/docs/auth/web/manage-users#send_a_password_reset_email). The custom handler follows the documented `verifyPasswordResetCode` → explicit password input → `confirmPasswordReset` flow.
