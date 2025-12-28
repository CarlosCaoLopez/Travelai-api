export const QUOTA_EXCEEDED_MESSAGES = {
  es: 'Has alcanzado tu límite diario de reconocimientos. Intenta mañana o mejora a Premium para reconocimientos ilimitados.',
  en: 'You have reached your daily recognition limit. Try again tomorrow or upgrade to Premium for unlimited recognitions.',
  fr: 'Vous avez atteint votre limite quotidienne de reconnaissance. Réessayez demain ou passez à Premium pour des reconnaissances illimitées.',
};

export function getQuotaExceededMessage(language: string): string {
  return QUOTA_EXCEEDED_MESSAGES[language] || QUOTA_EXCEEDED_MESSAGES.es;
}
