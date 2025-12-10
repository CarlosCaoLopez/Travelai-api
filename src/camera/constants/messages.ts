export const RECOGNITION_MESSAGES = {
  es: {
    SUCCESS_IDENTIFIED: '¡Obra identificada! Se ha guardado en tu colección.',
    NOT_IDENTIFIED:
      'No pudimos identificar la obra de arte. Intenta con mejor iluminación o desde otro ángulo.',
    LOW_CONFIDENCE:
      'La imagen no es clara. Intenta tomar otra foto más cercana.',
    NOT_ARTWORK: 'No detectamos una obra de arte en la imagen.',
    INVALID_FORMAT:
      'Formato de imagen inválido. Solo se aceptan JPG, PNG y HEIC.',
    FILE_TOO_LARGE: 'La imagen es demasiado grande. El tamaño máximo es 10MB.',
    MISSING_IMAGE: 'Debes proporcionar una imagen.',
    MISSING_LOCAL_URI:
      'Debes proporcionar el URI local de la imagen capturada.',
    PROCESSING_ERROR:
      'Error al procesar la imagen. Por favor, intenta de nuevo.',
    RATE_LIMIT:
      'Has alcanzado el límite de reconocimientos. Intenta más tarde.',
  },
  en: {
    SUCCESS_IDENTIFIED:
      'Artwork identified! It has been saved to your collection.',
    NOT_IDENTIFIED:
      'We could not identify the artwork. Try with better lighting or from another angle.',
    LOW_CONFIDENCE:
      'The image is not clear. Try taking another photo closer up.',
    NOT_ARTWORK: 'We did not detect an artwork in the image.',
    INVALID_FORMAT:
      'Invalid image format. Only JPG, PNG and HEIC are accepted.',
    FILE_TOO_LARGE: 'The image is too large. Maximum size is 10MB.',
    MISSING_IMAGE: 'You must provide an image.',
    MISSING_LOCAL_URI: 'You must provide the local URI of the captured image.',
    PROCESSING_ERROR: 'Error processing the image. Please try again.',
    RATE_LIMIT: 'You have reached the recognition limit. Try again later.',
  },
  fr: {
    SUCCESS_IDENTIFIED:
      'Œuvre identifiée ! Elle a été sauvegardée dans votre collection.',
    NOT_IDENTIFIED:
      "Nous n'avons pas pu identifier l'œuvre. Essayez avec un meilleur éclairage ou sous un autre angle.",
    LOW_CONFIDENCE:
      "L'image n'est pas claire. Essayez de prendre une autre photo plus près.",
    NOT_ARTWORK: "Nous n'avons pas détecté d'œuvre d'art dans l'image.",
    INVALID_FORMAT:
      "Format d'image invalide. Seuls JPG, PNG et HEIC sont acceptés.",
    FILE_TOO_LARGE:
      "L'image est trop volumineuse. La taille maximale est de 10 Mo.",
    MISSING_IMAGE: 'Vous devez fournir une image.',
    MISSING_LOCAL_URI: "Vous devez fournir l'URI local de l'image capturée.",
    PROCESSING_ERROR:
      "Erreur lors du traitement de l'image. Veuillez réessayer.",
    RATE_LIMIT:
      'Vous avez atteint la limite de reconnaissance. Réessayez plus tard.',
  },
};

export function getMessage(
  language: string,
  key: keyof (typeof RECOGNITION_MESSAGES)['es'],
): string {
  const messages = RECOGNITION_MESSAGES[language] || RECOGNITION_MESSAGES.es;
  return messages[key];
}
