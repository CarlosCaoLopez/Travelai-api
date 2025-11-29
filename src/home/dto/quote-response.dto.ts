export class QuoteResponseDto {
  id: string;
  text: string;
  author: string;
}

export class QuotesResponseDto {
  quotes: QuoteResponseDto[];
}
