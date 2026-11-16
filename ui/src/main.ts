import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { InspectorComponent } from "./app/inspector";

bootstrapApplication(InspectorComponent, { providers: [provideZonelessChangeDetection()] }).catch(() => {
  document.body.textContent = "Не удалось открыть интерфейс. Обновите страницу.";
});
