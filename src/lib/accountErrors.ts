export type AccountAction = 'login' | 'signup' | 'reset';
const errors: Record<string, string> = {
  'auth/invalid-credential': 'Email or password is incorrect. Use your Manzil account password, or choose Forgot password.',
  'auth/invalid-login-credentials': 'Email or password is incorrect. Use your Manzil account password, or choose Forgot password.',
  'auth/wrong-password': 'Email or password is incorrect. Use your Manzil account password, or choose Forgot password.',
  'auth/user-not-found': 'Email or password is incorrect. Use your Manzil account password, or choose Forgot password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account is disabled. Contact the administrator.',
  'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
  'auth/network-request-failed': 'Could not reach the account service. Check your connection and try again.',
  'auth/operation-not-allowed': 'Email and password sign-in is disabled for this project. Contact the administrator.',
  'auth/invalid-api-key': 'The account service rejected this site configuration. Contact the administrator.',
  'auth/app-not-authorized': 'The account service rejected this site configuration. Contact the administrator.',
  'auth/unauthorized-domain': 'The account service rejected this site configuration. Contact the administrator.',
  'auth/invalid-app-credential': 'The account service rejected this site configuration. Contact the administrator.',
  'auth/email-already-in-use': 'Could not create an account with these details. Try signing in or resetting your password.',
  'auth/weak-password': 'This password does not meet the account requirements. Choose a stronger password.',
  'auth/password-does-not-meet-requirements': 'This password does not meet the account requirements. Choose a stronger password.',
  'auth/internal-error': 'The account service could not finish this request. Please try again.',
};
/** Render only known codes and app-owned copy, never provider messages or response payloads. */
export function accountError(error: unknown, action: AccountAction): { message: string; code?: string } {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (typeof code === 'string' && Object.hasOwn(errors, code)) return { message: errors[code], code };
  return { message: action === 'login' ? 'Could not sign in. Check your details and connection, then try again.' :
    action === 'signup' ? 'Could not create your account. Check your details and connection, then try again.' :
      'Could not request a password reset. Check your email and connection, then try again.' };
}
