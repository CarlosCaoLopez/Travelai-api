export class UserResponseDto {
  id: string;
  email: string;
  displayName: string | null;
  preferredLanguage: string;
  isPremium: boolean;
  allowDataCollection: boolean | null;
  createdAt: string;
}
