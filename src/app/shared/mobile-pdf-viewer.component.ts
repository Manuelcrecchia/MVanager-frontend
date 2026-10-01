import { AfterViewInit, Component, ComponentRef, EventEmitter, Injector, Input, NgModuleRef, OnChanges, OnDestroy, Output, ViewChild, ViewContainerRef, createNgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

export function supportsMobilePdfRendering(): boolean {
  try { new RegExp('\\p{M}+', 'gu'); return true; } catch { return false; }
}

@Component({
  selector: 'app-mobile-pdf-viewer',
  standalone: true,
  imports: [CommonModule],
  styles: [':host { display: block; width: 100%; height: 100%; }'],
  template: `<ng-container #host></ng-container>
    <div *ngIf="unavailable" role="status">
      <p>Il lettore integrato non è disponibile su questo dispositivo. Puoi aprire o salvare il PDF con un’app compatibile.</p>
      <button type="button" (click)="download.emit()">Apri o salva PDF</button>
    </div>`,
})
export class MobilePdfViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() src = '';
  @Input() page = 1;
  @Output() loaded = new EventEmitter<{ numPages?: number }>();
  @Output() download = new EventEmitter<void>();
  @ViewChild('host', { read: ViewContainerRef, static: true }) host!: ViewContainerRef;
  unavailable = !supportsMobilePdfRendering();
  private destroyed = false;
  private viewer?: ComponentRef<any>;
  private module?: NgModuleRef<any>;

  constructor(private injector: Injector) {}

  protected loadModule() { return import('ng2-pdf-viewer'); }

  async ngAfterViewInit(): Promise<void> {
    if (this.unavailable) return;
    try {
      // PDF.js creates Unicode regular expressions during module initialization.
      // Loading it in AppModule would prevent even login on an older WebView.
      const pdf = await this.loadModule();
      if (this.destroyed) return;
      this.module = createNgModule(pdf.PdfViewerModule, this.injector);
      this.viewer = this.host.createComponent(pdf.PdfViewerComponent, { ngModuleRef: this.module });
      for (const [key, value] of Object.entries({ 'show-all': false, 'original-size': false, autoresize: true, 'render-text': false, 'zoom-scale': 'page-width', zoom: 1 })) {
        this.viewer.setInput(key, value);
      }
      this.viewer.instance.afterLoadComplete.subscribe((value: { numPages?: number }) => this.loaded.emit(value));
      this.ngOnChanges();
    } catch {
      if (!this.destroyed) this.unavailable = true;
    }
  }

  ngOnChanges(): void {
    this.viewer?.setInput('src', this.src);
    this.viewer?.setInput('page', this.page);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.viewer?.destroy();
    this.module?.destroy();
  }
}
