import type {
  ClubFollow,
  ClubMembership,
  CoreMemberPermission,
} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError} from '../../shared/errors/AppError.ts';

export class MembershipsService {
  constructor(private readonly adapter: DataAdapter) {}

  async getMyMembershipsAndFollows(userId: string): Promise<{
    memberships: ClubMembership[];
    follows: ClubFollow[];
  }> {
    const [memberships, follows] = await Promise.all([
      this.adapter.getMembershipsForUser(userId),
      this.adapter.getFollowsForUser(userId),
    ]);
    return {memberships, follows};
  }

  async followClub(userId: string, clubId: string): Promise<ClubFollow> {
    return this.adapter.followClub(userId, clubId);
  }

  async unfollowClub(userId: string, clubId: string): Promise<void> {
    const removed = await this.adapter.unfollowClub(userId, clubId);
    if (!removed) throw new NotFoundError('Follow record not found');
  }

  async getClubTeam(clubId: string): Promise<ClubMembership[]> {
    return this.adapter.getClubMemberships(clubId);
  }

  async upsertClubMember(
    clubId: string,
    actor: {id: string; name: string},
    input: {
      email: string;
      role: ClubMembership['role'];
      title: string;
      permissions: CoreMemberPermission[];
    },
  ): Promise<ClubMembership> {
    const user = await this.adapter.getUserByEmail(input.email);
    if (!user) {
      throw new NotFoundError(`No user found with institutional email ${input.email}`);
    }
    const membership = await this.adapter.upsertClubMembership({
      clubId,
      userId: user.id,
      role: input.role,
      title: input.title,
      permissions: input.permissions,
    });
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Admin · ${membership.clubName || clubId}`,
      action: 'UPSERT_CLUB_MEMBER',
      targetType: 'membership',
      targetId: membership.id,
      targetLabel: `${user.name} (${input.role})`,
      details: `Assigned ${input.title} with ${membership.permissions.length} permissions.`,
    });
    return membership;
  }

  async updateMemberPermissions(
    clubId: string,
    membershipId: string,
    actor: {id: string; name: string},
    updates: {
      role?: ClubMembership['role'];
      title?: string;
      permissions: CoreMemberPermission[];
    },
  ): Promise<ClubMembership> {
    const updated = await this.adapter.updateMembershipPermissions(clubId, membershipId, updates);
    if (!updated) throw new NotFoundError('Club membership not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Admin · ${clubId}`,
      action: 'UPDATED_MEMBER_PERMISSIONS',
      targetType: 'membership',
      targetId: membershipId,
      targetLabel: updated.userName || membershipId,
      details: `Updated permissions to [${updated.permissions.join(', ')}].`,
    });
    return updated;
  }

  async removeClubMember(
    clubId: string,
    membershipId: string,
    actor: {id: string; name: string},
  ): Promise<void> {
    const removed = await this.adapter.removeClubMembership(clubId, membershipId);
    if (!removed) throw new NotFoundError('Club membership not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Admin · ${clubId}`,
      action: 'REMOVED_CLUB_MEMBER',
      targetType: 'membership',
      targetId: membershipId,
      targetLabel: membershipId,
      details: 'Removed member from club leadership team.',
    });
  }
}
