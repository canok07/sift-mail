import { forgetAccountSecrets } from './vault';
import { removeStoredAccount } from '../storage/mailRepository';
import { invalidateAccount } from '../auth/accountLifecycle';

/** Idempotent local cleanup. Does not claim to revoke the provider's OAuth grant. */
export function removeLocalAccount(accountId: string, email: string): void {
  invalidateAccount(email);
  removeStoredAccount(accountId);
  forgetAccountSecrets(email);
}
