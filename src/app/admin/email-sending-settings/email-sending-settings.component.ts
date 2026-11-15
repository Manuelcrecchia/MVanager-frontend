import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

type Purpose = 'quotes' | 'inspections' | 'supplierRequests' | 'invoices' | 'deliveryNotes'
  | 'payslips' | 'customerDocuments' | 'employeeDocuments' | 'employeeContracts'
  | 'serviceOrders' | 'materialDeliveries' | 'workCompletion' | 'assetInterventions';
interface Sender {
  email: string;
  username: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  hasPassword: boolean;
  passwordNeedsReset: boolean;
}
interface SenderForm extends Sender {
  useDefault: boolean;
  password: string;
}
interface SenderSection {
  key: Purpose;
  title: string;
  description: string;
  form: SenderForm;
  busy: 'save' | 'test' | null;
  error: string;
  message: string;
}

@Component({
  selector: 'app-email-sending-settings',
  templateUrl: './email-sending-settings.component.html',
  styleUrls: ['./email-sending-settings.component.css'],
})
export class EmailSendingSettingsComponent implements OnInit {
  loading = false;
  loaded = false;
  loadError = '';
  sections: SenderSection[] = [
    this.section('quotes', 'Email invio preventivi', 'Preventivi, richieste di accettazione e conferme al cliente.'),
    this.section('inspections', 'Email invio sopralluoghi', 'Conferme degli appuntamenti di sopralluogo.'),
    this.section('supplierRequests', 'Email invio richiesta fornitori', 'Richieste e ordini di materiali ai fornitori.'),
    this.section('invoices', 'Email invio fatture e documenti amministrativi', 'Invio dei documenti dalla sezione fatturazione.'),
    this.section('deliveryNotes', 'Email invio DDT', 'Invio dei documenti di trasporto.'),
    this.section('payslips', 'Email invio buste paga', 'Invio delle buste paga ai dipendenti.'),
    this.section('customerDocuments', 'Email invio documenti clienti', 'Condivisione dei documenti con i clienti.'),
    this.section('employeeDocuments', 'Email invio documenti dipendenti', 'Condivisione dei documenti con i dipendenti.'),
    this.section('employeeContracts', 'Email invio contratti di pre-assunzione', 'Invio dei contratti e delle conferme di firma.'),
    this.section('serviceOrders', 'Email invio ordini di servizio', 'Richieste di firma e copie firmate, anche dall’app dipendenti.'),
    this.section('materialDeliveries', 'Email invio consegne materiali', 'Richieste di firma e copie firmate, anche dall’app dipendenti.'),
    this.section('workCompletion', 'Email invio fogli di fine lavoro', 'Richieste di compilazione e firma e invio delle copie firmate.'),
    this.section('assetInterventions', 'Email invio verbali intervento presidi', 'Invio delle copie firmate dei verbali di intervento.'),
  ];

  constructor(private http: HttpClient, private router: Router, public globalService: GlobalService) {}

  ngOnInit(): void { this.load(); }

  back(): void { this.router.navigateByUrl('/homeAdmin'); }

  private emptyForm(): SenderForm {
    return { useDefault: true, email: '', username: '', password: '', smtpHost: '', smtpPort: 587,
      smtpSecure: false, hasPassword: false, passwordNeedsReset: false };
  }

  private section(key: Purpose, title: string, description: string): SenderSection {
    return { key, title, description, form: this.emptyForm(), busy: null, error: '', message: '' };
  }

  private applySender(section: SenderSection, sender: Sender | null): void {
    section.form = sender ? { ...sender, password: '', useDefault: false } : this.emptyForm();
  }

  load(): void {
    this.loading = true;
    this.loaded = false;
    this.loadError = '';
    this.http.get<Record<Purpose, Sender | null>>(this.globalService.url + 'admin/settings/email-sending').subscribe({
      next: (senders) => {
        this.sections.forEach(section => this.applySender(section, senders[section.key]));
        this.loading = false;
        this.loaded = true;
      },
      error: (err) => {
        this.loading = false;
        this.loadError = err?.error?.error || 'Errore caricamento impostazioni invio email';
      },
    });
  }

  changed(section: SenderSection): void {
    section.message = '';
    section.error = '';
  }

  save(section: SenderSection): void {
    if (!this.loaded || section.busy) return;
    this.changed(section);
    section.busy = 'save';
    this.http.post<Sender | null>(this.endpoint(section), this.payload(section)).subscribe({
      next: (sender) => {
        this.applySender(section, sender);
        section.busy = null;
        section.message = sender ? 'Configurazione salvata.' : 'Salvato: verrà usata l’email già impostata in MVanager.';
      },
      error: (err) => {
        section.busy = null;
        section.error = err?.error?.error || 'Errore salvataggio configurazione';
      },
    });
  }

  test(section: SenderSection): void {
    if (!this.loaded || section.busy || section.form.useDefault) return;
    this.changed(section);
    section.busy = 'test';
    this.http.post(this.endpoint(section) + '/test', this.payload(section)).subscribe({
      next: () => {
        section.busy = null;
        section.message = 'Connessione SMTP riuscita. Il test non salva le modifiche.';
      },
      error: (err) => {
        section.busy = null;
        section.error = err?.error?.error || 'Test SMTP non riuscito';
      },
    });
  }

  private endpoint(section: SenderSection): string {
    return this.globalService.url + 'admin/settings/email-sending/' + section.key;
  }

  private payload(section: SenderSection): object {
    const { useDefault, email, username, password, smtpHost, smtpPort, smtpSecure } = section.form;
    return { useDefault, email, username, password, smtpHost, smtpPort, smtpSecure };
  }
}
