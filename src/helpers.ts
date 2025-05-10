import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Annotation, AnnotationsFile } from "./interfaces/annotations";

const ANNOTATIONS_FILE = ".whyannotations.json";

/**
 * Gets the full path to the annotations storage file.
 * @param workspaceFolder - The root path of the workspace
 * @returns The absolute path to the .whyannotations.json file
 */
export function getAnnotationsFilePath(workspaceFolder: string): string {
  return path.join(workspaceFolder, ANNOTATIONS_FILE);
}

/**
 * Gets the Git author information from the local Git config.
 * Retrieves the user's name and email (if available).
 *
 * @returns Promise that resolves to the author string in the format "Name <email>" or "Unknown" if not available
 */
export async function getGitAuthor(): Promise<string> {
  return new Promise((resolve) => {
    // Try to get the Git user name
    exec("git config user.name", (nameError, nameStdout, nameStderr) => {
      if (nameError || nameStderr || !nameStdout.trim()) {
        // If we can't get the name, fall back to "Unknown"
        resolve("Unknown");
        return;
      }

      const name = nameStdout.trim();

      // Try to get the Git user email
      exec("git config user.email", (emailError, emailStdout, emailStderr) => {
        if (emailError || emailStderr || !emailStdout.trim()) {
          // If we have a name but no email, just use the name
          resolve(name);
        } else {
          // If we have both name and email, combine them
          resolve(`${name} <${emailStdout.trim()}>`);
        }
      });
    });
  });
}

/**
 * Creates a new annotations file if it doesn't exist.
 * Initializes it with an empty annotations array.
 * @param filePath - Path where the annotations file should be created
 */
export function initAnnotationsFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ annotations: [] }, null, 2));
  }
}

/**
 * Loads and parses the annotations file from disk.
 * Creates a new file if none exists.
 * @param workspaceFolder - The root path of the workspace
 * @returns The parsed annotations data
 */
export function loadAnnotations(workspaceFolder: string): AnnotationsFile {
  const filePath = getAnnotationsFilePath(workspaceFolder);
  initAnnotationsFile(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
}

/**
 * Saves the annotations data to disk.
 * @param workspaceFolder - The root path of the workspace
 * @param annotations - The annotations data to save
 */
export function saveAnnotations(
  workspaceFolder: string,
  annotations: AnnotationsFile
) {
  const filePath = getAnnotationsFilePath(workspaceFolder);
  fs.writeFileSync(filePath, JSON.stringify(annotations, null, 2));
}

/**
 * Creates a formatted markdown string for annotation display
 * @param annotation - The annotation to format
 * @returns A MarkdownString with formatted annotation content
 */
export function formatAnnotationMarkdown(
  annotation: Annotation
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.supportHtml = true;

  markdown.appendMarkdown(
    `💬 Why:\n${annotation.text}\n\n` +
    (annotation.tags.length > 0
      ? `Tags: ${annotation.tags.map((t) => `#${t}`).join(" ")}\n`
      : "") +
    `— Added by ${annotation.author} on ${new Date(
      annotation.createdAt
    ).toLocaleDateString()}`
  );

  if (annotation.updatedAt) {
    markdown.appendMarkdown(
      `\n_(Last updated: ${new Date(annotation.updatedAt).toLocaleDateString()})_`
    );
  }

  markdown.appendMarkdown(
    `\n\n[Edit](command:whyAnnotations.editAnnotation?${encodeURIComponent(
      JSON.stringify({ id: annotation.id })
    )})`
  );

  return markdown;
}

/**
 * Finds an annotation by its ID in the annotations array
 * @param annotations - Array of all annotations
 * @param id - ID of the annotation to find
 * @returns The annotation if found, undefined otherwise
 */
export function findAnnotationById(
  annotations: Annotation[],
  id: string
): Annotation | undefined {
  return annotations.find((a) => a.id === id);
}

/**
 * Updates an existing annotation with new content
 * @param annotations - Array of all annotations
 * @param id - ID of the annotation to update
 * @param newText - New text content
 * @param newTags - New tags array
 * @returns A new array with the updated annotation
 */
export function updateAnnotation(
  annotations: Annotation[],
  id: string,
  newText: string,
  newTags: string[]
): Annotation[] {
  return annotations.map((a) => {
    if (a.id === id) {
      return {
        ...a,
        text: newText,
        tags: newTags,
        updatedAt: new Date().toISOString(),
      };
    }
    return a;
  });
}

/**
 * Updates the editor decorations to show annotation indicators.
 * Filters annotations to only show those relevant to the current file.
 * Displays annotations as popups.
 * @param editor - The active text editor
 * @param annotations - All annotations in the workspace
 * @param popupDecorationType - The decoration type for popup display
 */
export function updateDecorations(
  editor: vscode.TextEditor,
  annotations: Annotation[],
  popupDecorationType: vscode.TextEditorDecorationType
) {
  // Filter annotations for the current file
  const fileAnnotations = annotations.filter(
    (a) => a.filePath === editor.document.uri.fsPath
  );

  // Create hover popup decorations
  const popupDecorations: vscode.DecorationOptions[] = fileAnnotations.map(
    (annotation) => ({
      range: new vscode.Range(
        annotation.range.startLine,
        annotation.range.startCharacter,
        annotation.range.endLine,
        annotation.range.endCharacter
      ),
      hoverMessage: formatAnnotationMarkdown(annotation),
    })
  );

  // Apply popup decorations
  editor.setDecorations(popupDecorationType, popupDecorations);
}

/**
 * Shows popup input boxes for entering annotation text and tags
 * @returns Promise resolving to annotation text and tags
 */
export async function showPopupAnnotationInput(
  existingText?: string,
  existingTags?: string[]
): Promise<{ text: string; tags: string[] } | undefined> {
  // Show input box for the annotation text
  const text = await vscode.window.showInputBox({
    prompt: "Enter your explanation for why this code exists or works this way",
    placeHolder: "e.g., Workaround for browser bug #123",
    value: existingText
  });

  if (!text) {
    return undefined;
  }

  // Optional: adding tags for better organization and filtering
  const tagsInput = await vscode.window.showInputBox({
    prompt: "Add tags (optional, comma-separated)",
    placeHolder: "e.g., performance, workaround, legacy",
    value: existingTags ? existingTags.join(", ") : undefined
  });

  // Process tags: split by comma and trim whitespace
  const tags = tagsInput ? tagsInput.split(",").map((t) => t.trim()) : [];

  return { text, tags };
}
