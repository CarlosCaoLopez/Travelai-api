export class UserResponseDto {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_language: string;
  is_premium: boolean;
  created_at: string;
}
