import type {ConnectedAccount,EmailMessage} from '../types';
import type {DynamicSyncCredentials} from './accountService';
import {detectMailProvider} from '../../core/mail/providerManager';

export function providerMailConfig(account:ConnectedAccount,credentials:DynamicSyncCredentials) {
  if(credentials.email.trim().toLowerCase()!==account.email.trim().toLowerCase() || (!credentials.password && !credentials.accessToken)) throw new Error('ACCOUNT_RECONNECT_REQUIRED');
  const defaults=detectMailProvider(account.email);
  return {accountId:account.id,accountEmail:account.email,host:account.imapConfig?.host || credentials.host || defaults.imapHost,
    port:account.imapConfig?.port || credentials.port || defaults.imapPort || 993,secure:account.imapConfig?.secure ?? credentials.secure ?? true,
    auth:{user:account.email,...(credentials.accessToken?{accessToken:credentials.accessToken}:{pass:credentials.password})}};
}
export function providerMessageConfig(account:ConnectedAccount,credentials:DynamicSyncCredentials,email:EmailMessage) {
  if(email.accountId!==account.id || !email.uid || !email.folder || !email.uidValidity) throw new Error('MESSAGE_IDENTITY_REQUIRED');
  return {...providerMailConfig(account,credentials),folder:email.folder,uid:email.uid,expectedUidValidity:email.uidValidity,messageId:email.messageId};
}
