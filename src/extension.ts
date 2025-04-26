import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';

/**
 * Represents the range of code that an annotation is attached to.
 * Uses zero-based line and character positions.
 */
interface AnnotationRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

/**
 * Represents a single "Why" annotation that explains a piece of code.
 * Each annotation is uniquely identified and contains metadata about its creation.
 */
interface Annotation {
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
interface AnnotationsFile {
  annotations: Annotation[];
}

const ANNOTATIONS_FILE = '.whyannotations.json';
let decorationType: vscode.TextEditorDecorationType;

/**
 * Gets the full path to the annotations storage file.
 * @param workspaceFolder - The root path of the workspace
 * @returns The absolute path to the .whyannotations.json file
 */
function getAnnotationsFilePath(workspaceFolder: string): string {
  return path.join(workspaceFolder, ANNOTATIONS_FILE);
}

/**
 * Creates a new annotations file if it doesn't exist.
 * Initializes it with an empty annotations array.
 * @param filePath - Path where the annotations file should be created
 */
function initAnnotationsFile(filePath: string) {
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
function loadAnnotations(workspaceFolder: string): AnnotationsFile {
  const filePath = getAnnotationsFilePath(workspaceFolder);
  initAnnotationsFile(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Saves the annotations data to disk.
 * @param workspaceFolder - The root path of the workspace
 * @param annotations - The annotations data to save
 */
function saveAnnotations(workspaceFolder: string, annotations: AnnotationsFile) {
  const filePath = getAnnotationsFilePath(workspaceFolder);
  fs.writeFileSync(filePath, JSON.stringify(annotations, null, 2));
}

/**
 * Updates the editor decorations to show annotation indicators.
 * Filters annotations to only show those relevant to the current file.
 * @param editor - The active text editor
 * @param annotations - All annotations in the workspace
 */
function updateDecorations(editor: vscode.TextEditor, annotations: Annotation[]) {
  const fileAnnotations = annotations.filter(a => 
    a.filePath === editor.document.uri.fsPath
  );

  const decorations: vscode.DecorationOptions[] = fileAnnotations.map(annotation => ({
    range: new vscode.Range(
      annotation.range.startLine,
      annotation.range.startCharacter,
      annotation.range.endLine,
      annotation.range.endCharacter
    ),
    hoverMessage: annotation.text
  }));

  editor.setDecorations(decorationType, decorations);
}

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
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Why Annotations requires a workspace folder to store annotations. Please open a folder first.');
    // Return early without setting up the extension
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;

  // Log activation for debugging purposes
  console.log('Why Annotations extension is now active');

  // Create the decoration type for annotation indicators
  decorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: context.asAbsolutePath('resources/why-icon.svg'),
    gutterIconSize: 'contain'
  });

  const annotationsFile = loadAnnotations(workspaceFolder);

  // Set up event handler to update decorations when switching files
  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      updateDecorations(editor, annotationsFile.annotations);
    }
  }, null, context.subscriptions);

  // Register the command that handles adding new annotations
  // This is triggered from the editor context menu
  // Register the command that implements the "Add Why Annotation" feature
  // This command is exposed in the editor context menu (see package.json)
  const disposable = vscode.commands.registerCommand('whyAnnotations.addAnnotation', async () => {
    // Ensure we have an active editor with selected code to annotate
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }

    const selection = editor.selection;
    if (!selection) {
      vscode.window.showErrorMessage('Please select the code to annotate');
      return;
    }

    // Show input box for the annotation text
    // This is where the developer explains why the code exists/works this way
    const text = await vscode.window.showInputBox({
      prompt: 'Enter your explanation for why this code exists or works this way',
      placeHolder: 'e.g., Workaround for browser bug #123'
    });

    if (!text) {
      return;
    }

    // Optional: Allow adding tags for better organization and filtering
    const tagsInput = await vscode.window.showInputBox({
      prompt: 'Add tags (optional, comma-separated)',
      placeHolder: 'e.g., performance, workaround, legacy'
    });

    // Process tags: split by comma and trim whitespace
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : [];

    // Create the new annotation object with all metadata
    const annotation: Annotation = {
      filePath: editor.document.uri.fsPath,
      range: {
        startLine: selection.start.line,
        startCharacter: selection.start.character,
        endLine: selection.end.line,
        endCharacter: selection.end.character
      },
      text,
      tags,
      author: 'Unknown', // Could be fetched from Git config
      createdAt: new Date().toISOString(),
      id: uuidv4()
    };

    // Save the new annotation and update the UI
    annotationsFile.annotations.push(annotation);
    saveAnnotations(workspaceFolder, annotationsFile);
    
    // Show the annotation indicator in the editor gutter
    updateDecorations(editor, annotationsFile.annotations);

    vscode.window.showInformationMessage('Why Annotation added successfully!');
  });

  context.subscriptions.push(disposable);

  // Update decorations for active editor
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor, annotationsFile.annotations);
  }
}

/**
 * Called when the extension is deactivated.
 * Currently no cleanup is needed, but this hook is available if needed in the future.
 */
export function deactivate() {}
