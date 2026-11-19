import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from "@angular/core";
import { LibraryDocumentSchema, LibraryListSchema, UPLOAD_MAX_BYTES, UploadPreviewSchema, type LibraryEntry, type UploadPreview } from "../../../src/domain/document-library-contracts.js";

export async function documentRequest(action: string, body: unknown = {}) {
  const response = await fetch(`/api/v1/documents/${action}`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(35000), cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "Сервис документов недоступен. Запустите сервер с библиотекой документов." : "Операция не завершена. Проверьте файл и повторите; после сбоя добавления сначала обновите список.");
  return response.json() as Promise<unknown>;
}

@Component({ selector: "uaos-document-library", standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <details class="panel library-panel" (toggle)="opened($event)">
    <summary><strong>Мои документы · загрузить Markdown / TXT</strong></summary>
    <p class="text-muted">Один UTF-8 файл .md или .txt до 256 КБ и 64 000 символов. Сначала проверьте текст, затем подтвердите добавление. Оригинал сохраняется локально.</p>
    <p class="text-muted">Временный учебный просмотр удаляет базу после остановки. Для сохранения документов между запусками используйте постоянную локальную базу.</p>
    <label class="file-label" for="document-file">Выберите документ</label>
    <input id="document-file" type="file" accept=".md,.txt,text/plain,text/markdown" [disabled]="busy()" (change)="select($event)">
    @if (message()) { <p class="library-message" role="alert">{{ message() }}</p> }
    @if (preview(); as draft) {
      <section aria-labelledby="preview-title" class="library-preview">
        <h3 id="preview-title">Проверьте текст: {{ draft.document.title }}</h3>
        <p class="text-muted">{{ draft.fileName }} · {{ draft.originalBytes }} байт. Этот текст будет доступен для поиска только после подтверждения.</p>
        <pre>{{ draft.document.content }}</pre>
        <div class="library-actions"><button class="primary" type="button" [disabled]="busy()" (click)="confirm()">{{ busy() ? 'Добавляем…' : 'Подтвердить и добавить в поиск' }}</button>
        <button type="button" [disabled]="busy()" (click)="discard()">Отменить</button></div>
      </section>
    }
    <div class="panel-heading"><h3>Загруженные документы</h3><button type="button" [disabled]="busy()" (click)="refresh()">Обновить список</button></div>
    @if (!entries().length) { <p class="text-muted">Добавленных документов пока нет. Учебные примеры доступны отдельно.</p> }
    <ul class="library-list">
      @for (entry of entries(); track entry.documentId) {
        <li><strong>{{ entry.title }}</strong><p class="text-muted">{{ entry.fileName }} · {{ entry.active ? 'Участвует в поиске' : 'Отключён от новых поисков' }}</p>
          <div class="library-actions"><button type="button" [disabled]="busy()" (click)="read(entry)">Открыть источник</button>
          @if (entry.active) { <button type="button" [disabled]="busy()" (click)="disable(entry)">Отключить от поиска</button> }</div>
        </li>
      }
    </ul>
    @if (selected(); as source) {
      <section class="library-preview" aria-label="Исходный документ"><h3>{{ source.entry.title }}</h3>
        <p class="text-muted">Точная индексированная версия. Отключение не удаляет оригинал и старые цитаты.</p><pre>{{ source.content }}</pre>
        <button type="button" (click)="download()">Скачать оригинал</button>
        <button type="button" (click)="selected.set(null)">Закрыть источник</button>
      </section>
    }
  </details>` })
export class DocumentLibraryComponent {
  readonly #host = inject(ElementRef<HTMLElement>);
  readonly preview = signal<UploadPreview | null>(null);
  readonly entries = signal<LibraryEntry[]>([]);
  readonly selected = signal<ReturnType<typeof LibraryDocumentSchema.parse> | null>(null);
  readonly busy = signal(false);
  readonly message = signal("");
  #file: { fileName: string; base64: string } | null = null;
  #opened = false;
  async opened(event: Event) { if ((event.target as HTMLDetailsElement).open && !this.#opened) { this.#opened = true; await this.refresh(); } }
  async #operation(work: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true); this.message.set("");
    try { await work(); } catch (error) { this.message.set(error instanceof Error ? error.message : "Не удалось обработать документ."); }
    finally { this.busy.set(false); }
  }
  async select(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    this.discard(); if (!file) return;
    await this.#operation(async () => {
      if (file.size === 0 || file.size > UPLOAD_MAX_BYTES || !/\.(?:md|txt)$/iu.test(file.name)) throw new Error("Выберите непустой .md или .txt размером до 256 КБ.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
      const selected = { fileName: file.name, base64: btoa(binary) };
      const draft = UploadPreviewSchema.parse(await documentRequest("preview", selected));
      this.#file = selected; this.preview.set(draft);
    });
    input.value = "";
  }
  discard() { this.#file = null; this.preview.set(null); this.message.set(""); }
  async confirm() {
    const file = this.#file, draft = this.preview(); if (!file || !draft) return;
    await this.#operation(async () => {
      UploadPreviewSchema.parse(await documentRequest("confirm", { ...file, revision: draft.document.revision }));
      this.discard(); this.entries.set(LibraryListSchema.parse(await documentRequest("list")));
      this.message.set("Документ добавлен. Теперь задайте вопрос по его содержимому.");
    });
  }
  async refresh() { await this.#operation(async () => { this.entries.set(LibraryListSchema.parse(await documentRequest("list"))); }); }
  async read(entry: LibraryEntry) { await this.#operation(async () => { this.selected.set(LibraryDocumentSchema.parse(await documentRequest("read", { documentId: entry.documentId }))); }); }
  async openSource(documentId: string) {
    const details = this.#host.nativeElement.querySelector("details"); if (details) details.open = true;
    await this.#operation(async () => { this.selected.set(LibraryDocumentSchema.parse(await documentRequest("read", { documentId }))); });
    this.#host.nativeElement.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async disable(entry: LibraryEntry) { await this.#operation(async () => {
    await documentRequest("disable", { documentId: entry.documentId });
    this.entries.set(LibraryListSchema.parse(await documentRequest("list"))); this.selected.set(null);
  }); }
  download() {
    const source = this.selected(); if (!source) return;
    const bytes = Uint8Array.from(atob(source.original.base64), (value) => value.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = source.entry.fileName; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
