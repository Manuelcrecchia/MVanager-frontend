import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GlobalService } from '../../service/global.service';

interface AccountingAccount {
  id?: number;
  code: string;
  name: string;
  type: string;
  normalBalance: 'debit' | 'credit';
  systemKey?: string;
  isActive?: boolean;
  notes?: string;
}

interface AccountingLine {
  id?: number;
  accountId: number | null;
  account?: AccountingAccount;
  entry?: AccountingEntry;
  debit: number;
  credit: number;
  description?: string;
  partyName?: string;
  runningBalance?: number;
}

interface AccountingEntry {
  id?: number;
  entryDate: string;
  number: string;
  description: string;
  sourceType: string;
  sourceId?: string;
  status: string;
  locked?: boolean;
  debitTotal: number;
  creditTotal: number;
  lines: AccountingLine[];
}

interface AccountingReport {
  totals?: { debitTotal: number; creditTotal: number; balanced: boolean };
  incomeStatement?: { revenue: number; costs: number; grossProfit: number };
  balanceSheet?: { assets: number; liabilities: number; equity: number; netEquityWithResult: number };
  vat?: { vatDebit: number; vatCredit: number; vatSplitPayment?: number; vatBalance: number };
  trialBalance?: Array<{ account: AccountingAccount; debit: number; credit: number; balance: number }>;
}

interface VatRegister {
  rows: Array<{
    id: number;
    issueDate: string;
    number: string;
    type: string;
    direction: string;
    partyName: string;
    taxable: number;
    vat: number;
    total: number;
  }>;
  totals: {
    outboundTaxable: number;
    outboundVat: number;
    inboundTaxable: number;
    inboundVat: number;
    vatBalance: number;
  };
}

type EntryDirection = 'incoming' | 'outgoing' | 'neutral';

@Component({
  selector: 'app-accounting',
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.css',
})
export class AccountingComponent implements OnInit, OnDestroy {
  activeTab = 'dashboard';
  loading = false;
  saving = false;
  error = '';
  success = '';

  tabs = [
    { key: 'dashboard', label: 'Cruscotto', icon: 'fas fa-chart-pie' },
    { key: 'accounts', label: 'Piano conti', icon: 'fas fa-list-ol' },
    { key: 'entries', label: 'Prima nota', icon: 'fas fa-book' },
    { key: 'ledger', label: 'Mastri', icon: 'fas fa-stream' },
    { key: 'vat', label: 'IVA', icon: 'fas fa-percent' },
    { key: 'reports', label: 'Report', icon: 'fas fa-balance-scale' },
  ];

  filters = {
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  };

  accounts: AccountingAccount[] = [];
  entries: AccountingEntry[] = [];
  reports: AccountingReport | null = null;
  vatRegister: VatRegister = {
    rows: [],
    totals: { outboundTaxable: 0, outboundVat: 0, inboundTaxable: 0, inboundVat: 0, vatBalance: 0 },
  };
  ledger = {
    account: null as AccountingAccount | null,
    accountId: 0,
    openingBalance: 0,
    lines: [] as AccountingLine[],
  };

  selectedAccount: AccountingAccount = this.emptyAccount();
  manualEntry: AccountingEntry = this.emptyManualEntry();
  private routeSub?: Subscription;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private global: GlobalService,
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const view = params.get('view') || 'dashboard';
      if (this.tabs.some((tab) => tab.key === view)) {
        this.activeTab = view;
      }
      this.loadCurrentTab();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  setTab(tab: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: tab },
      queryParamsHandling: 'merge',
    });
  }

  loadCurrentTab(): void {
    this.clearMessages();
    if (this.activeTab === 'dashboard') this.loadDashboard();
    if (this.activeTab === 'accounts') this.loadAccounts();
    if (this.activeTab === 'entries') this.loadEntries();
    if (this.activeTab === 'ledger') this.loadLedger();
    if (this.activeTab === 'vat') this.loadVatRegister();
    if (this.activeTab === 'reports') this.loadReports();
  }

  refreshAll(): void {
    this.loadAccounts(() => {
      if (this.activeTab === 'dashboard') this.loadDashboard();
      if (this.activeTab === 'entries') this.loadEntries();
      if (this.activeTab === 'ledger') this.loadLedger();
      if (this.activeTab === 'vat') this.loadVatRegister();
      if (this.activeTab === 'reports') this.loadReports();
    });
  }

  syncFromInvoices(): void {
    this.saving = true;
    this.clearMessages();
    this.http.post<any>(this.api('sync'), {}).subscribe({
      next: (res) => {
        this.success = `Contabilita' sincronizzata: ${res.invoices || 0} fatture, ${res.payments || 0} pagamenti`;
        this.saving = false;
        this.refreshAll();
      },
      error: (err) => {
        this.error = this.errorMessage(err, 'Errore durante la sincronizzazione contabile');
        this.saving = false;
      },
    });
  }

  loadDashboard(): void {
    this.loading = true;
    this.http.get<any>(this.api('dashboard'), { params: this.filterParams() }).subscribe({
      next: (data) => {
        this.reports = data?.reports || null;
        this.vatRegister = data?.vatRegister || this.vatRegister;
        this.loading = false;
      },
      error: (err) => this.handleLoadError(err, 'Errore durante il recupero del cruscotto contabile'),
    });
  }

  loadAccounts(done?: () => void): void {
    this.loading = true;
    this.http.get<AccountingAccount[]>(this.api('accounts')).subscribe({
      next: (accounts) => {
        this.accounts = accounts || [];
        if (!this.ledger.accountId && this.accounts[0]?.id) {
          this.ledger.accountId = this.accounts[0].id;
        }
        this.loading = false;
        done?.();
      },
      error: (err) => this.handleLoadError(err, 'Errore durante il recupero del piano dei conti'),
    });
  }

  loadEntries(): void {
    this.loading = true;
    this.ensureAccounts(() => {
      this.http.get<AccountingEntry[]>(this.api('entries'), { params: this.filterParams() }).subscribe({
        next: (entries) => {
          this.entries = entries || [];
          this.loading = false;
        },
        error: (err) => this.handleLoadError(err, 'Errore durante il recupero della prima nota'),
      });
    });
  }

  loadLedger(): void {
    this.loading = true;
    this.ensureAccounts(() => {
      let params = this.filterParams();
      if (this.ledger.accountId) params = params.set('accountId', String(this.ledger.accountId));
      this.http.get<any>(this.api('ledger'), { params }).subscribe({
        next: (data) => {
          this.accounts = data.accounts || this.accounts;
          this.ledger.account = data.account || null;
          this.ledger.accountId = data.account?.id || this.ledger.accountId || 0;
          this.ledger.openingBalance = Number(data.openingBalance || 0);
          this.ledger.lines = data.lines || [];
          this.loading = false;
        },
        error: (err) => this.handleLoadError(err, 'Errore durante il recupero del mastro'),
      });
    });
  }

  loadReports(): void {
    this.loading = true;
    this.http.get<AccountingReport>(this.api('reports'), { params: this.filterParams() }).subscribe({
      next: (report) => {
        this.reports = report;
        this.loading = false;
      },
      error: (err) => this.handleLoadError(err, 'Errore durante il recupero dei report'),
    });
  }

  loadVatRegister(): void {
    this.loading = true;
    this.http.get<VatRegister>(this.api('vat-register'), { params: this.filterParams() }).subscribe({
      next: (data) => {
        this.vatRegister = data || this.vatRegister;
        this.loading = false;
      },
      error: (err) => this.handleLoadError(err, 'Errore durante il recupero del registro IVA'),
    });
  }

  newAccount(): void {
    this.selectedAccount = this.emptyAccount();
  }

  editAccount(account: AccountingAccount): void {
    this.selectedAccount = { ...account };
  }

  saveAccount(): void {
    this.saving = true;
    this.clearMessages();
    this.http.post<AccountingAccount>(this.api('accounts/save'), this.selectedAccount).subscribe({
      next: () => {
        this.success = 'Conto salvato';
        this.saving = false;
        this.newAccount();
        this.loadAccounts();
      },
      error: (err) => {
        this.error = this.errorMessage(err, 'Errore durante il salvataggio del conto');
        this.saving = false;
      },
    });
  }

  deleteAccount(account: AccountingAccount): void {
    if (!account.id || account.systemKey) return;
    if (!window.confirm(`Eliminare o disattivare il conto ${account.code} - ${account.name}?`)) return;
    this.saving = true;
    this.clearMessages();
    this.http.post(this.api('accounts/delete'), { id: account.id }).subscribe({
      next: () => {
        this.success = 'Conto eliminato o disattivato';
        this.saving = false;
        this.loadAccounts();
      },
      error: (err) => {
        this.error = this.errorMessage(err, 'Errore durante l eliminazione del conto');
        this.saving = false;
      },
    });
  }

  addManualLine(): void {
    this.manualEntry.lines.push({ accountId: null, debit: 0, credit: 0, description: '' });
  }

  removeManualLine(index: number): void {
    if (this.manualEntry.lines.length <= 2) return;
    this.manualEntry.lines.splice(index, 1);
  }

  saveManualEntry(): void {
    this.saving = true;
    this.clearMessages();
    this.http.post<AccountingEntry>(this.api('entries/save'), this.manualEntry).subscribe({
      next: () => {
        this.success = 'Scrittura di prima nota salvata';
        this.saving = false;
        this.manualEntry = this.emptyManualEntry();
        this.loadEntries();
      },
      error: (err) => {
        this.error = this.errorMessage(err, 'Errore durante il salvataggio della prima nota');
        this.saving = false;
      },
    });
  }

  deleteEntry(entry: AccountingEntry): void {
    if (!entry.id || entry.locked || entry.sourceType !== 'manual') return;
    if (!window.confirm('Eliminare questa scrittura di prima nota?')) return;
    this.saving = true;
    this.clearMessages();
    this.http.post(this.api('entries/delete'), { id: entry.id }).subscribe({
      next: () => {
        this.success = 'Scrittura eliminata';
        this.saving = false;
        this.loadEntries();
      },
      error: (err) => {
        this.error = this.errorMessage(err, 'Errore durante l eliminazione della scrittura');
        this.saving = false;
      },
    });
  }

  manualDebitTotal(): number {
    return this.round(this.manualEntry.lines.reduce((sum, item) => sum + Number(item.debit || 0), 0));
  }

  manualCreditTotal(): number {
    return this.round(this.manualEntry.lines.reduce((sum, item) => sum + Number(item.credit || 0), 0));
  }

  manualBalanced(): boolean {
    return Math.abs(this.manualDebitTotal() - this.manualCreditTotal()) < 0.005;
  }

  accountLabel(account: AccountingAccount | undefined | null): string {
    if (!account) return 'Conto';
    return `${account.code} - ${account.name}`;
  }

  money(value: number | string | undefined | null): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
  }

  typeLabel(type: string | undefined): string {
    const labels: Record<string, string> = {
      asset: 'Attivita',
      liability: 'Passivita',
      equity: 'Patrimonio',
      revenue: 'Ricavi',
      cost: 'Costi',
      vat: 'IVA',
      bank: 'Banca',
      cash: 'Cassa',
      receivable: 'Clienti',
      payable: 'Fornitori',
      other: 'Altro',
    };
    return labels[type || ''] || type || 'Altro';
  }

  sourceLabel(sourceType: string | undefined): string {
    const labels: Record<string, string> = {
      invoice: 'Fattura',
      payment: 'Pagamento',
      manual: 'Manuale',
      opening: 'Apertura',
      closing: 'Chiusura',
    };
    return labels[sourceType || ''] || sourceType || '';
  }

  entriesByDirection(direction: EntryDirection): AccountingEntry[] {
    return this.entries.filter((entry) => this.entryDirection(entry) === direction);
  }

  entryDirectionTotal(direction: EntryDirection): number {
    return this.round(this.entriesByDirection(direction).reduce((sum, entry) => sum + this.entryDirectionAmount(entry), 0));
  }

  entryDirection(entry: AccountingEntry): EntryDirection {
    const lines = entry.lines || [];
    const cashLine = lines.find((line) => this.isCashOrBankLine(line));
    if (cashLine) {
      if (Number(cashLine.debit || 0) > Number(cashLine.credit || 0)) return 'incoming';
      if (Number(cashLine.credit || 0) > Number(cashLine.debit || 0)) return 'outgoing';
    }

    const receivableLine = lines.find((line) => line.account?.systemKey === 'receivables');
    if (receivableLine) {
      if (Number(receivableLine.debit || 0) > Number(receivableLine.credit || 0)) return 'incoming';
      if (Number(receivableLine.credit || 0) > Number(receivableLine.debit || 0)) return 'outgoing';
    }

    const payableLine = lines.find((line) => line.account?.systemKey === 'payables');
    if (payableLine) {
      if (Number(payableLine.credit || 0) > Number(payableLine.debit || 0)) return 'outgoing';
      if (Number(payableLine.debit || 0) > Number(payableLine.credit || 0)) return 'incoming';
    }

    const text = `${entry.description || ''} ${entry.number || ''}`.toLowerCase();
    if (text.includes('incasso')) return 'incoming';
    if (text.includes('pagamento')) return 'outgoing';
    return 'neutral';
  }

  entryDirectionLabel(entry: AccountingEntry): string {
    const direction = this.entryDirection(entry);
    if (direction === 'incoming') return 'Entrata';
    if (direction === 'outgoing') return 'Uscita';
    return 'Neutra';
  }

  entryDirectionAmount(entry: AccountingEntry): number {
    const cashLine = (entry.lines || []).find((line) => this.isCashOrBankLine(line));
    if (cashLine) return Math.max(Number(cashLine.debit || 0), Number(cashLine.credit || 0));
    return Math.max(Number(entry.debitTotal || 0), Number(entry.creditTotal || 0));
  }

  private isCashOrBankLine(line: AccountingLine): boolean {
    return ['cash', 'bank'].includes(line.account?.systemKey || '') || ['cash', 'bank'].includes(line.account?.type || '');
  }

  private ensureAccounts(done: () => void): void {
    if (this.accounts.length) {
      done();
      return;
    }
    this.loadAccounts(done);
  }

  private filterParams(): HttpParams {
    let params = new HttpParams();
    if (this.filters.startDate) params = params.set('startDate', this.filters.startDate);
    if (this.filters.endDate) params = params.set('endDate', this.filters.endDate);
    return params;
  }

  private emptyAccount(): AccountingAccount {
    return {
      code: '',
      name: '',
      type: 'other',
      normalBalance: 'debit',
      isActive: true,
      notes: '',
    };
  }

  private emptyManualEntry(): AccountingEntry {
    return {
      entryDate: new Date().toISOString().slice(0, 10),
      number: '',
      description: '',
      sourceType: 'manual',
      status: 'posted',
      debitTotal: 0,
      creditTotal: 0,
      lines: [
        { accountId: null, debit: 0, credit: 0, description: '' },
        { accountId: null, debit: 0, credit: 0, description: '' },
      ],
    };
  }

  private api(path: string): string {
    return this.global.url + 'accounting/' + path;
  }

  private clearMessages(): void {
    this.error = '';
    this.success = '';
  }

  private handleLoadError(err: any, fallback: string): void {
    this.error = this.errorMessage(err, fallback);
    this.loading = false;
  }

  private errorMessage(err: any, fallback: string): string {
    return err?.error?.error || err?.error?.message || err?.message || fallback;
  }

  private round(value: number): number {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }
}
