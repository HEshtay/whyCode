import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import {
  findAnnotationById,
  getGitAuthor,
  loadAnnotations,
  removeAnnotation,
  saveAnnotations,
  showPopupAnnotationInput,
  updateAnnotation,
  updateDecorations
} from "./helpers";
import { Annotation } from "./interfaces/annotations";
import { AnnotationsTreeProvider } from "./providers/AnnotationsTreeProvider";

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

  // Create tree view for annotations
  const annotationsTreeProvider = new AnnotationsTreeProvider();
  vscode.window.createTreeView('whyAnnotationsView', {
    treeDataProvider: annotationsTreeProvider
  });

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
      
      // Update tree view
      annotationsTreeProvider.updateAnnotations(annotationsFile.annotations);

      vscode.window.showInformationMessage(
        "Why Annotation added successfully!"
      );
    }
  );

  // Register the command that handles editing existing annotations
  const editCommand = vscode.commands.registerCommand(
    "whyAnnotations.editAnnotation",
    async (treeItem: any) => {
      // Handle different ways the ID might be passed:
      // 1. As a string directly
      // 2. As an object with id property (from hover)
      // 3. As a tree item (from sidebar)
      const id = typeof treeItem === 'string' 
        ? treeItem 
        : treeItem.id || treeItem.annotation?.id;
      // Get workspace and load annotations
      const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
      const annotationsFile = loadAnnotations(workspaceFolder);

      // Find the annotation to edit
      const annotation = findAnnotationById(annotationsFile.annotations, id);
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
        id,
        input.text,
        input.tags
      );

      // Save changes and update UI
      saveAnnotations(workspaceFolder, annotationsFile);

      // Update decorations in all visible editors
      vscode.window.visibleTextEditors.forEach(editor => {
        updateDecorations(editor, annotationsFile.annotations, popupDecorationType);
      });

      // Update tree view
      annotationsTreeProvider.updateAnnotations(annotationsFile.annotations);

      vscode.window.showInformationMessage("Why Annotation updated successfully!");
    }
  );

  // Register the command that handles deleting annotations
  const deleteCommand = vscode.commands.registerCommand(
    "whyAnnotations.deleteAnnotation",
    async (treeItem: any) => {
      // Handle different ways the ID might be passed:
      // 1. As a string directly
      // 2. As an object with id property (from hover)
      // 3. As a tree item (from sidebar)
      const id = typeof treeItem === 'string' 
        ? treeItem 
        : treeItem.id || treeItem.annotation?.id;
      // Get workspace and load annotations
      const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
      const annotationsFile = loadAnnotations(workspaceFolder);

      // Find the annotation to delete
      const annotation = findAnnotationById(annotationsFile.annotations, id);
      if (!annotation) {
        vscode.window.showErrorMessage("Annotation not found");
        return;
      }

      // Show confirmation dialog
      const result = await vscode.window.showWarningMessage(
        "Are you sure you want to delete this annotation?",
        { modal: true },
        "Yes",
        "No"
      );

      if (result !== "Yes") {
        return; // User cancelled
      }

      // Remove the annotation
      annotationsFile.annotations = removeAnnotation(annotationsFile.annotations, id);

      // Save changes and update UI
      saveAnnotations(workspaceFolder, annotationsFile);

      // Update decorations in all visible editors
      vscode.window.visibleTextEditors.forEach(editor => {
        updateDecorations(editor, annotationsFile.annotations, popupDecorationType);
      });

      // Update tree view
      annotationsTreeProvider.updateAnnotations(annotationsFile.annotations);

      vscode.window.showInformationMessage("Why Annotation deleted successfully!");
    }
  );

  // Register reveal annotation command
  const revealCommand = vscode.commands.registerCommand(
    'whyAnnotations.revealAnnotation',
    (annotation) => {
      // Find the document for this annotation
      const openFiles = vscode.workspace.textDocuments;
      const doc = openFiles.find(doc => doc.uri.fsPath === annotation.filePath);
      
      if (doc) {
        // Create selection from annotation range
        const selection = new vscode.Selection(
          annotation.range.startLine,
          annotation.range.startCharacter,
          annotation.range.endLine,
          annotation.range.endCharacter
        );

        // Show the document and highlight the range
        vscode.window.showTextDocument(doc, {
          selection: selection,
          preserveFocus: false
        });
      }
    }
  );

  context.subscriptions.push(disposable, editCommand, deleteCommand, revealCommand);

  // Update tree view when active editor changes
  vscode.window.onDidChangeActiveTextEditor(() => {
    annotationsTreeProvider.updateAnnotations(annotationsFile.annotations);
  });

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
