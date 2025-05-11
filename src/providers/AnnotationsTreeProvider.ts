import * as vscode from 'vscode';
import { Annotation } from '../interfaces/annotations';

/**
 * Represents a tree item in the annotations view
 */
class AnnotationTreeItem extends vscode.TreeItem {
  buttons?: {
    iconPath: vscode.ThemeIcon;
    tooltip: string;
    command: {
      command: string;
      title: string;
      arguments: any[];
    };
  }[];

  constructor(
    public readonly annotation: Annotation,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(
      `Line ${annotation.range.startLine + 1}: ${annotation.text.split('\n')[0]}`,
      collapsibleState
    );

    // Add line number and preview as description
    this.description = annotation.tags.length > 0 ? annotation.tags.join(', ') : '';
    
    // Add tooltip showing full annotation
    this.tooltip = new vscode.MarkdownString(`**Annotation**\n\n${annotation.text}`);
    this.tooltip.supportHtml = true;

    // Command to execute when clicking the item
    this.command = {
      command: 'whyAnnotations.revealAnnotation',
      title: 'Reveal Annotation',
      arguments: [annotation]
    };

    // Add contextValue and metadata for menu actions
    this.contextValue = 'annotation';
    
    // Add inline edit and delete buttons
    this.buttons = [
      {
        iconPath: new vscode.ThemeIcon('edit'),
        tooltip: 'Edit Annotation',
        command: {
          command: 'whyAnnotations.editAnnotation',
          title: 'Edit Annotation',
          arguments: [annotation.id]
        }
      },
      {
        iconPath: new vscode.ThemeIcon('trash'),
        tooltip: 'Delete Annotation',
        command: {
          command: 'whyAnnotations.deleteAnnotation',
          title: 'Delete Annotation',
          arguments: [annotation.id]
        }
      }
    ];
  }
}

/**
 * TreeDataProvider for showing annotations in the sidebar
 */
export class AnnotationsTreeProvider implements vscode.TreeDataProvider<AnnotationTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<AnnotationTreeItem | undefined | null | void> = new vscode.EventEmitter<AnnotationTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<AnnotationTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private annotations: Annotation[] = []) {}

  /**
   * Update the annotations and refresh the tree view
   */
  public updateAnnotations(annotations: Annotation[]): void {
    this.annotations = annotations;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item representation of the element
   */
  getTreeItem(element: AnnotationTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of the element
   */
  getChildren(element?: AnnotationTreeItem): Thenable<AnnotationTreeItem[]> {
    if (element) {
      return Promise.resolve([]); // No nested items
    }

    // Get active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return Promise.resolve([]);
    }

    // Filter annotations for current file
    const currentFileAnnotations = this.annotations.filter(
      a => a.filePath === activeEditor.document.uri.fsPath
    );

    // Sort by line number
    const sortedAnnotations = currentFileAnnotations.sort(
      (a, b) => a.range.startLine - b.range.startLine
    );

    // Convert to tree items
    return Promise.resolve(
      sortedAnnotations.map(
        annotation => new AnnotationTreeItem(annotation, vscode.TreeItemCollapsibleState.None)
      )
    );
  }
}
