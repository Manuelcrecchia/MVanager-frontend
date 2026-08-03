import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

@Component({
  selector: 'app-customer-work-completion',
  templateUrl: './customer-work-completion.component.html',
  styleUrls: ['./customer-work-completion.component.css'],
})
export class CustomerWorkCompletionComponent implements OnInit {
  numeroCliente = '';
  customer: any = null;
  displayName = '';
  address = '';
  phone = '';
  loading = true;
  saving = false;
  success = false;
  error = '';
  latestProof: any = null;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public global: GlobalService,
    private popup: PopupServiceService,
  ) {}

  ngOnInit(): void {
    this.numeroCliente = String(this.route.snapshot.paramMap.get('numeroCliente') || '').trim();
    if (!this.numeroCliente) {
      this.error = 'Cliente non valido.';
      this.loading = false;
      return;
    }
    this.http.get<any>(
      this.global.url + `admin/work-completion/customer/${encodeURIComponent(this.numeroCliente)}`,
    ).subscribe({
      next: (result) => {
        this.customer = result?.customer || null;
        this.displayName = result?.displayName || this.numeroCliente;
        this.address = result?.address || '';
        this.phone = result?.phone || '';
        this.latestProof = result?.latestProof || null;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'Impossibile caricare il cliente.';
        this.popup.showError(this.error);
      },
    });
  }

  showEvidence(): void {
    if (!this.latestProof?.id) return;
    this.http.get<any>(this.global.url + `admin/work-completion/proof/${this.latestProof.id}`).subscribe({
      next: async (evidence) => {
        const date = (value: any) => value
          ? new Date(value).toLocaleString('it-IT')
          : 'Non disponibile';
        const value = (item: any) => String(item || 'Non disponibile');
        const audit = Array.isArray(evidence.auditTrail)
          ? evidence.auditTrail.map((entry: any) => `• ${date(entry?.at)} — ${value(entry?.type)}`).join('\n')
          : 'Non disponibile';
        const receipt = [
          `Cliente: ${value(evidence.numeroCliente)}`,
          `Stato: ${value(evidence.status)}`,
          `Email destinatario/OTP: ${value(evidence.recipientEmail)}`,
          `Richiesta: ${date(evidence.requestedAt)}`,
          `Apertura link: ${date(evidence.viewedAt)}`,
          `OTP inviata: ${date(evidence.otpSentAt)}`,
          `OTP verificata: ${date(evidence.otpVerifiedAt)}`,
          `Firma: ${date(evidence.acceptedAt)}`,
          `IP invio: ${value(evidence.requestIp)}`,
          `IP verifica OTP: ${value(evidence.otpVerifiedIp)}`,
          `IP firma: ${value(evidence.acceptanceIp)}`,
          `Dispositivo: ${value(evidence.acceptanceUserAgent)}`,
          `SHA-256 PDF preliminare: ${value(evidence.documentSnapshotHashSha256)}`,
          `SHA-256 PDF finale: ${value(evidence.pdfHashSha256)}`,
          `SHA-256 firma: ${value(evidence.signatureHashSha256)}`,
          '',
          'Cronologia registrata:',
          audit,
        ].join('\n');
        const action = await this.popup.evidence(receipt);
        if (action === 'save') this.saveEvidence(receipt);
        if (action === 'print') this.printEvidence(receipt);
      },
      error: (err) => this.popup.showHttpError(err, 'Impossibile recuperare i dati di prova.'),
    });
  }

  private saveEvidence(receipt: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([receipt], { type: 'text/plain;charset=utf-8' }));
    link.download = `dati-prova-foglio-fine-lavoro-${this.numeroCliente}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private printEvidence(receipt: string): void {
    const popup = window.open('', '_blank', 'width=850,height=700');
    if (!popup) {
      this.popup.showError('Il browser ha bloccato la finestra di stampa.');
      return;
    }
    const escaped = receipt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    popup.document.write(`<html><head><title>Dati prova firma</title><style>body{font-family:Arial;padding:32px;color:#182235}pre{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.55}</style></head><body><h1>Dati di prova della firma</h1><pre>${escaped}</pre><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  back(): void {
    this.router.navigateByUrl('/homeAdmin/listCustomer');
  }

  async createRequest(): Promise<void> {
    const choice = await this.popup.choose(
      'Il cliente compilerà il foglio, verificherà la propria email con un codice OTP e firmerà dal suo dispositivo. Via email riceverà anche il PDF preliminare; con WhatsApp verrà aperto il messaggio pronto.',
      'Invia foglio di fine lavoro',
      {
        primaryLabel: 'Invia via email',
        secondaryLabel: 'Invia su WhatsApp',
        cancelLabel: 'Annulla',
      },
    );
    if (!choice) return;
    this.saving = true;
    this.error = '';
    const email = choice === 'primary';
    this.http.post<any>(this.global.url + 'admin/work-completion/request', {
      numeroCliente: this.numeroCliente,
      deliveryChannel: email ? 'email' : 'manual',
    }).subscribe({
      next: (result) => {
        this.saving = false;
        this.success = true;
        if (!email && (result?.whatsappUrl || result?.approvalUrl)) {
          window.open(result.whatsappUrl || result.approvalUrl, '_blank');
        }
        this.popup.show(
          email ? 'Email con link inviata al cliente.' : 'Link generato e messaggio WhatsApp aperto.',
          'Richiesta creata',
          'success',
        );
      },
      error: (err) => {
        this.saving = false;
        this.error = err?.error?.error || 'Impossibile creare la richiesta.';
        this.popup.showError(this.error);
      },
    });
  }
}
