import { Component, OnInit } from '@angular/core';
import { GlobalService } from '../../service/global.service';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CustomerModelService } from '../../service/customer-model.service';

@Component({
  selector: 'app-view-pdf',
  templateUrl: './view-pdf.component.html',
  styleUrls: ['./view-pdf.component.css'],
})
export class ViewPdfComponent implements OnInit {
  pdfSrc: string = '';
  downloadName = 'document.pdf';

  numeroPreventivo!: string;
  signedPdfMode = false;
  confirmCustomerMode = false;
  loadingPdf = false;
  private currentPdfBlob: Blob | null = null;

  constructor(
    private globalService: GlobalService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private customerModelService: CustomerModelService,
  ) {}

  private sanitizeFilename(name: string): string {
    const cleaned = name
      .replace(/[\/\\?%*:|"<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.slice(0, 120) || 'document';
  }

  ngOnInit(): void {
    this.globalService.loadTenantConfig(false, { showError: false }).finally(() => {
      this.route.queryParams.subscribe((params) => {
        const numeroPreventivo = params['numeroPreventivo'];
        if (!numeroPreventivo) return;

        const body = { numeroPreventivo };
        this.numeroPreventivo = params['numeroPreventivo'];
        this.signedPdfMode = params['signed'] === '1' || params['signed'] === 'true';
        this.confirmCustomerMode =
          (params['confirmCustomer'] === '1' || params['confirmCustomer'] === 'true') &&
          this.globalService.canCreateCustomers();
        this.releasePdfUrl();
        this.currentPdfBlob = null;

        // Nome file
        this.http
          .post(this.globalService.url + 'quotes/getQuote', body, {
            headers: this.globalService.headers,
            responseType: 'text',
          })
          .subscribe({
            next: (resp) => {
              if (resp === 'Unauthorized') {
                this.router.navigateByUrl('/');
                return;
              }
              const quote = JSON.parse(resp)[0];
              const displayName = this.globalService.getRecordDisplayName('quote', quote || {});
              const base = this.sanitizeFilename(
                `${numeroPreventivo} ${displayName}`
              );
              this.downloadName = this.signedPdfMode
                ? `${base} firmato.pdf`
                : `${base}.pdf`;
            },
            error: (err) => {
              console.error('Errore caricamento preventivo:', err);
              alert(this.parseServerError(err));
            },
          });

        if (this.signedPdfMode) {
          this.loadSignedPdf(body);
          return;
        }

        this.loadQuotePdf(numeroPreventivo);
      });
    });
  }

  ngOnDestroy(): void {
    this.releasePdfUrl();
  }

  back() {
    this.router.navigate(['/homeAdmin', 'quotesHome'], {
      queryParams: this.signedPdfMode ? { showCompleted: 1 } : {},
    });
  }

  downloadPdf() {
    if (this.currentPdfBlob) {
      this.downloadBlob(this.currentPdfBlob);
      return;
    }

    const body = { numeroPreventivo: this.numeroPreventivo };

    this.http
      .post(this.globalService.url + 'quotes/downloadSecure', body, {
        headers: this.globalService.headers,
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.downloadBlob(blob);
        },
        error: (err) => {
          console.error('Errore download:', err);
          alert('Errore durante il download del PDF');
        },
      });
  }
  printPdf() {
    if (this.currentPdfBlob) {
      this.printBlob(this.currentPdfBlob);
      return;
    }

    const body = { numeroPreventivo: this.numeroPreventivo };

    this.http
      .post(this.globalService.url + 'quotes/downloadSecure', body, {
        headers: this.globalService.headers,
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.printBlob(blob);
        },
        error: (err) => {
          console.error('Errore stampa:', err);
          alert('Errore durante la stampa del PDF');
        },
      });
  }

  confirmAndCreateCustomer(): void {
    if (!this.globalService.canCreateCustomers()) {
      alert('Modulo clienti non abilitato per questa azienda.');
      this.back();
      return;
    }

    const numeroPreventivo = this.numeroPreventivo;
    const body = { numeroPreventivo };

    this.http
      .post<any[]>(this.globalService.url + 'quotes/getQuote', body, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (response) => {
          const quote = Array.isArray(response) ? response[0] : null;

          if (!quote) {
            alert('Preventivo non trovato');
            return;
          }

          this.customerModelService.populateFromQuote(quote, numeroPreventivo);

          this.http
            .post(
              this.globalService.url + 'quotes/setComplete',
              { numeroPreventivo },
              {
                headers: this.globalService.headers,
                responseType: 'text',
              },
            )
            .subscribe({
              next: () => {
                this.router.navigateByUrl('/addCustomer');
              },
              error: (err) => {
                console.error('Errore setComplete:', err);
                alert(this.parseServerError(err));
              },
            });
        },
        error: (err) => {
          console.error('Errore conferma preventivo:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  private loadSignedPdf(body: { numeroPreventivo: string }): void {
    this.loadingPdf = true;

    this.http
      .post(
        this.globalService.url + 'quotes/downloadSignedAcceptancePdf',
        body,
        {
          headers: this.globalService.headers,
          responseType: 'blob',
        },
      )
      .subscribe({
        next: (blob) => {
          this.setPdfBlob(blob);
          this.loadingPdf = false;
        },
        error: (err) => {
          console.error('Errore caricamento PDF firmato:', err);
          alert(this.parseServerError(err));
          this.loadingPdf = false;
        },
      });
  }

  private loadQuotePdf(numeroPreventivo: string): void {
    this.loadingPdf = true;

    this.http
      .get(this.globalService.url + 'quotes/getPdfBlob', {
        headers: this.globalService.headers,
        params: { numeroPreventivo },
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.setPdfBlob(blob);
          this.loadingPdf = false;
        },
        error: (err) => {
          console.error('Errore caricamento PDF:', err);
          alert(this.parseServerError(err));
          this.loadingPdf = false;
        },
      });
  }

  private setPdfBlob(blob: Blob): void {
    this.currentPdfBlob = new Blob([blob], { type: 'application/pdf' });
    this.releasePdfUrl();
    this.pdfSrc = URL.createObjectURL(this.currentPdfBlob);
  }

  private releasePdfUrl(): void {
    if (!this.pdfSrc) return;
    URL.revokeObjectURL(this.pdfSrc);
    this.pdfSrc = '';
  }

  private downloadBlob(blob: Blob): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.downloadName;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  private printBlob(blob: Blob): void {
    const pdfUrl = URL.createObjectURL(blob);
    const newWindow = window.open(pdfUrl);

    if (!newWindow) {
      alert('Il browser ha bloccato il popup. Attiva i popup per permettere la stampa.');
      return;
    }

    newWindow.onload = () => {
      newWindow.focus();
      const tryPrint = setInterval(() => {
        try {
          newWindow.print();
          clearInterval(tryPrint);
        } catch {}
      }, 300);
    };
  }

  private parseServerError(err: any): string {
    try {
      const body = typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
      if (body?.error) return body.error;
    } catch {}
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore imprevisto. Riprova.';
  }
}
