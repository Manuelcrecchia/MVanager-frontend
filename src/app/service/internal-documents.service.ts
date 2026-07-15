import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../service/global.service';

export interface InternalDoc {
  name: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class InternalDocumentsService {
  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
  ) {}

  private base = `${this.globalService.url}admin/internal-documents`;

  list() {
    return this.http.get<InternalDoc[]>(this.base);
  }

  upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${this.base}/upload`, form);
  }

  download(name: string) {
    this.http.post(`${this.base}/downloadSecure`, { folder: '', filename: name }, {
      headers: this.globalService.headers,
      responseType: 'blob',
    }).subscribe((blob) => {
      const file = new File([blob], name || 'documento', {
        type: blob.type || 'application/octet-stream',
      });
      const url = URL.createObjectURL(file);
      const opened = window.open(url, '_blank');
      if (!opened) {
        const link = document.createElement('a');
        link.href = url;
        link.download = name || 'documento';
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
  }

  delete(name: string) {
    return this.http.delete(`${this.base}/${encodeURIComponent(name)}`);
    // se sul backend hai POST /delete:
    // return this.http.post(`${this.base}/delete`, { name });
  }
}
