import {and, asc, eq, inArray, sql} from 'drizzle-orm';
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
import {withRlsTransaction, type DbTx} from '../index.ts';
import {dbRequestContext} from '../requestContext.ts';
import {clubFollows, clubMemberships, clubs, events, users} from '../schema.ts';
import {
  isPgUniqueViolation,
  isUuid,
  mapClubRow,
  mapEventRow,
  mapMembershipRow,
  slugify,
} from './mappers.ts';

export class ClubsRepository {
  private async findClubRow(
    tx: DbTx,
    clubIdOrSlug: string,
  ): Promise<typeof clubs.$inferSelect | null> {
    const condition = isUuid(clubIdOrSlug)
      ? eq(clubs.id, clubIdOrSlug)
      : eq(clubs.slug, clubIdOrSlug);
    const rows = await tx.select().from(clubs).where(condition).limit(1);
    return rows[0] || null;
  }

  private async getLiveFollowCountMap(tx: DbTx): Promise<Map<string, number>> {
    const rows = await tx.execute<{club_id: string; follower_count: number}>(
      sql`SELECT club_id, follower_count FROM public.get_live_club_follow_counts()`,
    );
    return new Map(rows.map((r) => [r.club_id, Number(r.follower_count) || 0]));
  }

  private async getPublicMemberCountMap(tx: DbTx): Promise<Map<string, number>> {
    const rows = await tx.execute<{club_id: string; member_count: number}>(
      sql`SELECT club_id, member_count FROM public.get_public_club_member_counts()`,
    );
    return new Map(rows.map((r) => [r.club_id, Number(r.member_count) || 0]));
  }

  async listClubs(filters?: {
    search?: string;
    category?: string;
    status?: ClubStatus;
    includeAllStatuses?: boolean;
  }): Promise<Club[]> {
    return withRlsTransaction('clubs.list', async (tx) => {
      const [clubRows, memberCountMap, followCountMap, eventRows] = await Promise.all([
        tx.select().from(clubs).orderBy(asc(clubs.name)),
        this.getPublicMemberCountMap(tx),
        this.getLiveFollowCountMap(tx),
        tx
          .select({
            clubId: events.clubId,
            count: sql<number>`count(*)::int`,
          })
          .from(events)
          .where(eq(events.status, 'published'))
          .groupBy(events.clubId),
      ]);

      const eventCountMap = new Map(eventRows.map((r) => [r.clubId, r.count]));

      return clubRows
        .map((c) => {
          const liveFollowers = followCountMap.get(c.id) ?? 0;
          return mapClubRow(
            {...c, followerCount: liveFollowers},
            {
              memberCount: memberCountMap.get(c.id) ?? 0,
              upcomingEventsCount: eventCountMap.get(c.id) ?? 0,
            },
          );
        })
        .filter((club) => {
          if (!filters?.includeAllStatuses && club.status !== 'active') return false;
          if (filters?.status && club.status !== filters.status) return false;
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
        })
        .sort((a, b) => b.followerCount - a.followerCount || a.name.localeCompare(b.name));
    });
  }

  async getClubDetail(clubIdOrSlug: string, viewerUserId?: string): Promise<ClubDetail | null> {
    return withRlsTransaction('clubs.detail', async (tx) => {
      const clubRow = await this.findClubRow(tx, clubIdOrSlug);
      if (!clubRow) return null;

      const ctx = dbRequestContext.get();
      const isSuperAdmin = ctx.globalRole === 'super_admin';

      // Fetch narrow team rows (no email/PII exposed unless super_admin or club_admin of this club)
      const teamRows = await tx.execute<{
        id: string;
        user_id: string;
        user_name: string;
        club_id: string;
        membership_role: string;
        title: string;
        permissions: CoreMemberPermission[];
        assigned_tasks: string[];
        created_at: Date | string;
      }>(sql`SELECT id, user_id, user_name, club_id, membership_role, title, permissions, assigned_tasks, created_at FROM public.get_public_club_team(${clubRow.id})`);

      const viewerIsClubMember = isUuid(viewerUserId)
        ? teamRows.some((r) => r.user_id === viewerUserId)
        : false;
      const viewerIsClubAdmin = isUuid(viewerUserId)
        ? teamRows.some((r) => r.user_id === viewerUserId && r.membership_role === 'club_admin')
        : false;

      if (clubRow.status !== 'active' && !isSuperAdmin && !viewerIsClubMember) {
        return null;
      }

      let emailByUserId = new Map<string, string>();
      if ((isSuperAdmin || viewerIsClubAdmin) && teamRows.length > 0) {
        const userRows = await tx
          .select({id: users.id, email: users.email})
          .from(users)
          .where(
            inArray(
              users.id,
              teamRows.map((t) => t.user_id),
            ),
          );
        emailByUserId = new Map(userRows.map((u) => [u.id, u.email]));
      }

      const [upcomingEventRows, followCountMap] = await Promise.all([
        tx
          .select()
          .from(events)
          .where(and(eq(events.clubId, clubRow.id), eq(events.status, 'published')))
          .orderBy(asc(events.startsAt)),
        this.getLiveFollowCountMap(tx),
      ]);

      let isFollowing = false;
      if (isUuid(viewerUserId)) {
        const followRows = await tx
          .select({id: clubFollows.id})
          .from(clubFollows)
          .where(and(eq(clubFollows.clubId, clubRow.id), eq(clubFollows.userId, viewerUserId)))
          .limit(1);
        isFollowing = followRows.length > 0;
      }

      const liveFollowers = followCountMap.get(clubRow.id) ?? 0;
      const mappedClub = mapClubRow(
        {...clubRow, followerCount: liveFollowers},
        {
          memberCount: teamRows.length,
          upcomingEventsCount: upcomingEventRows.length,
        },
      );

      return {
        ...mappedClub,
        team: teamRows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          userName: r.user_name,
          userEmail: emailByUserId.get(r.user_id),
          clubId: r.club_id,
          clubName: clubRow.name,
          role: r.membership_role as ClubMembership['role'],
          title: r.title,
          permissions: Array.isArray(r.permissions) ? r.permissions : [],
          assignedTasks: Array.isArray(r.assigned_tasks) ? r.assigned_tasks : [],
          joinedAt: new Date(r.created_at).toISOString(),
        })),
        upcomingEvents: upcomingEventRows.map((ev) => mapEventRow(ev, {clubName: clubRow.name})),
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
    status?: ClubStatus;
    createdByUserId?: string;
  }): Promise<Club> {
    const baseSlug = slugify(input.name) || `club-${Date.now()}`;
    return withRlsTransaction('clubs.create', async (tx) => {
      const existingBySlug = await tx
        .select({id: clubs.id})
        .from(clubs)
        .where(eq(clubs.slug, baseSlug))
        .limit(1);
      const slug =
        existingBySlug.length > 0 ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;

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
            status: input.status || 'active',
            followerCount: 0,
            foundedYear: new Date().getFullYear(),
            createdBy: isUuid(input.createdByUserId) ? input.createdByUserId : null,
          })
          .returning();

        return mapClubRow(inserted, {memberCount: 0, upcomingEventsCount: 0});
      } catch (err: unknown) {
        if (isPgUniqueViolation(err)) {
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

      try {
        const updated = await tx
          .update(clubs)
          .set(setData)
          .where(eq(clubs.id, clubId))
          .returning();
        if (!updated[0]) return null;
        const followCountMap = await this.getLiveFollowCountMap(tx);
        return mapClubRow({...updated[0], followerCount: followCountMap.get(clubId) ?? 0});
      } catch (err: unknown) {
        if (isPgUniqueViolation(err)) {
          throw new ConflictError('A club with this name already exists');
        }
        throw err;
      }
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
      if (!updated[0]) return null;
      const followCountMap = await this.getLiveFollowCountMap(tx);
      return mapClubRow({...updated[0], followerCount: followCountMap.get(clubId) ?? 0});
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
        .where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.status, 'active')))
        .orderBy(asc(clubMemberships.membershipRole), asc(users.displayName));

      return rows.map((r) =>
        mapMembershipRow(r.membership, {
          clubName: r.clubName,
          userName: r.userName,
          userEmail: r.userEmail,
        }),
      );
    });
  }

  async listAllMemberships(): Promise<ClubMembership[]> {
    return withRlsTransaction('memberships.listAll', async (tx) => {
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
        .where(eq(clubMemberships.status, 'active'))
        .orderBy(asc(clubs.name), asc(clubMemberships.membershipRole), asc(users.displayName));

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
    assignedByUserId?: string;
    strictInsert?: boolean;
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

      const assignedBy = isUuid(input.assignedByUserId) ? input.assignedByUserId : null;

      try {
        if (input.strictInsert) {
          const [inserted] = await tx
            .insert(clubMemberships)
            .values({
              clubId: input.clubId,
              userId: input.userId,
              membershipRole: input.role,
              title: input.title.trim(),
              permissions: effectivePermissions,
              status: 'active',
              assignedBy,
            })
            .returning();

          return mapMembershipRow(inserted, {
            clubName: clubRow.name,
            userName: userRow.displayName,
            userEmail: userRow.email,
          });
        }

        const [upserted] = await tx
          .insert(clubMemberships)
          .values({
            clubId: input.clubId,
            userId: input.userId,
            membershipRole: input.role,
            title: input.title.trim(),
            permissions: effectivePermissions,
            status: 'active',
            assignedBy,
          })
          .onConflictDoUpdate({
            target: [clubMemberships.userId, clubMemberships.clubId],
            set: {
              membershipRole: input.role,
              title: input.title.trim(),
              permissions: effectivePermissions,
              status: 'active',
              assignedBy,
              updatedAt: new Date(),
            },
          })
          .returning();

        return mapMembershipRow(upserted, {
          clubName: clubRow.name,
          userName: userRow.displayName,
          userEmail: userRow.email,
        });
      } catch (err: unknown) {
        if (isPgUniqueViolation(err)) {
          throw new ConflictError(`${userRow.displayName} is already a member of ${clubRow.name}`);
        }
        throw err;
      }
    });
  }

  async updateMembershipPermissions(
    clubId: string,
    membershipId: string,
    updates: {
      role?: ClubMembership['role'];
      title?: string;
      permissions?: CoreMemberPermission[];
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
        nextRole === 'club_admin'
          ? [...CORE_MEMBER_PERMISSIONS]
          : updates.permissions !== undefined
            ? [...updates.permissions]
            : existing.membershipRole === 'club_admin'
              ? []
              : (existing.permissions as CoreMemberPermission[]);

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

      const targetRows = await tx.execute(
        sql`SELECT id, name, status FROM public.get_club_follow_target(${clubIdOrSlug})`,
      );
      const clubRow = targetRows[0] as {id: string; name: string; status: string} | undefined;
      if (!clubRow) {
        throw new NotFoundError('Club not found');
      }
      if (clubRow.status !== 'active') {
        throw new BusinessRuleError(
          'CLUB_NOT_ACTIVE',
          `Cannot follow ${clubRow.name} because its status is ${clubRow.status.replace('_', ' ')}`,
          {status: clubRow.status},
        );
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
        if (isPgUniqueViolation(err)) {
          throw new ConflictError('You are already following this club');
        }
        throw err;
      }
    });
  }

  async unfollowClub(userId: string, clubIdOrSlug: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    return withRlsTransaction('follows.unfollowClub', async (tx) => {
      await tx.execute(sql`SELECT id FROM public.users WHERE id = ${userId} FOR UPDATE`);

      const targetRows = await tx.execute(
        sql`SELECT id FROM public.get_club_follow_target(${clubIdOrSlug})`,
      );
      const clubRow = targetRows[0] as {id: string} | undefined;
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
      const [activeClubRows, followCountMap, memberCountMap, eventCounts] = await Promise.all([
        tx.select().from(clubs).where(eq(clubs.status, 'active')),
        this.getLiveFollowCountMap(tx),
        this.getPublicMemberCountMap(tx),
        tx
          .select({
            clubId: events.clubId,
            count: sql<number>`count(*)::int`,
          })
          .from(events)
          .where(inArray(events.status, ['published', 'completed']))
          .groupBy(events.clubId),
      ]);

      const eventsMap = new Map(eventCounts.map((e) => [e.clubId, e.count]));
      const mapped = activeClubRows
        .map((c) => {
          const liveFollowers = followCountMap.get(c.id) ?? 0;
          return {
            club: mapClubRow(
              {...c, followerCount: liveFollowers},
              {
                memberCount: memberCountMap.get(c.id) ?? 0,
                upcomingEventsCount: eventsMap.get(c.id) ?? 0,
              },
            ),
            createdAtMs: c.createdAt.getTime(),
          };
        })
        .sort(
          (a, b) =>
            b.club.followerCount - a.club.followerCount ||
            a.club.name.localeCompare(b.club.name) ||
            a.createdAtMs - b.createdAtMs,
        );

      let currentRank = 1;
      return mapped.map((item, idx) => {
        if (idx > 0 && item.club.followerCount < mapped[idx - 1].club.followerCount) {
          currentRank = idx + 1;
        }
        const tieCount = mapped.filter(
          (o) => o.club.followerCount === item.club.followerCount,
        ).length;
        return {
          rank: currentRank,
          club: item.club,
          followerCount: item.club.followerCount,
          eventsHosted: eventsMap.get(item.club.id) ?? 0,
          tieCount,
        };
      });
    });
  }
}
