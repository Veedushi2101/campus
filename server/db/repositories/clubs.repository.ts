import {and, asc, desc, eq, inArray, sql} from 'drizzle-orm';
import {
  CORE_MEMBER_PERMISSIONS,
  type CoreMemberPermission,
} from '../../../shared/constants/permissions.ts';
import type {
  Club,
  ClubDetail,
  ClubFollow,
  ClubMembership,
  ClubStatus,
  HallOfFameEntry,
} from '../../../shared/types/domain.ts';
import {MAX_FOLLOWED_CLUBS} from '../../config/constants.ts';
import {BusinessRuleError, ConflictError, NotFoundError} from '../../shared/errors/AppError.ts';
import {withRlsTransaction} from '../index.ts';
import {clubFollows, clubMemberships, clubs, events, users} from '../schema.ts';
import {isUuid, mapClubRow, mapEventRow, mapMembershipRow, slugify} from './mappers.ts';

export class ClubsRepository {
  private async findClubRow(
    tx: Parameters<Parameters<typeof withRlsTransaction>[1]>[0],
    clubIdOrSlug: string,
  ): Promise<typeof clubs.$inferSelect | null> {
    const condition = isUuid(clubIdOrSlug)
      ? eq(clubs.id, clubIdOrSlug)
      : eq(clubs.slug, clubIdOrSlug);
    const rows = await tx.select().from(clubs).where(condition).limit(1);
    return rows[0] || null;
  }

  async listClubs(filters?: {
    search?: string;
    category?: string;
    includeAllStatuses?: boolean;
  }): Promise<Club[]> {
    return withRlsTransaction('clubs.list', async (tx) => {
      const clubRows = await tx.select().from(clubs).orderBy(desc(clubs.followerCount), asc(clubs.name));
      const memberRows = await tx
        .select({
          clubId: clubMemberships.clubId,
          count: sql<number>`count(*)::int`,
        })
        .from(clubMemberships)
        .where(eq(clubMemberships.status, 'active'))
        .groupBy(clubMemberships.clubId);

      const eventRows = await tx
        .select({
          clubId: events.clubId,
          count: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(eq(events.status, 'published'))
        .groupBy(events.clubId);

      const memberCountMap = new Map(memberRows.map((r) => [r.clubId, r.count]));
      const eventCountMap = new Map(eventRows.map((r) => [r.clubId, r.count]));

      return clubRows
        .map((c) =>
          mapClubRow(c, {
            memberCount: memberCountMap.get(c.id) ?? 0,
            upcomingEventsCount: eventCountMap.get(c.id) ?? 0,
          }),
        )
        .filter((club) => {
          if (!filters?.includeAllStatuses && club.status !== 'active') return false;
          if (filters?.category && filters.category !== 'All' && club.category !== filters.category) {
            return false;
          }
          if (filters?.search) {
            const q = filters.search.toLowerCase();
            return (
              club.name.toLowerCase().includes(q) ||
              club.tagline.toLowerCase().includes(q) ||
              club.category.toLowerCase().includes(q)
            );
          }
          return true;
        });
    });
  }

  async getClubDetail(clubIdOrSlug: string, viewerUserId?: string): Promise<ClubDetail | null> {
    return withRlsTransaction('clubs.detail', async (tx) => {
      const clubRow = await this.findClubRow(tx, clubIdOrSlug);
      if (!clubRow) return null;

      const teamRows = await tx
        .select({
          membership: clubMemberships,
          userName: users.displayName,
          userEmail: users.email,
        })
        .from(clubMemberships)
        .innerJoin(users, eq(clubMemberships.userId, users.id))
        .where(and(eq(clubMemberships.clubId, clubRow.id), eq(clubMemberships.status, 'active')));

      const upcomingEventRows = await tx
        .select()
        .from(events)
        .where(and(eq(events.clubId, clubRow.id), eq(events.status, 'published')))
        .orderBy(asc(events.startsAt));

      let isFollowing = false;
      if (isUuid(viewerUserId)) {
        const followRows = await tx
          .select({id: clubFollows.id})
          .from(clubFollows)
          .where(and(eq(clubFollows.clubId, clubRow.id), eq(clubFollows.userId, viewerUserId)))
          .limit(1);
        isFollowing = followRows.length > 0;
      }

      const mappedClub = mapClubRow(clubRow, {
        memberCount: teamRows.length,
        upcomingEventsCount: upcomingEventRows.length,
      });

      return {
        ...mappedClub,
        team: teamRows.map((r) =>
          mapMembershipRow(r.membership, {
            userName: r.userName,
            userEmail: r.userEmail,
            clubName: clubRow.name,
          }),
        ),
        upcomingEvents: upcomingEventRows.map((ev) =>
          mapEventRow(ev, {clubName: clubRow.name}),
        ),
        isFollowing,
      };
    });
  }

  async createClub(input: {
    name: string;
    category: Club['category'];
    tagline: string;
    description: string;
    meetingSchedule: string;
    contactEmail: string;
  }): Promise<Club> {
    const baseSlug = slugify(input.name) || `club-${Date.now()}`;
    return withRlsTransaction('clubs.create', async (tx) => {
      const existingBySlug = await tx
        .select({id: clubs.id})
        .from(clubs)
        .where(eq(clubs.slug, baseSlug))
        .limit(1);
      const slug = existingBySlug.length > 0 ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;

      try {
        const [inserted] = await tx
          .insert(clubs)
          .values({
            name: input.name.trim(),
            slug,
            category: input.category,
            tagline: input.tagline.trim(),
            description: input.description.trim(),
            meetingSchedule: input.meetingSchedule.trim(),
            contactEmail: input.contactEmail.trim(),
            status: 'active',
            followerCount: 0,
            foundedYear: new Date().getFullYear(),
          })
          .returning();

        return mapClubRow(inserted, {memberCount: 0, upcomingEventsCount: 0});
      } catch (err: unknown) {
        if ((err as {code?: string})?.code === '23505') {
          throw new ConflictError('A club with this name or slug already exists');
        }
        throw err;
      }
    });
  }

  async updateClub(clubId: string, updates: Partial<Club>): Promise<Club | null> {
    if (!isUuid(clubId)) return null;
    return withRlsTransaction('clubs.update', async (tx) => {
      const setData: Partial<typeof clubs.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (updates.name !== undefined) setData.name = updates.name.trim();
      if (updates.category !== undefined) setData.category = updates.category;
      if (updates.tagline !== undefined) setData.tagline = updates.tagline.trim();
      if (updates.description !== undefined) setData.description = updates.description.trim();
      if (updates.meetingSchedule !== undefined) setData.meetingSchedule = updates.meetingSchedule.trim();
      if (updates.contactEmail !== undefined) setData.contactEmail = updates.contactEmail.trim();
      if (updates.logoUrl !== undefined) setData.logoUrl = updates.logoUrl;

      const updated = await tx
        .update(clubs)
        .set(setData)
        .where(eq(clubs.id, clubId))
        .returning();
      return updated[0] ? mapClubRow(updated[0]) : null;
    });
  }

  async updateClubStatus(clubId: string, status: ClubStatus): Promise<Club | null> {
    if (!isUuid(clubId)) return null;
    return withRlsTransaction('clubs.updateStatus', async (tx) => {
      const updated = await tx
        .update(clubs)
        .set({status, updatedAt: new Date()})
        .where(eq(clubs.id, clubId))
        .returning();
      return updated[0] ? mapClubRow(updated[0]) : null;
    });
  }

  async getMembershipsForUser(userId: string): Promise<ClubMembership[]> {
    if (!isUuid(userId)) return [];
    return withRlsTransaction(
      'memberships.forUser',
      async (tx) => {
        const rows = await tx
          .select({
            membership: clubMemberships,
            clubName: clubs.name,
            userName: users.displayName,
            userEmail: users.email,
          })
          .from(clubMemberships)
          .innerJoin(clubs, eq(clubMemberships.clubId, clubs.id))
          .innerJoin(users, eq(clubMemberships.userId, users.id))
          .where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.status, 'active')));

        return rows.map((r) =>
          mapMembershipRow(r.membership, {
            clubName: r.clubName,
            userName: r.userName,
            userEmail: r.userEmail,
          }),
        );
      },
      {globalRole: 'auth_resolver'},
    );
  }

  async getClubMemberships(clubId: string): Promise<ClubMembership[]> {
    if (!isUuid(clubId)) return [];
    return withRlsTransaction('memberships.forClub', async (tx) => {
      const rows = await tx
        .select({
          membership: clubMemberships,
          clubName: clubs.name,
          userName: users.displayName,
          userEmail: users.email,
        })
        .from(clubMemberships)
        .innerJoin(clubs, eq(clubMemberships.clubId, clubs.id))
        .innerJoin(users, eq(clubMemberships.userId, users.id))
        .where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.status, 'active')));

      return rows.map((r) =>
        mapMembershipRow(r.membership, {
          clubName: r.clubName,
          userName: r.userName,
          userEmail: r.userEmail,
        }),
      );
    });
  }

  async upsertClubMembership(input: {
    clubId: string;
    userId: string;
    role: ClubMembership['role'];
    title: string;
    permissions: CoreMemberPermission[];
  }): Promise<ClubMembership> {
    if (!isUuid(input.clubId) || !isUuid(input.userId)) {
      throw new NotFoundError('Club or user record not found');
    }

    const effectivePermissions: CoreMemberPermission[] =
      input.role === 'club_admin' ? [...CORE_MEMBER_PERMISSIONS] : [...input.permissions];

    return withRlsTransaction('memberships.upsert', async (tx) => {
      const [clubRow] = await tx.select().from(clubs).where(eq(clubs.id, input.clubId)).limit(1);
      if (!clubRow) throw new NotFoundError('Club not found');

      const [userRow] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!userRow) throw new NotFoundError('User not found');

      const [upserted] = await tx
        .insert(clubMemberships)
        .values({
          clubId: input.clubId,
          userId: input.userId,
          membershipRole: input.role,
          title: input.title.trim(),
          permissions: effectivePermissions,
          status: 'active',
        })
        .onConflictDoUpdate({
          target: [clubMemberships.userId, clubMemberships.clubId],
          set: {
            membershipRole: input.role,
            title: input.title.trim(),
            permissions: effectivePermissions,
            status: 'active',
            updatedAt: new Date(),
          },
        })
        .returning();

      return mapMembershipRow(upserted, {
        clubName: clubRow.name,
        userName: userRow.displayName,
        userEmail: userRow.email,
      });
    });
  }

  async updateMembershipPermissions(
    clubId: string,
    membershipId: string,
    updates: {
      role?: ClubMembership['role'];
      title?: string;
      permissions: CoreMemberPermission[];
    },
  ): Promise<ClubMembership | null> {
    if (!isUuid(clubId) || !isUuid(membershipId)) return null;
    return withRlsTransaction('memberships.updatePermissions', async (tx) => {
      const [existing] = await tx
        .select()
        .from(clubMemberships)
        .where(and(eq(clubMemberships.id, membershipId), eq(clubMemberships.clubId, clubId)))
        .limit(1);
      if (!existing) return null;

      const nextRole = updates.role || (existing.membershipRole as ClubMembership['role']);
      const nextPermissions: CoreMemberPermission[] =
        nextRole === 'club_admin' ? [...CORE_MEMBER_PERMISSIONS] : [...updates.permissions];

      const [updated] = await tx
        .update(clubMemberships)
        .set({
          membershipRole: nextRole,
          title: updates.title?.trim() || existing.title,
          permissions: nextPermissions,
          updatedAt: new Date(),
        })
        .where(eq(clubMemberships.id, membershipId))
        .returning();

      const [userRow] = await tx.select().from(users).where(eq(users.id, updated.userId)).limit(1);
      const [clubRow] = await tx.select().from(clubs).where(eq(clubs.id, updated.clubId)).limit(1);

      return mapMembershipRow(updated, {
        userName: userRow?.displayName,
        userEmail: userRow?.email,
        clubName: clubRow?.name,
      });
    });
  }

  async removeClubMembership(clubId: string, membershipId: string): Promise<boolean> {
    if (!isUuid(clubId) || !isUuid(membershipId)) return false;
    return withRlsTransaction('memberships.remove', async (tx) => {
      const deleted = await tx
        .delete(clubMemberships)
        .where(and(eq(clubMemberships.id, membershipId), eq(clubMemberships.clubId, clubId)))
        .returning({id: clubMemberships.id});
      return deleted.length > 0;
    });
  }

  async getFollowsForUser(userId: string): Promise<ClubFollow[]> {
    if (!isUuid(userId)) return [];
    return withRlsTransaction('follows.forUser', async (tx) => {
      const rows = await tx
        .select()
        .from(clubFollows)
        .where(eq(clubFollows.userId, userId))
        .orderBy(asc(clubFollows.createdAt));

      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        clubId: r.clubId,
        followedAt: r.createdAt.toISOString(),
      }));
    });
  }

  async followClub(userId: string, clubIdOrSlug: string): Promise<ClubFollow> {
    if (!isUuid(userId)) throw new NotFoundError('User account not found');

    return withRlsTransaction('follows.followClub', async (tx) => {
      // Lock the user's row first to serialize concurrent follow requests by the same student
      await tx.execute(sql`SELECT id FROM public.users WHERE id = ${userId} FOR UPDATE`);

      const clubRow = await this.findClubRow(tx, clubIdOrSlug);
      if (!clubRow || clubRow.status !== 'active') {
        throw new NotFoundError('Active club not found');
      }

      const existing = await tx
        .select({id: clubFollows.id})
        .from(clubFollows)
        .where(and(eq(clubFollows.userId, userId), eq(clubFollows.clubId, clubRow.id)))
        .limit(1);
      if (existing.length > 0) {
        throw new ConflictError('You are already following this club');
      }

      const countRows = await tx
        .select({count: sql<number>`count(*)::int`})
        .from(clubFollows)
        .where(eq(clubFollows.userId, userId));
      const currentCount = countRows[0]?.count ?? 0;

      if (currentCount >= MAX_FOLLOWED_CLUBS) {
        throw new BusinessRuleError(
          'MAX_CLUB_FOLLOW_LIMIT_REACHED',
          `Students can follow a maximum of ${MAX_FOLLOWED_CLUBS} clubs. Unfollow an existing club before following ${clubRow.name}.`,
          {limit: MAX_FOLLOWED_CLUBS, currentCount},
        );
      }

      try {
        const [inserted] = await tx
          .insert(clubFollows)
          .values({
            userId,
            clubId: clubRow.id,
          })
          .returning();

        return {
          id: inserted.id,
          userId: inserted.userId,
          clubId: inserted.clubId,
          followedAt: inserted.createdAt.toISOString(),
        };
      } catch (err: unknown) {
        if ((err as {code?: string})?.code === '23505') {
          throw new ConflictError('You are already following this club');
        }
        throw err;
      }
    });
  }

  async unfollowClub(userId: string, clubIdOrSlug: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    return withRlsTransaction('follows.unfollowClub', async (tx) => {
      const clubRow = await this.findClubRow(tx, clubIdOrSlug);
      if (!clubRow) return false;

      const deleted = await tx
        .delete(clubFollows)
        .where(and(eq(clubFollows.userId, userId), eq(clubFollows.clubId, clubRow.id)))
        .returning({id: clubFollows.id});
      return deleted.length > 0;
    });
  }

  async getHallOfFame(): Promise<HallOfFameEntry[]> {
    return withRlsTransaction('hallOfFame.rankings', async (tx) => {
      const activeClubRows = await tx
        .select()
        .from(clubs)
        .where(eq(clubs.status, 'active'))
        .orderBy(desc(clubs.followerCount), asc(clubs.name));

      const eventCounts = await tx
        .select({
          clubId: events.clubId,
          count: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(inArray(events.status, ['published', 'completed']))
        .groupBy(events.clubId);

      const eventsMap = new Map(eventCounts.map((e) => [e.clubId, e.count]));
      const mapped = activeClubRows.map((c) =>
        mapClubRow(c, {upcomingEventsCount: eventsMap.get(c.id) ?? 0}),
      );

      let currentRank = 1;
      return mapped.map((club, idx) => {
        if (idx > 0 && club.followerCount < mapped[idx - 1].followerCount) {
          currentRank = idx + 1;
        }
        const tieCount = mapped.filter((o) => o.followerCount === club.followerCount).length;
        return {
          rank: currentRank,
          club,
          followerCount: club.followerCount,
          eventsHosted: eventsMap.get(club.id) ?? 0,
          tieCount,
        };
      });
    });
  }
}
