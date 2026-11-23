import type {Club, ClubDetail} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError} from '../../shared/errors/AppError.ts';

export class ClubsService {
  constructor(private readonly adapter: DataAdapter) {}

  async listClubs(filters?: {
    search?: string;
    category?: string;
    sortBy?: 'followers' | 'name' | 'events';
  }): Promise<Club[]> {
    const clubs = await this.adapter.listClubs({
      search: filters?.search,
      category: filters?.category,
      includeAllStatuses: false,
    });

    if (filters?.sortBy === 'name') {
      return clubs.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (filters?.sortBy === 'events') {
      return clubs.sort((a, b) => b.upcomingEventsCount - a.upcomingEventsCount);
    }
    return clubs.sort((a, b) => b.followerCount - a.followerCount);
  }

  async getClubDetail(clubId: string, viewerUserId?: string): Promise<ClubDetail> {
    const detail = await this.adapter.getClubDetail(clubId, viewerUserId);
    if (!detail) throw new NotFoundError('Club not found');
    return detail;
  }

  async createClub(
    actor: {id: string; name: string},
    input: {
      name: string;
      category: Club['category'];
      tagline: string;
      description: string;
      meetingSchedule: string;
      contactEmail: string;
    },
  ): Promise<Club> {
    const club = await this.adapter.createClub(input);
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action: 'CREATED_CLUB',
      targetType: 'club',
      targetId: club.id,
      targetLabel: club.name,
      details: `Registered ${club.name} in ${club.category}.`,
    });
    return club;
  }

  async updateClub(
    clubId: string,
    actor: {id: string; name: string},
    updates: Partial<Club>,
  ): Promise<Club> {
    const updated = await this.adapter.updateClub(clubId, updates);
    if (!updated) throw new NotFoundError('Club not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Admin · ${updated.name}`,
      action: 'UPDATED_CLUB_PROFILE',
      targetType: 'club',
      targetId: updated.id,
      targetLabel: updated.name,
      details: 'Updated club profile metadata and schedule.',
    });
    return updated;
  }
}
