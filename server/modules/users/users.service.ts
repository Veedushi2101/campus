import type {UserAccount} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError} from '../../shared/errors/AppError.ts';

export class UsersService {
  constructor(private readonly adapter: DataAdapter) {}

  async getMyProfile(userId: string): Promise<UserAccount> {
    const user = await this.adapter.getUserById(userId);
    if (!user) throw new NotFoundError('User profile not found');
    return user;
  }

  async updateMyProfile(
    userId: string,
    updates: {name: string; department: string; yearOfStudy: string},
  ): Promise<UserAccount> {
    const updated = await this.adapter.updateUserProfile(userId, updates);
    if (!updated) throw new NotFoundError('User profile not found');
    return updated;
  }
}
