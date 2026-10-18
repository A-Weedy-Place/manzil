import type { Closure, ClosureAuthor, CommunityUser, LocalProfile, Membership } from '../shared/types.js';
import type { Repository } from './repository.js';
import { HttpError } from './errors.js';

export interface TokenUser { uid: string; admin?: boolean; name?: string }
export interface VerificationRecord { uid: string; verified: boolean; updatedBy: string; updatedAt: string }
export interface DirectoryUser { uid: string; email?: string; displayName?: string; photoURL?: string; disabled: boolean; customClaims?: Record<string, unknown>; metadata?: { creationTime?: string; lastSignInTime?: string } }
export interface UserDirectory {
  listUsers(maxResults: number, pageToken?: string): Promise<{ users: DirectoryUser[]; pageToken?: string }>;
  getUser(uid: string): Promise<DirectoryUser>;
  setCustomUserClaims(uid: string, customClaims: Record<string, unknown> | null): Promise<void>;
}
export interface TokenAuthority {
  verifyIdToken(token: string, checkRevoked: boolean): Promise<{ uid: string; name?: unknown }>;
  getUser(uid: string): Promise<DirectoryUser>;
}
/** Claims in an already-issued token can outlive an administrator's role change. */
export async function authenticateToken(authority: TokenAuthority, token: string): Promise<TokenUser> {
  const decoded = await authority.verifyIdToken(token, true);
  const account = await authority.getUser(decoded.uid);
  if (account.disabled) throw new Error('Account disabled.');
  return { uid: decoded.uid, admin: account.customClaims?.admin === true,
    ...(account.displayName ? { name: account.displayName } : typeof decoded.name === 'string' ? { name: decoded.name } : {}) };
}
const memberKey = (uid: string) => `community:member:${uid}`;
export async function membershipFor(root: Repository, user: TokenUser | null, local = false): Promise<Membership | null> {
  if (local) return { uid: 'local-admin', role: 'admin', verified: true };
  if (!user) return null;
  const verified = (await root.meta<VerificationRecord>(memberKey(user.uid)))?.verified === true;
  return { uid: user.uid, role: user.admin === true ? 'admin' : verified ? 'verified' : 'user', verified: user.admin === true || verified };
}
export async function setVerification(root: Repository, uid: string, verified: boolean, adminUid: string) {
  const record: VerificationRecord = { uid, verified, updatedBy: adminUid, updatedAt: new Date().toISOString() };
  await root.setMeta(memberKey(uid), record); return record;
}
export const isReviewer = (member: Membership | null) => member?.role === 'verified' || member?.role === 'admin';
export function canReadClosure(closure: Closure, member: Membership | null): boolean {
  return closure.status === 'published' && (!closure.moderation || closure.moderation === 'approved') || member?.role === 'admin' || !!member && (closure.author?.uid === member.uid || isReviewer(member) && closure.moderation === 'pending');
}
export function assertEditClosure(closure: Closure, member: Membership | null) {
  if (member?.role === 'admin') return;
  if (isReviewer(member) && (closure.status === 'published' && (!closure.moderation || closure.moderation === 'approved') || closure.status === 'draft' && closure.moderation === 'pending')) return;
  if (!member || closure.author?.uid !== member.uid || member.role === 'user' && closure.moderation !== 'pending') throw new HttpError(403, 'You cannot edit this closure.');
}
export function closureSummary(closure: Closure): Closure {
  const { photos, ...summary } = closure;
  return { ...summary, photoCount: photos?.length ?? closure.photoCount ?? 0 };
}
export async function actorFor(store: Repository, member: Membership, user?: TokenUser | null): Promise<ClosureAuthor> {
  const profile = await store.profile();
  return { uid: member.uid, displayName: profile.displayName === 'Traveller' && user?.name ? user.name.slice(0,60) : profile.displayName, role: member.role };
}
export async function directoryEntry(root: Repository, user: DirectoryUser): Promise<CommunityUser> {
  const membership = (await membershipFor(root, { uid: user.uid, admin: user.customClaims?.admin === true }))!;
  // Read a minimal directory projection, without creating a missing profile or
  // returning location traces, vehicles, avatars, or personal records. SQLite's
  // single-user adapter cannot identify another account's consent.
  let profile: Pick<LocalProfile, 'displayName' | 'city' | 'collectTravelData'> | undefined;
  let sharing: boolean | null = null;
  if (root.backend === 'firestore') {
    try { profile = await root.forUser(user.uid).meta<LocalProfile>('profile'); sharing = profile?.collectTravelData === true; }
    catch { /* A missing directory projection is an explicit unknown. */ }
  }
  const name = profile?.displayName && profile.displayName !== 'Traveller' ? profile.displayName : user.displayName;
  return { ...membership, travelDataSharing: sharing, ...(profile?.city ? { city: profile.city } : {}), ...(user.email ? { email: user.email } : {}), ...(name ? { displayName: name } : {}),
    ...(user.photoURL ? { photoURL: user.photoURL } : {}), disabled: user.disabled,
    ...(user.metadata?.creationTime ? { createdAt: user.metadata.creationTime } : {}), ...(user.metadata?.lastSignInTime ? { lastSignInAt: user.metadata.lastSignInTime } : {}) };
}
