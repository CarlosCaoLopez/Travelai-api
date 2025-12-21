export interface GoogleLensResultItem {
  type: string;
  title?: string;
  url: string;
  domain?: string;
  description?: string;
  rank_group?: number;
  rank_absolute?: number;
}

export interface GoogleLensResult {
  success: boolean;
  urls: string[];
  items: GoogleLensResultItem[];
  error?: string;
  cost?: number;
}
