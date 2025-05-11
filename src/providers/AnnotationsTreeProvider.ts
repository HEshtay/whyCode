import * as vscode from 'vscode';
import { Annotation } from '../interfaces/annotations';

/**
 * Base class for tree items in the annotations view
 */
abstract class BaseTreeItem extends vscode.TreeItem {
  abstract getChildren(): BaseTreeItem[];
}

/**
 * Represents a line number item in the tree view
 */
class LineNumberTreeItem extends BaseTreeItem {
  constructor(
    public readonly lineNumber: number,
    private readonly annotations: Annotation[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(
      `Line ${lineNumber + 1}`,
      collapsibleState
    );

    // Add count of annotations as description
    this.description = `${annotations.length} annotation${annotations.length > 1 ? 's' : ''}`;
    
    // Add tooltip showing preview of all annotations
    const previews = annotations.map(a => a.text.split('\n')[0]).join('\n• ');
    this.tooltip = new vscode.MarkdownString(`**Annotations**\n\n• ${previews}`);
    this.tooltip.supportHtml = true;

    // Command to reveal the line in editor
    this.command = {
      command: 'whyAnnotations.revealLine',
      title: 'Reveal Line',
      arguments: [lineNumber]
    };

    this.iconPath = new vscode.ThemeIcon('note');
    this.contextValue = 'lineNumber';
  }

  getChildren(): BaseTreeItem[] {
    return this.annotations.map(annotation => new AnnotationTreeItem(annotation));
  }
}

/**
 * Represents an annotation item in the tree view
 */
class AnnotationTreeItem extends BaseTreeItem {
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
    private readonly annotation: Annotation
  ) {
    super(
      annotation.text.split('\n')[0],
      vscode.TreeItemCollapsibleState.None
    );

    // Add tags as description
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

  getChildren(): BaseTreeItem[] {
    return []; // Annotation items have no children
  }
}

/**
 * TreeDataProvider for showing annotations in the sidebar
 */
export class AnnotationsTreeProvider implements vscode.TreeDataProvider<BaseTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BaseTreeItem | undefined | null | void> = new vscode.EventEmitter<BaseTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BaseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

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
  getTreeItem(element: BaseTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of the element
   */
  getChildren(element?: BaseTreeItem): Thenable<BaseTreeItem[]> {
    // If element is provided, return its children
    if (element) {
      return Promise.resolve(element.getChildren());
    }

    // If no element (root), show line numbers
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return Promise.resolve([]);
    }

    // Filter annotations for current file
    const currentFileAnnotations = this.annotations.filter(
      a => a.filePath === activeEditor.document.uri.fsPath
    );

    // Group annotations by line number
    const annotationsByLine = new Map<number, Annotation[]>();
    currentFileAnnotations.forEach(annotation => {
      const line = annotation.range.startLine;
      if (!annotationsByLine.has(line)) {
        annotationsByLine.set(line, []);
      }
      annotationsByLine.get(line)!.push(annotation);
    });

    // Convert to line number tree items, sorted by line number
    const items = Array.from(annotationsByLine.entries())
      .sort(([a], [b]) => a - b)
      .map(([lineNumber, annotations]) => 
        new LineNumberTreeItem(
          lineNumber,
          annotations,
          annotations.length > 1 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
        )
      );

    return Promise.resolve(items);
  }
}
