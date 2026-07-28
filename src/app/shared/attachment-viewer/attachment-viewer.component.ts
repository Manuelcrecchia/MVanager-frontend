import { Component, HostListener } from '@angular/core';
import { AttachmentViewerService } from './attachment-viewer.service';

@Component({
  selector: 'app-attachment-viewer',
  templateUrl: './attachment-viewer.component.html',
  styleUrls: ['./attachment-viewer.component.css'],
})
export class AttachmentViewerComponent {
  constructor(public readonly viewer: AttachmentViewerService) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.viewer.state.open) this.viewer.close();
  }

  formatSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
