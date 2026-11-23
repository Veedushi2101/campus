import {asc, eq, or, sql} from 'drizzle-orm';
import type {UserAccount} from '../../../shared/types/domain.ts';
import {withRlsTransaction} from '../index.ts';
import {authSessions, users} from '../schema.ts';
import {computeInitials, isUuid, mapUserRow} from './mappers.ts';

export class UsersRepository {
  async getUserById(userId: string): Promise<UserAccount | null> {
    if (!isUuid(userId)) return null;
    return withRlsTransaction(
      'users.getById',
      async (tx) => {
        const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
        return rows[0] ? mapUserRow(rows[0]) : null;
      },
      {globalRole: 'auth_resolver'},
    );
  }

  async getUserByEmail(email: string): Promise<UserAccount | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    return withRlsTransaction(
      'users.getByEmail',
      async (tx) => {
        const rows = await tx
          .select()
          .from(users)
          .where(eq(users.normalizedEmail, normalized))
          .limit(1);
        return rows[0] ? mapUserRow(rows[0]) : null;
      },
      {globalRole: 'auth_resolver'},
    );
  }

  async provisionAuthenticatedUser(input: {
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }): Promise<UserAccount> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const displayName =
      input.name?.trim() ||
      normalizedEmail
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    return withRlsTransaction(
      'users.provisionAuthenticated',
      async (tx) => {
        const existing = await tx
          .select()
          .from(users)
          .where(
            or(
              eq(users.authUserId, input.authUserId),
              eq(users.normalizedEmail, normalizedEmail),
            ),
          )
          .limit(1);

        if (existing[0]) {
          const row = existing[0];
          const nextGlobalRole =
            input.isBootstrapSuperAdmin && row.globalRole !== 'super_admin'
              ? 'super_admin'
              : row.globalRole;
          const nextVerifiedAt =
            row.emailVerifiedAt || (input.emailVerified ? new Date() : null);

          if (
            row.authUserId !== input.authUserId ||
            nextGlobalRole !== row.globalRole ||
            nextVerifiedAt !== row.emailVerifiedAt
          ) {
            const updated = await tx
              .update(users)
              .set({
                authUserId: input.authUserId,
                globalRole: nextGlobalRole,
                emailVerifiedAt: nextVerifiedAt,
                updatedAt: new Date(),
              })
              .where(eq(users.id, row.id))
              .returning();
            return mapUserRow(updated[0]);
          }
          return mapUserRow(row);
        }

        const studentCode = `STU-${new Date().getFullYear()}-${input.authUserId.slice(0, 6).toUpperCase()}`;
        const inserted = await tx
          .insert(users)
          .values({
            authUserId: input.authUserId,
            email: input.email.trim(),
            normalizedEmail,
            displayName: displayName || 'CampusVerse Student',
            department: input.department?.trim() || 'Computer Science & Engineering',
            yearOfStudy: input.yearOfStudy?.trim() || 'Undergraduate',
            studentId: studentCode,
            globalRole: input.isBootstrapSuperAdmin ? 'super_admin' : 'user',
            accountStatus: 'active',
            emailVerifiedAt: input.emailVerified ? new Date() : null,
          })
          .returning();

        return mapUserRow(inserted[0]);
      },
      {globalRole: 'auth_resolver'},
    );
  }

  async recordAuthSession(input: {
    userId: string;
    ipHash?: string;
    userAgent?: string;
  }): Promise<void> {
    if (!isUuid(input.userId)) return;
    await withRlsTransaction(
      'users.recordAuthSession',
      async (tx) => {
        await tx.insert(authSessions).values({
          userId: input.userId,
          ipHash: input.ipHash ?? null,
          userAgent: input.userAgent?.slice(0, 240) ?? null,
        });
      },
      {userId: input.userId, globalRole: 'auth_resolver'},
    );
  }

  async listUsers(): Promise<UserAccount[]> {
    return withRlsTransaction('users.list', async (tx) => {
      const rows = await tx.select().from(users).orderBy(asc(users.displayName));
      return rows.map(mapUserRow);
    });
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserAccount, 'name' | 'department' | 'yearOfStudy'>>,
  ): Promise<UserAccount | null> {
    if (!isUuid(userId)) return null;
    return withRlsTransaction('users.updateProfile', async (tx) => {
      const setData: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (updates.name?.trim()) setData.displayName = updates.name.trim();
      if (updates.department?.trim()) setData.department = updates.department.trim();
      if (updates.yearOfStudy?.trim()) setData.yearOfStudy = updates.yearOfStudy.trim();

      const updated = await tx
        .update(users)
        .set(setData)
        .where(eq(users.id, userId))
        .returning();
      return updated[0] ? mapUserRow(updated[0]) : null;
    });
  }

  async updateUserStatus(
    userId: string,
    status: 'active' | 'suspended',
  ): Promise<UserAccount | null> {
    if (!isUuid(userId)) return null;
    return withRlsTransaction('users.updateStatus', async (tx) => {
      const updated = await tx
        .update(users)
        .set({
          accountStatus: status,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
      return updated[0] ? mapUserRow(updated[0]) : null;
    });
  }

  async getInitials(name: string): Promise<string> {
    return computeInitials(name);
  }
}
