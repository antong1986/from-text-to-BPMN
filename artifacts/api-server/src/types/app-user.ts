export interface AppUser {
  id: number;
  email: string;
  googleId: string;
  isPremium: boolean;
  freeGenerationsLeft: number;
  premiumUntil: Date | null;
  isWhitelisted: boolean;
}
