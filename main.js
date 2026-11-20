var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PlanAnnotatorPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_view = require("@codemirror/view");
var ANNOTATOR_VIEW_TYPE = "plan-annotator-view";
var DEFAULT_SETTINGS = {
  openSidebarOnStartup: true
};
function isAnnotation(value) {
  var _a, _b, _c;
  if (!value || typeof value !== "object") return false;
  const annotation = value;
  return typeof annotation.filePath === "string" && typeof annotation.text === "string" && typeof annotation.comment === "string" && Number.isInteger(annotation.startLine) && ((_a = annotation.startLine) != null ? _a : 0) > 0 && Number.isInteger(annotation.endLine) && ((_b = annotation.endLine) != null ? _b : 0) >= ((_c = annotation.startLine) != null ? _c : 1) && typeof annotation.createdAt === "string";
}
function isPluginData(value) {
  return !!value && typeof value === "object" && Array.isArray(value.annotations) && value.annotations.every(isAnnotation);
}
var PlanAnnotatorPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.annotations = [];
    this.preferences = { ...DEFAULT_SETTINGS };
    this.dataValid = true;
    this.currentFilePath = null;
    this.lastSelection = null;
    this.views = /* @__PURE__ */ new Set();
  }
  get canAnnotate() {
    return this.dataValid;
  }
  get activeFilePath() {
    return this.currentFilePath;
  }
  savePluginData(annotations = this.annotations) {
    return this.saveData({ annotations, settings: this.preferences });
  }
  isSidebarStartupEnabled() {
    return this.preferences.openSidebarOnStartup;
  }
  async setSidebarStartupEnabled(enabled) {
    const previous = this.preferences.openSidebarOnStartup;
    this.preferences = { ...this.preferences, openSidebarOnStartup: enabled };
    try {
      await this.savePluginData();
    } catch (error) {
      this.preferences = { ...this.preferences, openSidebarOnStartup: previous };
      throw error;
    }
  }
  async onload() {
    var _a, _b;
    const stored = await this.loadData();
    if (stored == null) {
      this.annotations = [];
    } else if (isPluginData(stored)) {
      this.annotations = stored.annotations;
      const storedSettings = stored.settings;
      this.preferences = {
        openSidebarOnStartup: typeof (storedSettings == null ? void 0 : storedSettings.openSidebarOnStartup) === "boolean" ? storedSettings.openSidebarOnStartup : DEFAULT_SETTINGS.openSidebarOnStartup
      };
    } else {
      this.dataValid = false;
      new import_obsidian.Notice("Plan Annotator data is malformed. Annotation creation is disabled until the plugin data is fixed.", 0);
    }
    this.currentFilePath = (_b = (_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.path) != null ? _b : null;
    this.registerView(ANNOTATOR_VIEW_TYPE, (leaf) => new PlanAnnotatorView(leaf, this));
    this.addSettingTab(new PlanAnnotatorSettingTab(this.app, this));
    const captureSelection = () => window.requestAnimationFrame(() => {
      var _a2;
      const selection = this.getActiveSelection();
      for (const view of this.views) view.updateSelectionPreview((_a2 = selection == null ? void 0 : selection.text) != null ? _a2 : null);
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
      var _a2;
      if (file) {
        if (((_a2 = this.lastSelection) == null ? void 0 : _a2.file.path) !== file.path) this.lastSelection = null;
        this.currentFilePath = file.path;
      }
      this.refreshViews();
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      var _a2;
      const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (activeView == null ? void 0 : activeView.file) {
        if (((_a2 = this.lastSelection) == null ? void 0 : _a2.file.path) !== activeView.file.path) this.lastSelection = null;
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
  annotationsFor(filePath) {
    return this.annotations.filter((annotation) => annotation.filePath === filePath);
  }
  refreshViews() {
    for (const view of this.views) view.refresh();
  }
  getActiveSelection() {
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!activeView) return this.lastSelection;
    const file = activeView.file;
    if (!(file instanceof import_obsidian.TFile) || file.extension !== "md") return null;
    const editorElement = activeView.containerEl.querySelector(".cm-editor");
    const view = editorElement ? import_view.EditorView.findFromDOM(editorElement) : null;
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
  async addSelectedAnnotation(comment) {
    const selected = this.canAnnotate ? this.getActiveSelection() : null;
    if (!selected) {
      new import_obsidian.Notice("Select text in a Markdown note before adding an annotation.");
      return false;
    }
    if (!comment.trim()) {
      new import_obsidian.Notice("Comment cannot be empty.");
      return false;
    }
    await this.addAnnotation({
      filePath: selected.file.path,
      text: selected.text,
      comment: comment.trim(),
      startLine: selected.view.state.doc.lineAt(selected.from).number,
      endLine: selected.view.state.doc.lineAt(selected.to).number,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return true;
  }
  async removeAnnotation(annotation) {
    const index = this.annotations.indexOf(annotation);
    if (index < 0) return;
    const next = this.annotations.filter((_, annotationIndex) => annotationIndex !== index);
    try {
      await this.savePluginData(next);
      this.annotations = next;
      this.refreshViews();
    } catch (e) {
      new import_obsidian.Notice("Could not delete annotation.");
    }
  }
  async removeAnnotationsFor(filePath) {
    const next = this.annotations.filter((annotation) => annotation.filePath !== filePath);
    if (next.length === this.annotations.length) return;
    try {
      await this.savePluginData(next);
      this.annotations = next;
      this.refreshViews();
      new import_obsidian.Notice("Deleted all comments for this note.");
    } catch (e) {
      new import_obsidian.Notice("Could not delete comments.");
    }
  }
  async copyAnnotations(annotations) {
    if (annotations.length === 0) {
      new import_obsidian.Notice("No annotations to copy.");
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
      new import_obsidian.Notice(annotations.length === 1 ? "Annotation copied to clipboard." : "Annotations copied to clipboard.");
    } catch (e) {
      new import_obsidian.Notice("Could not copy annotations to the clipboard.");
    }
  }
  async openSidebarView() {
    try {
      const existing = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE)[0];
      const leaf = existing != null ? existing : this.app.workspace.getRightLeaf(true);
      if (!leaf) throw new Error("Could not create a right sidebar leaf");
      await leaf.setViewState({ type: ANNOTATOR_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      console.error("Plan Annotator: failed to open sidebar", error);
      new import_obsidian.Notice("Could not open the Plan Annotator sidebar. Run 'Open Plan Annotator sidebar' to retry.");
    }
  }
  async addAnnotation(annotation) {
    if (!this.dataValid) return;
    const next = [...this.annotations, annotation];
    try {
      await this.savePluginData(next);
      this.annotations = next;
      this.refreshViews();
    } catch (e) {
      new import_obsidian.Notice("Could not save annotation.");
      throw new Error("Could not save annotation");
    }
  }
  async copyCurrentNoteAnnotations() {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof import_obsidian.TFile) || file.extension !== "md") {
      new import_obsidian.Notice("Open a Markdown note to copy its annotations.");
      return;
    }
    await this.copyAnnotations(this.annotationsFor(file.path));
  }
};
var PlanAnnotatorSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Plan Annotator" });
    new import_obsidian.Setting(containerEl).setName("Open sidebar on startup").setDesc("Automatically open the Plan Annotator sidebar when Obsidian starts.").addToggle((toggle) => toggle.setValue(this.plugin.isSidebarStartupEnabled()).onChange(async (enabled) => {
      toggle.setDisabled(true);
      try {
        await this.plugin.setSidebarStartupEnabled(enabled);
      } catch (e) {
        new import_obsidian.Notice("Could not save Plan Annotator settings.");
      } finally {
        toggle.setValue(this.plugin.isSidebarStartupEnabled());
        toggle.setDisabled(false);
      }
    }));
  }
};
function indentContinuation(value) {
  return value.replace(/\r?\n/g, (newline) => `${newline}  `);
}
var PlanAnnotatorView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.selectionPreviewEl = null;
    this.plugin.views.add(this);
  }
  getViewType() {
    return ANNOTATOR_VIEW_TYPE;
  }
  getDisplayText() {
    return "Comments";
  }
  getIcon() {
    return "message-square";
  }
  async onOpen() {
    this.containerEl.addClass("plan-annotator-sidebar");
    this.refresh();
  }
  async onClose() {
    this.plugin.views.delete(this);
  }
  updateSelectionPreview(text) {
    if (this.selectionPreviewEl) {
      this.selectionPreviewEl.textContent = text || "No text selected. Select text in a Markdown note first.";
    }
  }
  refresh() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Comments" });
    const form = this.contentEl.createEl("form", { cls: "plan-annotator-form" });
    form.createEl("div", { cls: "plan-annotator-selection-label", text: "Selected text" });
    const selection = this.plugin.getActiveSelection();
    this.selectionPreviewEl = form.createEl("div", {
      cls: "plan-annotator-selection-preview",
      text: (selection == null ? void 0 : selection.text) || "No text selected. Select text in a Markdown note first."
    });
    const input = form.createEl("textarea", {
      cls: "plan-annotator-comment-input",
      attr: { placeholder: "Input comments here\u2026", "aria-label": "Comment for selected text", rows: "3" }
    });
    input.disabled = !this.plugin.canAnnotate;
    const submit = form.createEl("button", { text: "Add comment", cls: "mod-cta" });
    submit.type = "submit";
    submit.disabled = !this.plugin.canAnnotate;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.plugin.addSelectedAnnotation(input.value).then((saved) => {
        if (saved) input.value = "";
      }).catch(() => void 0);
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
    if (file instanceof import_obsidian.TFile) this.contentEl.createEl("p", { cls: "plan-annotator-file", text: file.basename });
    if (annotations.length === 0) {
      this.contentEl.createEl("p", { cls: "plan-annotator-empty", text: "No comments for this note yet." });
      return;
    }
    const list = this.contentEl.createDiv({ cls: "plan-annotator-list" });
    for (const annotation of annotations) {
      const item = list.createDiv({ cls: "plan-annotator-item" });
      const header = item.createDiv({ cls: "plan-annotator-item-header" });
      header.createDiv({ cls: "plan-annotator-lines", text: `Lines ${annotation.startLine}\u2013${annotation.endLine}` });
      const actions = header.createDiv({ cls: "plan-annotator-actions" });
      const copy = actions.createEl("button", { text: "Copy", attr: { "aria-label": "Copy this annotated comment", title: "Copy this annotated comment" } });
      copy.addEventListener("click", () => void this.plugin.copyAnnotations([annotation]));
      const remove = actions.createEl("button", { text: "Delete", attr: { "aria-label": "Delete this annotated comment", title: "Delete this annotated comment" } });
      remove.addEventListener("click", () => void this.plugin.removeAnnotation(annotation));
      item.createEl("blockquote", { text: annotation.text });
      item.createEl("p", { text: annotation.comment });
    }
  }
};
