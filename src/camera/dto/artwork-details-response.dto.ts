export class DetailedInfoDto {
  historicalContext: string;
  visualDescription: string;
  symbolism: string;
  artistBio: string;
  interestingFacts: string[];
}

export class ArtworkDetailsResponseDto {
  success: boolean;
  detailedInfo: DetailedInfoDto;
}
