import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import {
  findAnnotationById,
  getGitAuthor,
  loadAnnotations,
  saveAnnotations,
  showPopupAnnotationInput,
  updateAnnotation,
  updateDecorations
} from "./helpers";
import { Annotation } from "./interfaces/annotations";

// Declaration for popup decoration type
let popupDecorationType: vscode.TextEditorDecorationType;

/**
 * Called when the extension is activated.
 * Sets up:
 * 1. Editor decorations for showing annotation indicators
 * 2. Command for adding new annotations
 * 3. Event handlers for updating decorations
 *
 * The extension activates for all language types ('onLanguage' activation event)
 * and requires a workspace folder to function.
 *
 * @param context - The extension context provided by VSCode
 */
export function activate(context: vscode.ExtensionContext) {
  // Get the workspace folder - required for storing annotations
  if (
    !vscode.workspace.workspaceFolders ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    vscode.window.showErrorMessage(
      "Why Annotations requires a workspace folder to store annotations. Please open a folder first."
    );
    // Return early without setting up the extension
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;

  // Log activation for debugging purposes
  console.log("Why Annotations extension is now active");

  // Create popup decoration type (shows icon in gutter with hover)
  popupDecorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: context.asAbsolutePath("resources/why-icon.svg"),
    gutterIconSize: "contain",
  });

  const annotationsFile = loadAnnotations(workspaceFolder);

  // Set up event handler to update decorations when switching files
  vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        updateDecorations(editor, annotationsFile.annotations, popupDecorationType);
      }
    },
    null,
    context.subscriptions
  );

  // Register the command that handles adding new annotations
  // This is triggered from the editor context menu
  const disposable = vscode.commands.registerCommand(
    "whyAnnotations.addAnnotation",
    async () => {
      // Ensure we have an active editor with selected code to annotate
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const selection = editor.selection;
      if (!selection) {
        vscode.window.showErrorMessage("Please select the code to annotate");
        return;
      }

      // Use popup dialogs for input
      const annotationInput = await showPopupAnnotationInput();
      if (!annotationInput) {
        return; // User cancelled
      }

      const { text, tags } = annotationInput;

      // Get the Git author information
      const author = await getGitAuthor();

      // Create the new annotation object with all metadata
      const annotation: Annotation = {
        filePath: editor.document.uri.fsPath,
        range: {
          startLine: selection.start.line,
          startCharacter: selection.start.character,
          endLine: selection.end.line,
          endCharacter: selection.end.character,
        },
        text,
        tags,
        author,
        createdAt: new Date().toISOString(),
        id: uuidv4(),
      };

      // Save the new annotation and update the UI
      annotationsFile.annotations.push(annotation);
      saveAnnotations(workspaceFolder, annotationsFile);

      // Show the annotation indicator in the editor
      updateDecorations(editor, annotationsFile.annotations, popupDecorationType);

      vscode.window.showInformationMessage(
        "Why Annotation added successfully!"
      );
    }
  );

  // Register the command that handles editing existing annotations
  const editCommand = vscode.commands.registerCommand(
    "whyAnnotations.editAnnotation",
    async (args: { id: string }) => {
      // Get workspace and load annotations
      const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
      const annotationsFile = loadAnnotations(workspaceFolder);

      // Find the annotation to edit
      const annotation = findAnnotationById(annotationsFile.annotations, args.id);
      if (!annotation) {
        vscode.window.showErrorMessage("Annotation not found");
        return;
      }

      // Show input dialog with pre-filled content
      const input = await showPopupAnnotationInput(annotation.text, annotation.tags);
      if (!input) {
        return; // User cancelled
      }

      // Update the annotation
      annotationsFile.annotations = updateAnnotation(
        annotationsFile.annotations,
        args.id,
        input.text,
        input.tags
      );

      // Save changes and update UI
      saveAnnotations(workspaceFolder, annotationsFile);

      // Update decorations in all visible editors
      vscode.window.visibleTextEditors.forEach(editor => {
        updateDecorations(editor, annotationsFile.annotations, popupDecorationType);
      });

      vscode.window.showInformationMessage("Why Annotation updated successfully!");
    }
  );

  context.subscriptions.push(disposable, editCommand);

  // Update decorations for active editor
  if (vscode.window.activeTextEditor) {
    updateDecorations(
      vscode.window.activeTextEditor,
      annotationsFile.annotations,
      popupDecorationType
    );
  }
}

/**
 * Called when the extension is deactivated.
 * Currently no cleanup is needed, but this hook is available if needed in the future.
 */
export function deactivate() {
  // Clean up any resources if needed
}
