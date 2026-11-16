import { Component, provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

@Component({ selector: "uaos-inspector", template: "<main><h1>Как рождается ответ</h1><p>Интерфейс исполнения готовится.</p></main>" })
class Inspector {}

bootstrapApplication(Inspector, { providers: [provideZonelessChangeDetection()] }).catch(() => {
  document.body.textContent = "Не удалось открыть интерфейс. Обновите страницу.";
});
