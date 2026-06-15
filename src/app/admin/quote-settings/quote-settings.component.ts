import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService, TenantQuoteTypeConfig } from '../../service/global.service';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

interface QuoteRoom {
  id: number;
  nome: string;
  tipoPreventivo: string;
  position: number;
  createdAt: string;
}

interface QuotePhrase {
  id: number;
  testo: string;
  roomId: number | null;
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
  newRoomName = '';
  newRoomType = '';

  // Edit state
  editingPhraseId: number | null = null;
  editPhraseText = '';
  editPhraseRoomId: number | null = null;

  editingRoomId: number | null = null;
  editRoomName = '';
  editRoomType = '';

  // Accordion state for room sections
  expandedType: string | null = null;

  constructor(
    private http: HttpClient,
    private router: Router,
    public globalService: GlobalService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.globalService.loadTenantConfig(true, { showError: false });
    this.resetRoomTypeDefaults();
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

    this.http
      .post(
        this.globalService.url + 'admin/quote-settings/phrases',
        {
          testo: this.newPhraseText.trim(),
          roomId: this.editPhraseRoomId || null,
        },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.newPhraseText = '';
          this.editPhraseRoomId = null;
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
  }

  cancelEditPhrase() {
    this.editingPhraseId = null;
    this.editPhraseText = '';
    this.editPhraseRoomId = null;
  }

  saveEditPhrase() {
    if (this.editingPhraseId == null) return;
    if (!this.editPhraseText || this.editPhraseText.trim().length === 0) {
      alert('Inserisci una frase valida');
      return;
    }

    this.http
      .put(
        this.globalService.url +
          'admin/quote-settings/phrases/' +
          this.editingPhraseId,
        {
          testo: this.editPhraseText.trim(),
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
          alert('Errore nel caricamento delle stanze');
        },
      });
  }

  addRoom() {
    if (!this.newRoomName || this.newRoomName.trim().length === 0) {
      alert('Inserisci un nome valido');
      return;
    }

    this.http
      .post(
        this.globalService.url + 'admin/quote-settings/rooms',
        { nome: this.newRoomName.trim(), tipoPreventivo: this.newRoomType },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.newRoomName = '';
          this.newRoomType = this.getDefaultQuoteType();
          this.loadRooms();
        },
        error: (err) => {
          console.error('Errore addRoom:', err);
          alert(err?.error?.error || 'Errore aggiunta stanza');
        },
      });
  }

  startEditRoom(room: QuoteRoom) {
    this.editingRoomId = room.id;
    this.editRoomName = room.nome;
    this.editRoomType = room.tipoPreventivo;
  }

  cancelEditRoom() {
    this.editingRoomId = null;
    this.editRoomName = '';
    this.editRoomType = this.getDefaultQuoteType();
  }

  saveEditRoom() {
    if (this.editingRoomId == null) return;
    if (!this.editRoomName || this.editRoomName.trim().length === 0) {
      alert('Inserisci un nome valido');
      return;
    }

    this.http
      .put(
        this.globalService.url +
          'admin/quote-settings/rooms/' +
          this.editingRoomId,
        { nome: this.editRoomName.trim(), tipoPreventivo: this.editRoomType },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.cancelEditRoom();
          this.loadRooms();
        },
        error: (err) => {
          console.error('Errore saveEditRoom:', err);
          alert(err?.error?.error || 'Errore modifica stanza');
        },
      });
  }

  deleteRoom(room: QuoteRoom) {
    const ok = confirm(`Eliminare la stanza "${room.nome}"?`);
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
          alert(err?.error?.error || 'Errore eliminazione stanza');
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
          console.error('Errore reorder stanze:', err);
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

  getQuoteTypeLabel(key: string): string {
    const type = this.getQuoteTypeOptions().find((item) => item.key === key);
    return type?.label || key || 'Non configurato';
  }

  private getDefaultQuoteType(): string {
    return this.globalService.getDefaultQuoteType(this.getQuoteTypeOptions()[0]?.key || '');
  }

  private resetRoomTypeDefaults(): void {
    const defaultType = this.getDefaultQuoteType();
    this.newRoomType = defaultType;
    this.editRoomType = defaultType;
  }
}
