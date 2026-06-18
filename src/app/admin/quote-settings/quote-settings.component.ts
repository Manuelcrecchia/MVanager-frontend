import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  GlobalService,
  TenantFieldMappingFieldConfig,
  TenantQuoteTypeConfig,
} from '../../service/global.service';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

interface QuoteRoom {
  id: number;
  nome: string;
  tipoPreventivo: string;
  fieldKey: string;
  position: number;
  createdAt: string;
}

interface QuotePhrase {
  id: number;
  testo: string;
  roomId: number | null;
  fieldKey: string;
  quoteType: string;
  position: number;
  createdAt: string;
}

@Component({
  selector: 'app-quote-settings',
  templateUrl: './quote-settings.component.html',
  styleUrls: ['./quote-settings.component.css'],
})
export class QuoteSettingsComponent implements OnInit {
  // Data
  rooms: QuoteRoom[] = [];
  phrases: QuotePhrase[] = [];
  loading = false;

  // Add forms
  newPhraseText = '';
  newPhraseFieldKey = '';
  newPhraseQuoteType = '';
  newPhraseRoomId: number | null = null;
  newRoomName = '';
  newRoomType = '';
  newRoomFieldKey = '';

  // Edit state
  editingPhraseId: number | null = null;
  editPhraseText = '';
  editPhraseRoomId: number | null = null;
  editPhraseFieldKey = '';
  editPhraseQuoteType = '';

  editingRoomId: number | null = null;
  editRoomName = '';
  editRoomType = '';
  editRoomFieldKey = '';

  // Accordion state for room sections
  expandedType: string | null = null;

  constructor(
    private http: HttpClient,
    private router: Router,
    public globalService: GlobalService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.globalService.loadTenantConfig(false, { showError: false });
    this.resetRoomTypeDefaults();
    this.resetPhraseDefaults();
    this.loadData();
  }

  back() {
    this.router.navigateByUrl('/homeAdmin');
  }

  loadData() {
    this.loading = true;
    this.loadPhrases();
    this.loadRooms();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHRASES
  // ════════════════════════════════════════════════════════════════════════════

  loadPhrases() {
    this.http
      .get<QuotePhrase[]>(
        this.globalService.url + 'admin/quote-settings/phrases',
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (res) => {
          this.phrases = res || [];
          this.loading = false;
        },
        error: (err) => {
          console.error('Errore loadPhrases:', err);
          alert('Errore nel caricamento delle frasi');
          this.loading = false;
        },
      });
  }

  addPhrase() {
    if (!this.newPhraseText || this.newPhraseText.trim().length === 0) {
      alert('Inserisci una frase valida');
      return;
    }
    if (!this.newPhraseFieldKey) {
      alert('Seleziona il campo preventivo per questa frase');
      return;
    }

    this.http
      .post(
        this.globalService.url + 'admin/quote-settings/phrases',
        {
          testo: this.newPhraseText.trim(),
          fieldKey: this.newPhraseFieldKey,
          quoteType: this.newPhraseRoomId ? '' : this.newPhraseQuoteType,
          roomId: this.newPhraseRoomId || null,
        },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.newPhraseText = '';
          this.resetPhraseDefaults();
          this.loadPhrases();
        },
        error: (err) => {
          console.error('Errore addPhrase:', err);
          alert(err?.error?.error || 'Errore aggiunta frase');
        },
      });
  }

  startEditPhrase(phrase: QuotePhrase) {
    this.editingPhraseId = phrase.id;
    this.editPhraseText = phrase.testo;
    this.editPhraseRoomId = phrase.roomId;
    this.editPhraseFieldKey = phrase.fieldKey || this.getDefaultPhraseFieldKey();
    this.editPhraseQuoteType = phrase.quoteType || '';
  }

  cancelEditPhrase() {
    this.editingPhraseId = null;
    this.editPhraseText = '';
    this.editPhraseRoomId = null;
    this.editPhraseFieldKey = this.getDefaultPhraseFieldKey();
    this.editPhraseQuoteType = '';
  }

  saveEditPhrase() {
    if (this.editingPhraseId == null) return;
    if (!this.editPhraseText || this.editPhraseText.trim().length === 0) {
      alert('Inserisci una frase valida');
      return;
    }
    if (!this.editPhraseFieldKey) {
      alert('Seleziona il campo preventivo per questa frase');
      return;
    }

    this.http
      .put(
        this.globalService.url +
          'admin/quote-settings/phrases/' +
          this.editingPhraseId,
        {
          testo: this.editPhraseText.trim(),
          fieldKey: this.editPhraseFieldKey,
          quoteType: this.editPhraseRoomId ? '' : this.editPhraseQuoteType,
          roomId: this.editPhraseRoomId || null,
        },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.cancelEditPhrase();
          this.loadPhrases();
        },
        error: (err) => {
          console.error('Errore saveEditPhrase:', err);
          alert(err?.error?.error || 'Errore modifica frase');
        },
      });
  }

  deletePhrase(phrase: QuotePhrase) {
    const ok = confirm(`Eliminare la frase "${phrase.testo}"?`);
    if (!ok) return;

    this.http
      .delete(
        this.globalService.url +
          'admin/quote-settings/phrases/' +
          phrase.id,
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => this.loadPhrases(),
        error: (err) => {
          console.error('Errore deletePhrase:', err);
          alert(err?.error?.error || 'Errore eliminazione frase');
        },
      });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ROOMS
  // ════════════════════════════════════════════════════════════════════════════

  loadRooms() {
    this.http
      .get<QuoteRoom[]>(
        this.globalService.url + 'admin/quote-settings/rooms',
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (res) => {
          this.rooms = res || [];
        },
        error: (err) => {
          console.error('Errore loadRooms:', err);
          alert('Errore nel caricamento dei gruppi');
        },
      });
  }

  addRoom() {
    if (!this.newRoomName || this.newRoomName.trim().length === 0) {
      alert('Inserisci un nome valido');
      return;
    }
    if (!this.newRoomFieldKey) {
      alert('Seleziona il campo preventivo per questo gruppo');
      return;
    }

    this.http
      .post(
        this.globalService.url + 'admin/quote-settings/rooms',
        {
          nome: this.newRoomName.trim(),
          tipoPreventivo: this.newRoomType,
          fieldKey: this.newRoomFieldKey,
        },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.newRoomName = '';
          this.newRoomType = this.getDefaultQuoteType();
          this.newRoomFieldKey = this.getDefaultPhraseFieldKey();
          this.loadRooms();
        },
        error: (err) => {
          console.error('Errore addRoom:', err);
          alert(err?.error?.error || 'Errore aggiunta gruppo');
        },
      });
  }

  startEditRoom(room: QuoteRoom) {
    this.editingRoomId = room.id;
    this.editRoomName = room.nome;
    this.editRoomType = room.tipoPreventivo;
    this.editRoomFieldKey = room.fieldKey || this.getDefaultPhraseFieldKey();
  }

  cancelEditRoom() {
    this.editingRoomId = null;
    this.editRoomName = '';
    this.editRoomType = this.getDefaultQuoteType();
    this.editRoomFieldKey = this.getDefaultPhraseFieldKey();
  }

  saveEditRoom() {
    if (this.editingRoomId == null) return;
    if (!this.editRoomName || this.editRoomName.trim().length === 0) {
      alert('Inserisci un nome valido');
      return;
    }
    if (!this.editRoomFieldKey) {
      alert('Seleziona il campo preventivo per questo gruppo');
      return;
    }

    this.http
      .put(
        this.globalService.url +
          'admin/quote-settings/rooms/' +
          this.editingRoomId,
        {
          nome: this.editRoomName.trim(),
          tipoPreventivo: this.editRoomType,
          fieldKey: this.editRoomFieldKey,
        },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.cancelEditRoom();
          this.loadRooms();
        },
        error: (err) => {
          console.error('Errore saveEditRoom:', err);
          alert(err?.error?.error || 'Errore modifica gruppo');
        },
      });
  }

  deleteRoom(room: QuoteRoom) {
    const ok = confirm(`Eliminare il gruppo "${room.nome}"?`);
    if (!ok) return;

    this.http
      .delete(
        this.globalService.url +
          'admin/quote-settings/rooms/' +
          room.id,
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => this.loadRooms(),
        error: (err) => {
          console.error('Errore deleteRoom:', err);
          alert(err?.error?.error || 'Errore eliminazione gruppo');
        },
      });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DRAG & DROP
  // ════════════════════════════════════════════════════════════════════════════

  dropPhrase(event: CdkDragDrop<QuotePhrase[]>) {
    moveItemInArray(this.phrases, event.previousIndex, event.currentIndex);
    const order = this.phrases.map((p, i) => ({ id: p.id, position: i }));
    this.http
      .put(
        this.globalService.url + 'admin/quote-settings/phrases/reorder',
        { order },
        { headers: this.globalService.headers },
      )
      .subscribe({
        error: (err) => {
          console.error('Errore reorder frasi:', err);
          alert('Errore durante il riordino');
        },
      });
  }

  dropRoom(event: CdkDragDrop<QuoteRoom[]>) {
    moveItemInArray(this.rooms, event.previousIndex, event.currentIndex);
    const order = this.rooms.map((r, i) => ({ id: r.id, position: i }));
    this.http
      .put(
        this.globalService.url + 'admin/quote-settings/rooms/reorder',
        { order },
        { headers: this.globalService.headers },
      )
      .subscribe({
        error: (err) => {
          console.error('Errore reorder gruppi:', err);
          alert('Errore durante il riordino');
        },
      });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  getRoomById(roomId: number | null): QuoteRoom | undefined {
    return this.rooms.find((r) => r.id === roomId);
  }

  getPhrasesForRoom(roomId: number): QuotePhrase[] {
    return this.phrases.filter((p) => p.roomId === roomId);
  }

  getPhrasesWithoutRoom(): QuotePhrase[] {
    return this.phrases.filter((p) => p.roomId === null);
  }

  getRoomsByType(type: string): QuoteRoom[] {
    const normalizedType = String(type || '').trim().toLowerCase();
    return this.rooms.filter((r) => (
      String(r.tipoPreventivo || '').trim().toLowerCase() === normalizedType
    ));
  }

  toggleAccordion(type: string) {
    this.expandedType = this.expandedType === type ? null : type;
  }

  getQuoteTypeOptions(): TenantQuoteTypeConfig[] {
    return this.globalService.getQuoteTypes();
  }

  getPhraseQuoteTypeOptions(): TenantQuoteTypeConfig[] {
    return this.getQuoteTypeOptions();
  }

  getQuoteTypeLabel(key: string): string {
    const type = this.getQuoteTypeOptions().find((item) => item.key === key);
    return type?.label || key || 'Tutti';
  }

  getPhraseEffectiveQuoteTypeLabel(phrase: QuotePhrase): string {
    const room = this.getRoomById(phrase.roomId);
    return this.getQuoteTypeLabel(room?.tipoPreventivo || phrase.quoteType);
  }

  getPhraseEffectiveFieldLabel(phrase: QuotePhrase): string {
    const room = this.getRoomById(phrase.roomId);
    return this.getQuoteFieldLabel(room?.fieldKey || phrase.fieldKey);
  }

  getSelectedNewPhraseRoom(): QuoteRoom | undefined {
    return this.getRoomById(this.newPhraseRoomId);
  }

  getSelectedEditPhraseRoom(): QuoteRoom | undefined {
    return this.getRoomById(this.editPhraseRoomId);
  }

  onNewPhraseRoomChange(): void {
    const room = this.getSelectedNewPhraseRoom();
    if (!room) return;
    this.newPhraseFieldKey = room.fieldKey || this.newPhraseFieldKey;
    this.newPhraseQuoteType = room.tipoPreventivo || this.newPhraseQuoteType;
  }

  onEditPhraseRoomChange(): void {
    const room = this.getSelectedEditPhraseRoom();
    if (!room) return;
    this.editPhraseFieldKey = room.fieldKey || this.editPhraseFieldKey;
    this.editPhraseQuoteType = room.tipoPreventivo || this.editPhraseQuoteType;
  }

  getQuoteFieldOptions(): TenantFieldMappingFieldConfig[] {
    return this.globalService
      .getVisibleFieldMappingFields('quote')
      .filter((field) => !!(field.key || field.dbColumn));
  }

  getQuoteFieldLabel(key: string): string {
    const normalized = String(key || '').trim().toLowerCase();
    const field = this.getQuoteFieldOptions().find((item) => (
      String(item.key || '').trim().toLowerCase() === normalized ||
      String(item.dbColumn || '').trim().toLowerCase() === normalized
    ));
    return field?.label || key || 'Non configurato';
  }

  private getDefaultQuoteType(): string {
    return this.globalService.getDefaultQuoteType(this.getQuoteTypeOptions()[0]?.key || '');
  }

  private resetRoomTypeDefaults(): void {
    const defaultType = this.getDefaultQuoteType();
    this.newRoomType = defaultType;
    this.editRoomType = defaultType;
    this.newRoomFieldKey = this.getDefaultPhraseFieldKey();
    this.editRoomFieldKey = this.newRoomFieldKey;
  }

  private getDefaultPhraseFieldKey(): string {
    const field = this.getQuoteFieldOptions()[0];
    return field?.key || field?.dbColumn || '';
  }

  private resetPhraseDefaults(): void {
    this.newPhraseFieldKey = this.getDefaultPhraseFieldKey();
    this.editPhraseFieldKey = this.newPhraseFieldKey;
    this.newPhraseQuoteType = '';
    this.editPhraseQuoteType = '';
    this.newPhraseRoomId = null;
  }
}
