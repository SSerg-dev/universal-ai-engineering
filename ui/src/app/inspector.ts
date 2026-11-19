import { ChangeDetectionStrategy, Component, ElementRef, InjectionToken, Injector, afterNextRender, computed, inject, signal, viewChild } from "@angular/core";

import type { StreamEvent } from "../../../src/domain/stream-contracts.js";
import { RunStreamClient, type ClientProblem, type ClientSnapshot } from "./stream-client";
import { DocumentLibraryComponent } from "./document-library";

export const STREAM_CLIENT = new InjectionToken<Pick<RunStreamClient, "start" | "resume" | "cancel" | "dispose">>("Run stream client", {
  providedIn: "root", factory: () => new RunStreamClient(),
});
const problems: Record<ClientProblem, string> = {
  CREATE_FAILED: "Не удалось начать запуск. Проверьте учебный сервер и повторите вопрос.",
  NETWORK_FAILED: "Связь с запуском потеряна. Восстановите соединение, чтобы получить оставшиеся события.",
  PROTOCOL_INVALID: "Поток событий повреждён. Запустите вопрос заново.",
  RUN_UNAVAILABLE: "Данные запуска больше недоступны. Начните вопрос заново.",
  CANCEL_FAILED: "Не удалось отправить остановку. Повторите запрос остановки; текущий запуск продолжается.",
};

@Component({ selector: "uaos-inspector", standalone: true, imports: [DocumentLibraryComponent], templateUrl: "./inspector.html", changeDetection: ChangeDetectionStrategy.OnPush })
export class InspectorComponent {
  readonly documentLibrary = viewChild(DocumentLibraryComponent);
  readonly #client = inject(STREAM_CLIENT);
  readonly #injector = inject(Injector);
  private readonly questionElement = viewChild<ElementRef<HTMLTextAreaElement>>("questionElement");
  private readonly answerHeading = viewChild<ElementRef<HTMLHeadingElement>>("answerHeading");
  #pendingQuestion = "";
  #focusedRun = "";
  #displayedRun = "";
  readonly question = signal("");
  readonly submittedQuestion = signal("");
  readonly validation = signal<string | null>(null);
  readonly snapshot = signal<ClientSnapshot>({ state: null, connection: "idle", problem: null, stopRequested: false });
  readonly examples = [{ label: "Журнал выполнения", question: "execution journal" },
    { label: "Политика выполнения", question: "run policy" }, { label: "Без совпадений", question: "!!!" }];
  readonly events = computed(() => this.snapshot().state?.events ?? []);
  readonly last = computed(() => this.events().at(-1));
  readonly terminal = computed(() => this.snapshot().state?.phase === "terminal");
  readonly busy = computed(() => this.snapshot().connection === "creating" ||
    ["connected", "reconnecting"].includes(this.snapshot().connection) && !this.terminal());
  readonly answer = computed(() => this.snapshot().problem === "PROTOCOL_INVALID" ? undefined : this.events().find((event) => event.type === "answer"));
  readonly completed = computed(() => this.snapshot().connection === "closed" && this.last()?.type === "run.completed" && !this.snapshot().problem);
  readonly canReconnect = computed(() => this.snapshot().connection === "disconnected" && this.snapshot().problem === "NETWORK_FAILED" && !!this.snapshot().state && !this.terminal());
  readonly canCancel = computed(() => !!this.snapshot().state && !this.terminal() && this.snapshot().connection !== "creating" &&
    !["PROTOCOL_INVALID", "RUN_UNAVAILABLE"].includes(this.snapshot().problem ?? ""));
  readonly error = computed(() => {
    const problem = this.snapshot().problem;
    if (problem) return problems[problem];
    return this.last()?.type === "run.failed" ? "Не удалось завершить ответ. Повторите вопрос; код причины доступен в данных запуска." : null;
  });
  readonly status = computed(() => {
    const value = this.snapshot();
    if (value.connection === "creating") return "Начинаем разбор…";
    if (this.error()) return "Требуется внимание";
    if (value.stopRequested && !this.terminal()) return "Запрашиваем остановку…";
    if (value.connection === "reconnecting") return "Восстанавливаем соединение…";
    if (this.completed()) return "Ответ готов";
    if (this.last()?.type === "run.cancelled") return "Запуск остановлен. Измените вопрос или начните снова.";
    if (value.state?.phase === "completion") return "Ответ получен, ждём завершения…";
    if (["tool_start", "tool_complete"].includes(value.state?.phase ?? "")) return "Ищем фрагменты в документах…";
    if (["model2_request", "model2_response", "answer"].includes(value.state?.phase ?? "")) return "Проверяем найденные источники…";
    if (value.state && !this.terminal()) return "Модель выбирает следующий шаг…";
    return "Готов к первому вопросу";
  });

  setQuestion(event: Event) { this.question.set((event.target as HTMLTextAreaElement).value); this.validation.set(null); }
  useExample(question: string) { if (!this.busy()) { this.question.set(question); this.validation.set(null); this.questionElement()?.nativeElement.focus(); } }
  async submit(event?: Event) {
    event?.preventDefault(); if (this.busy()) return;
    const question = this.question().trim();
    if (!question || question.length > 2048) {
      this.validation.set(!question ? "Введите вопрос, чтобы начать разбор." : "Сократите вопрос до 2048 символов.");
      this.questionElement()?.nativeElement.focus(); return;
    }
    this.validation.set(null); this.#pendingQuestion = question;
    await this.#client.start(question, this.#receive);
  }
  async reconnect() { await this.#client.resume(this.#receive); }
  async cancel() { await this.#client.cancel(); }
  readonly #receive = (value: ClientSnapshot) => {
    if (value.state && value.state.runId !== this.#displayedRun) {
      this.#displayedRun = value.state.runId; this.submittedQuestion.set(this.#pendingQuestion);
    }
    this.snapshot.set(value);
    if (value.connection === "closed" && value.state && value.state.runId !== this.#focusedRun) {
      this.#focusedRun = value.state.runId;
      const cancelled = value.state.events.at(-1)?.type === "run.cancelled";
      afterNextRender({ write: () => { if (cancelled) this.questionElement()?.nativeElement.focus(); else this.answerHeading()?.nativeElement.focus(); } }, { injector: this.#injector });
    }
  };
  sourceTitle(documentId: string) { return this.answer()?.payload.sources.find((source) => source.documentId === documentId)?.title ?? documentId; }
  stepTitle(event: StreamEvent) {
    switch (event.type) {
      case "run.started": return "Начинаем разбор";
      case "run.progress": return event.payload.step === 1
        ? event.payload.eventType === "model.requested" ? "Модель выбирает действие" : "Действие выбрано"
        : event.payload.eventType === "model.requested" ? "Собираем ответ" : "Ответ проверен";
      case "tool.started": return "Ищем в документации";
      case "tool.completed": return "Фрагменты получены";
      case "tool.failed": return "Поиск не выполнен";
      case "answer": return "Результат получен";
      case "run.completed": return "Разбор завершён";
      case "run.cancelled": return "Запуск остановлен";
      case "run.failed": return "Разбор не завершён";
    }
  }
  stepDetail(event: StreamEvent) {
    switch (event.type) {
      case "run.started": return "Каждый следующий шаг появится по мере выполнения.";
      case "run.progress": return event.payload.step === 1 ? "Выбираем способ найти подтверждение." : "Используем найденные фрагменты.";
      case "tool.started": return "Ищем в доступных документах.";
      case "tool.completed": return `Поиск завершён · ${event.payload.durationMs} мс`;
      case "tool.failed": return event.payload.code === "TOOL_PERMISSION_DENIED" ? "Инструменту не выдан доступ." : "Не удалось получить фрагменты.";
      case "answer": return "Ответ и цитаты доступны в блоке результата.";
      case "run.completed": return "Получено подтверждение завершения.";
      case "run.cancelled": return "Новый запуск можно начать с другого вопроса.";
      case "run.failed": return "Причина сохранена в данных запуска.";
    }
  }
  ngOnDestroy() { this.#client.dispose(); }
}
