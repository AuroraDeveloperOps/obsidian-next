import { User, CreateUserInput } from "../types/user";
import { ValidationError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

export class UserService {
  private users: User[] = [];
  private nextId = 1;

  createUser(input: CreateUserInput): User {
    this.validateInput(input);
    
    const user: User = {
      id: this.nextId++,
      ...input,
      createdAt: new Date()
    };
    this.users.push(user);
    logger.info(`User created`, { id: user.id, email: user.email });
    return user;
  }

  getUser(id: number): User {
    const user = this.users.find(u => u.id === id);
    if (!user) {
      throw new NotFoundError('User', id);
    }
    return user;
  }

  getAllUsers(): User[] {
    return [...this.users];
  }

  updateUser(id: number, updates: Partial<CreateUserInput>): User {
    const user = this.getUser(id);
    
    if (updates.email) {
      this.validateEmail(updates.email);
    }
    
    Object.assign(user, updates);
    logger.info(`User updated`, { id: user.id });
    return user;
  }

  deleteUser(id: number): boolean {
    const index = this.users.findIndex(u => u.id === id);
    if (index > -1) {
      this.users.splice(index, 1);
      logger.info(`User deleted`, { id });
      return true;
    }
    return false;
  }

  private validateInput(input: CreateUserInput): void {
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('Name is required');
    }
    this.validateEmail(input.email);
  }

  private validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format');
    }
  }
}
