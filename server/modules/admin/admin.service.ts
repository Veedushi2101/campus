import type {
  AdminDashboardStats,
  AuditLogEntry,
  Club,
  ClubStatus,
  EventReport,
  FinancialReport,
  SystemSettings,
  UserAccount,
} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {BusinessRuleError, NotFoundError} from '../../shared/errors/AppError.ts';

export class AdminService {
  constructor(private readonly adapter: DataAdapter) {}

  async getDashboard(): Promise<AdminDashboardStats> {
    return this.adapter.getAdminDashboardStats();
  }

  async listAllClubs(status?: ClubStatus): Promise<Club[]> {
    return this.adapter.listClubs({
      status,
      includeAllStatuses: !status,
    });
  }

  async listAllMemberships() {
    return this.adapter.listAllMemberships();
  }

  async updateClubStatus(
    clubId: string,
    status: ClubStatus,
    actor: {id: string; name: string},
    reason?: string,
  ): Promise<Club> {
    const club = await this.adapter.updateClubStatus(clubId, status);
    if (!club) throw new NotFoundError('Club not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action: `CLUB_STATUS_${status.toUpperCase()}`,
      targetType: 'club',
      targetId: club.id,
      targetLabel: club.name,
      details: reason || `Changed club status to ${status}.`,
    });
    return club;
  }

  async listUsers(): Promise<UserAccount[]> {
    return this.adapter.listUsers();
  }

  async updateUserStatus(
    userId: string,
    status: 'active' | 'suspended',
    actor: {id: string; name: string},
    reason?: string,
  ): Promise<UserAccount> {
    if (userId === actor.id && status === 'suspended') {
      throw new BusinessRuleError('CANNOT_SELF_SUSPEND', 'Super Admin cannot suspend their own account');
    }
    const user = await this.adapter.updateUserStatus(userId, status);
    if (!user) throw new NotFoundError('User not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action: `USER_STATUS_${status.toUpperCase()}`,
      targetType: 'user',
      targetId: user.id,
      targetLabel: `${user.name} (${user.email})`,
      details: reason || `Set account status to ${status}.`,
    });
    return user;
  }

  async listAllEventReports(): Promise<EventReport[]> {
    return this.adapter.listAllEventReports();
  }

  async listAllFinancialReports(): Promise<{
    reports: FinancialReport[];
    totalCollections: number;
    totalExpenses: number;
    netBalance: number;
  }> {
    const reports = await this.adapter.listAllFinancialReports();
    const totalCollections = reports.reduce((s, r) => s + r.totalCollections, 0);
    const totalExpenses = reports.reduce((s, r) => s + r.totalExpenses, 0);
    return {
      reports,
      totalCollections,
      totalExpenses,
      netBalance: totalCollections - totalExpenses,
    };
  }

  async listAuditLogs(): Promise<AuditLogEntry[]> {
    return this.adapter.listAuditLogs();
  }

  async getSettings(): Promise<SystemSettings> {
    return this.adapter.getSystemSettings();
  }

  async updateSettings(
    updates: Partial<SystemSettings>,
    actor: {id: string; name: string},
  ): Promise<SystemSettings> {
    const updated = await this.adapter.updateSystemSettings(updates);
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action: 'UPDATED_SYSTEM_SETTINGS',
      targetType: 'system',
      targetId: 'system-settings',
      targetLabel: 'CampusVerse Policy Config',
      details: `Updated institutional configuration flags.`,
    });
    return updated;
  }
}
