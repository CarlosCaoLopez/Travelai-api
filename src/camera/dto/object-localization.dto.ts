/**
 * DTOs and interfaces for Google Cloud Vision Object Localization
 */

/**
 * Normalized vertex coordinates (0.0 to 1.0 range)
 * Relative to image dimensions
 */
export interface NormalizedVertex {
  x: number;
  y: number;
}

/**
 * Bounding polygon containing normalized vertices
 */
export interface BoundingPoly {
  normalizedVertices: NormalizedVertex[];
}

/**
 * A single localized object detected in the image
 */
export interface LocalizedObject {
  /** Knowledge Graph entity ID */
  mid?: string;
  /** Human-readable object name (e.g., "Statue", "Building") */
  name: string;
  /** Confidence score (0.0 to 1.0) */
  score: number;
  /** Bounding box with normalized coordinates */
  boundingPoly: BoundingPoly;
}

/**
 * Result from object localization analysis
 */
export interface ObjectLocalizationResult {
  /** Array of detected objects */
  objects: LocalizedObject[];
  /** Indicates if any relevant artwork/monument objects were found */
  hasRelevantObjects: boolean;
  /** The highest confidence object (if any) */
  primaryObject?: LocalizedObject;
}
