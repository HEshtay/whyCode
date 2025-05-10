/**
 * Represents a single "Why" annotation that explains a piece of code.
 * Each annotation is uniquely identified and contains metadata about its creation.
 */
export interface Annotation {
  filePath: string;
  range: AnnotationRange;
  text: string;
  tags: string[];
  author: string;
  createdAt: string;
  id: string;
}

/**
 * Structure of the .whyannotations.json file that stores all annotations
 * for a workspace.
 */
export interface AnnotationsFile {
  annotations: Annotation[];
}

/**
 * Represents the range of code that an annotation is attached to.
 * Uses zero-based line and character positions.
 */
export interface AnnotationRange {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
  }
