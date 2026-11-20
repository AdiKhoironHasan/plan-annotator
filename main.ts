import { ItemView, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { EditorView } from "@codemirror/view";

const ANNOTATOR_VIEW_TYPE = "plan-annotator-view";

interface Annotation {
  filePath: string;
  text: string;
  comment: string;
  startLine: number;
  endLine: number;
  createdAt: string;
}

interface PlanAnnotatorSettings {
  openSidebarOnStartup: boolean;
}

const DEFAULT_SETTINGS: PlanAnnotatorSettings = {
  openSidebarOnStartup: true
};

interface PluginData {
  annotations: Annotation[];
  settings?: Partial<PlanAnnotatorSettings>;
}

function isAnnotation(value: unknown): value is Annotation {
  if (!value || typeof value !== "object") return false;
  const annotation = value as Partial<Annotation>;
  return typeof annotation.filePath === "string" &&
    typeof annotation.text === "string" &&
    typeof annotation.comment === "string" &&
    Number.isInteger(annotation.startLine) && (annotation.startLine ?? 0) > 0 &&
    Number.isInteger(annotation.endLine) && (annotation.endLine ?? 0) >= (annotation.startLine ?? 1) &&
    typeof annotation.createdAt === "string";
}

function isPluginData(value: unknown): value is PluginData {
  return !!value && typeof value === "object" &&
    Array.isArray((value as Partial<PluginData>).annotations) &&
    (value as PluginData).annotations.every(isAnnotation);
}


export default class PlanAnnotatorPlugin extends Plugin {
  private annotations: Annotation[] = [];
  private preferences: PlanAnnotatorSettings = { ...DEFAULT_SETTINGS };
  private dataValid = true;
  private currentFilePath: string | null = null;
  private lastSelection: { file: TFile; view: EditorView; from: number; to: number; text: string } | null = null;
  readonly views = new Set<PlanAnnotatorView>();
  get canAnnotate(): boolean {
    return this.dataValid;
  }

  get activeFilePath(): string | null {
    return this.currentFilePath;
  }
  private savePluginData(annotations: Annotation[] = this.annotations): Promise<void> {
    return this.saveData({ annotations, settings: this.preferences });
  }

  isSidebarStartupEnabled(): boolean {
    return this.preferences.openSidebarOnStartup;
  }

  async setSidebarStartupEnabled(enabled: boolean): Promise<void> {
    const previous = this.preferences.openSidebarOnStartup;
    this.preferences = { ...this.preferences, openSidebarOnStartup: enabled };
    try {
      await this.savePluginData();
    } catch (error) {
      this.preferences = { ...this.preferences, openSidebarOnStartup: previous };
      throw error;
    }
  }
  async onload(): Promise<void> {
    const stored = await this.loadData();
    if (stored == null) {
      this.annotations = [];
    } else if (isPluginData(stored)) {
      this.annotations = stored.annotations;
      const storedSettings = stored.settings;
      this.preferences = {
        openSidebarOnStartup: typeof storedSettings?.openSidebarOnStartup === "boolean"
          ? storedSettings.openSidebarOnStartup
          : DEFAULT_SETTINGS.openSidebarOnStartup
      };
    } else {
      this.dataValid = false;
      new Notice("Plan Annotator data is malformed. Annotation creation is disabled until the plugin data is fixed.", 0);
    }
    this.currentFilePath = this.app.workspace.getActiveFile()?.path ?? null;
    this.registerView(ANNOTATOR_VIEW_TYPE, (leaf) => new PlanAnnotatorView(leaf, this));
    this.addSettingTab(new PlanAnnotatorSettingTab(this.app, this));
    const captureSelection = () => window.requestAnimationFrame(() => {
      const selection = this.getActiveSelection();
      for (const view of this.views) view.updateSelectionPreview(selection?.text ?? null);
    });
    document.addEventListener("pointerup", captureSelection, true);
    document.addEventListener("keyup", captureSelection, true);
    document.addEventListener("selectionchange", captureSelection);
    this.register(() => {
      document.removeEventListener("pointerup", captureSelection, true);
      document.removeEventListener("keyup", captureSelection, true);
      document.removeEventListener("selectionchange", captureSelection);
    });

    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (file) {
        if (this.lastSelection?.file.path !== file.path) this.lastSelection = null;
        this.currentFilePath = file.path;
      }
      this.refreshViews();
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView?.file) {
        if (this.lastSelection?.file.path !== activeView.file.path) this.lastSelection = null;
        this.currentFilePath = activeView.file.path;
      }
      this.refreshViews();
    }));

    this.addCommand({
      id: "open-plan-annotator",
      name: "Open Plan Annotator sidebar",
      callback: () => void this.openSidebarView()
    });
    this.addCommand({
      id: "copy-current-note-annotations",
      name: "Copy annotations for current note",
      callback: () => void this.copyCurrentNoteAnnotations()
    });
    this.app.workspace.onLayoutReady(() => {
      if (this.preferences.openSidebarOnStartup) void this.openSidebarView();
    });

  }
  annotationsFor(filePath: string): Annotation[] {
    return this.annotations.filter((annotation) => annotation.filePath === filePath);
  }

  refreshViews(): void {
    for (const view of this.views) view.refresh();
  }

  getActiveSelection(): { file: TFile; view: EditorView; from: number; to: number; text: string } | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return this.lastSelection;
    const file = activeView.file;
    if (!(file instanceof TFile) || file.extension !== "md") return null;

    const editorElement = activeView.containerEl.querySelector<HTMLElement>(".cm-editor");
    const view = editorElement ? EditorView.findFromDOM(editorElement) : null;
    if (!view) return null;

    const selection = view.state.selection.main;
    if (selection.empty) {
      this.lastSelection = null;
      return null;
    }
    this.lastSelection = {
      file,
      view,
      from: selection.from,
      to: selection.to,
      text: view.state.sliceDoc(selection.from, selection.to)
    };
    return this.lastSelection;
  }

  async addSelectedAnnotation(comment: string): Promise<boolean> {
    const selected = this.canAnnotate ? this.getActiveSelection() : null;
    if (!selected) {
      new Notice("Select text in a Markdown note before adding an annotation.");
      return false;
    }
    if (!comment.trim()) {
      new Notice("Comment cannot be empty.");
      return false;
    }
    await this.addAnnotation({
      filePath: selected.file.path,
      text: selected.text,
      comment: comment.trim(),
      startLine: selected.view.state.doc.lineAt(selected.from).number,
      endLine: selected.view.state.doc.lineAt(selected.to).number,
      createdAt: new Date().toISOString()
    });
    return true;
  }

  async removeAnnotation(annotation: Annotation): Promise<void> {
    const index = this.annotations.indexOf(annotation);
    if (index < 0) return;
    const next = this.annotations.filter((_, annotationIndex) => annotationIndex !== index);
    try {
      await this.savePluginData(next);
      this.annotations = next;
      this.refreshViews();
    } catch {
      new Notice("Could not delete annotation.");
    }
  }
  async removeAnnotationsFor(filePath: string): Promise<void> {
    const next = this.annotations.filter((annotation) => annotation.filePath !== filePath);
    if (next.length === this.annotations.length) return;
    try {
      await this.savePluginData(next);
      this.annotations = next;
      this.refreshViews();
      new Notice("Deleted all comments for this note.");
    } catch {
      new Notice("Could not delete comments.");
    }
  }

  async copyAnnotations(annotations: Annotation[]): Promise<void> {
    if (annotations.length === 0) {
      new Notice("No annotations to copy.");
      return;
    }
    const vault = encodeURIComponent(this.app.vault.getName());
    const markdown = annotations.map((annotation, index) => {
      const filePath = encodeURIComponent(annotation.filePath.replace(/\.md$/i, ""));
      const uri = `obsidian://open?vault=${vault}&file=${filePath}#L${annotation.startLine}-${annotation.endLine}`;
      return [
        `# annotate ${index + 1}:`,
        `- file: ${uri}`,
        `- text: ${indentContinuation(annotation.text)}`,
        `- comments: ${indentContinuation(annotation.comment)}`
      ].join("\n");
    }).join("\n\n");
    try {
      await navigator.clipboard.writeText(markdown);
      new Notice(annotations.length === 1 ? "Annotation copied to clipboard." : "Annotations copied to clipboard.");
    } catch {
      new Notice("Could not copy annotations to the clipboard.");
    }
  }

  private async openSidebarView(): Promise<void> {
    try {
      const existing = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE)[0];
      const leaf = existing ?? this.app.workspace.getRightLeaf(true);
      if (!leaf) throw new Error("Could not create a right sidebar leaf");
      await leaf.setViewState({ type: ANNOTATOR_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      console.error("Plan Annotator: failed to open sidebar", error);
      new Notice("Could not open the Plan Annotator sidebar. Run 'Open Plan Annotator sidebar' to retry.");
    }
  }



  async addAnnotation(annotation: Annotation): Promise<void> {
    if (!this.dataValid) return;
    const next = [...this.annotations, annotation];
    try {
      await this.savePluginData(next);
      this.annotations = next;
      this.refreshViews();
    } catch {
      new Notice("Could not save annotation.");
      throw new Error("Could not save annotation");
    }
  }

  private async copyCurrentNoteAnnotations(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== "md") {
      new Notice("Open a Markdown note to copy its annotations.");
      return;
    }
    await this.copyAnnotations(this.annotationsFor(file.path));
  }
}

class PlanAnnotatorSettingTab extends PluginSettingTab {
  constructor(app: PlanAnnotatorPlugin["app"], private readonly plugin: PlanAnnotatorPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Plan Annotator" });

    new Setting(containerEl)
      .setName("Open sidebar on startup")
      .setDesc("Automatically open the Plan Annotator sidebar when Obsidian starts.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.isSidebarStartupEnabled())
        .onChange(async (enabled) => {
          toggle.setDisabled(true);
          try {
            await this.plugin.setSidebarStartupEnabled(enabled);
          } catch {
            new Notice("Could not save Plan Annotator settings.");
          } finally {
            toggle.setValue(this.plugin.isSidebarStartupEnabled());
            toggle.setDisabled(false);
          }
        }));
  }
}

function indentContinuation(value: string): string {
  return value.replace(/\r?\n/g, (newline) => `${newline}  `);
}

class PlanAnnotatorView extends ItemView {
  private selectionPreviewEl: HTMLElement | null = null;
  constructor(leaf: WorkspaceLeaf, private readonly plugin: PlanAnnotatorPlugin) {
    super(leaf);
    this.plugin.views.add(this);
  }

  getViewType(): string {
    return ANNOTATOR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Comments";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    this.containerEl.addClass("plan-annotator-sidebar");
    this.refresh();
  }

  async onClose(): Promise<void> {
    this.plugin.views.delete(this);
  }
  updateSelectionPreview(text: string | null): void {
    if (this.selectionPreviewEl) {
      this.selectionPreviewEl.textContent = text || "No text selected. Select text in a Markdown note first.";
    }
  }


  refresh(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Comments" });
    const form = this.contentEl.createEl("form", { cls: "plan-annotator-form" });
    form.createEl("div", { cls: "plan-annotator-selection-label", text: "Selected text" });
    const selection = this.plugin.getActiveSelection();
    this.selectionPreviewEl = form.createEl("div", {
      cls: "plan-annotator-selection-preview",
      text: selection?.text || "No text selected. Select text in a Markdown note first."
    });
    const input = form.createEl("textarea", {
      cls: "plan-annotator-comment-input",
      attr: { placeholder: "Input comments here…", "aria-label": "Comment for selected text", rows: "3" }
    });
    input.disabled = !this.plugin.canAnnotate;
    const submit = form.createEl("button", { text: "Add comment", cls: "mod-cta" });
    submit.type = "submit";
    submit.disabled = !this.plugin.canAnnotate;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.plugin.addSelectedAnnotation(input.value).then((saved) => {
        if (saved) input.value = "";
      }).catch(() => undefined);
    });

    this.contentEl.createEl("hr");
    const filePath = this.plugin.activeFilePath;
    if (!filePath) {
      this.contentEl.createEl("p", { cls: "plan-annotator-empty", text: "Open a Markdown note to see its comments." });
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    const annotations = this.plugin.annotationsFor(filePath);
    const heading = this.contentEl.createDiv({ cls: "plan-annotator-heading" });
    heading.createEl("h3", { text: "All comments" });
    const copyAll = heading.createEl("button", { text: "Copy All", attr: { "aria-label": "Copy all annotated comments", title: "Copy all annotated comments" } });
    copyAll.addEventListener("click", () => void this.plugin.copyAnnotations(annotations));
    const deleteAll = heading.createEl("button", { text: "Delete All", attr: { "aria-label": "Delete all comments for this note", title: "Delete all comments for this note" } });
    deleteAll.disabled = annotations.length === 0;
    deleteAll.addEventListener("click", () => void this.plugin.removeAnnotationsFor(filePath));
    if (file instanceof TFile) this.contentEl.createEl("p", { cls: "plan-annotator-file", text: file.basename });
    if (annotations.length === 0) {
      this.contentEl.createEl("p", { cls: "plan-annotator-empty", text: "No comments for this note yet." });
      return;
    }

    const list = this.contentEl.createDiv({ cls: "plan-annotator-list" });
    for (const annotation of annotations) {
      const item = list.createDiv({ cls: "plan-annotator-item" });
      const header = item.createDiv({ cls: "plan-annotator-item-header" });
      header.createDiv({ cls: "plan-annotator-lines", text: `Lines ${annotation.startLine}–${annotation.endLine}` });
      const actions = header.createDiv({ cls: "plan-annotator-actions" });
      const copy = actions.createEl("button", { text: "Copy", attr: { "aria-label": "Copy this annotated comment", title: "Copy this annotated comment" } });
      copy.addEventListener("click", () => void this.plugin.copyAnnotations([annotation]));
      const remove = actions.createEl("button", { text: "Delete", attr: { "aria-label": "Delete this annotated comment", title: "Delete this annotated comment" } });
      remove.addEventListener("click", () => void this.plugin.removeAnnotation(annotation));
      item.createEl("blockquote", { text: annotation.text });
      item.createEl("p", { text: annotation.comment });
    }
  }
}
