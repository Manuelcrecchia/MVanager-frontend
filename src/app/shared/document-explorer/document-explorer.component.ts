import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';

export interface DocumentExplorerEntry {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  size?: number;
  modifiedAt?: string;
  detail?: string;
  locked?: boolean;
  customerVisibility?: CustomerDocumentVisibility;
  data: any;
}
export interface CustomerDocumentVisibility {visible:boolean;source:string;explicit:boolean|null;hasExceptions?:boolean;status?:'shared'|'hidden'|'partial';}

export interface DocumentFolder {
  name: string;
  createdAt?: string | null;
  size?: number;
  customerVisibility?: CustomerDocumentVisibility;
}

export function documentFolderEntry(folder: DocumentFolder): DocumentExplorerEntry {
  return {
    id: 'folder:' + folder.name,
    kind: 'folder',
    name: folder.name,
    data: folder.name,
    size: folder.size,
    modifiedAt: folder.createdAt ?? undefined,
    customerVisibility: folder.customerVisibility,
  };
}
export interface DocumentExplorerAction {
  type: 'open' | 'download' | 'print' | 'email' | 'rename' | 'delete' | 'share-customer' | 'hide-customer' | 'inherit-customer';
  entry: DocumentExplorerEntry;
}

@Component({
  selector: 'app-document-explorer',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatMenuModule],
  templateUrl: './document-explorer.component.html',
  styleUrls: ['./document-explorer.component.css'],
})
export class DocumentExplorerComponent implements OnChanges {
  @Input() entries: DocumentExplorerEntry[] = [];
  @Input() path = '';
  @Input() rootLabel = 'Documenti';
  @Input() dateLabel = 'Ultima modifica';
  @Input() writable = true;
  @Input() allowDelete = false;
  @Input() managedFolder = false;
  @Input() uploading = false;
  @Input() loading = false;
  @Input() allowPrint = true;
  @Input() allowRename = false;
  @Input() allowEmail = false;
  @Input() allowCustomerSharing = false;
  @Output() navigate = new EventEmitter<string>();
  @Output() action = new EventEmitter<DocumentExplorerAction>();
  @Output() createFolder = new EventEmitter<string>();
  @Output() upload = new EventEmitter<File[]>();
  @ViewChild('contextTrigger') contextTrigger!: MatMenuTrigger;
  @ViewChild('folderNameInput') folderNameInput?: ElementRef<HTMLInputElement>;

  query = '';
  view: 'list' | 'grid' = 'list';
  sort: 'name' | 'modified' = 'name';
  selectedId = '';
  contextEntry: DocumentExplorerEntry | null = null;
  menuX = 0;
  menuY = 0;
  creatingFolder = false;
  folderName = '';
  dragging = false;
  private dragDepth = 0;
  private cacheEntries?: DocumentExplorerEntry[];
  private cacheQuery = '';
  private cacheSort = '';
  private cacheVisible: DocumentExplorerEntry[] = [];

  constructor(private changeDetector: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['path']) {
      this.query = '';
      this.selectedId = '';
      this.cancelFolder();
      this.contextTrigger?.closeMenu();
    }
    if (changes['entries'] && !this.entries.some(item => item.id === this.selectedId)) this.selectedId = '';
  }

  get selected(): DocumentExplorerEntry | undefined {
    return this.entries.find(entry => entry.id === this.selectedId);
  }
  get breadcrumbs(): { name: string; path: string }[] {
    return this.path.split('/').filter(Boolean).map((name, index, parts) => ({ name, path: parts.slice(0, index + 1).join('/') }));
  }
  get visibleEntries(): DocumentExplorerEntry[] {
    if (this.cacheEntries === this.entries && this.cacheQuery === this.query && this.cacheSort === this.sort) return this.cacheVisible;
    const query = this.normalize(this.query);
    this.cacheEntries = this.entries;
    this.cacheQuery = this.query;
    this.cacheSort = this.sort;
    this.cacheVisible = this.entries.filter(entry => this.normalize(entry.name + ' ' + (entry.detail || '')).includes(query)).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      if (this.sort === 'modified') {
        const difference = (Date.parse(b.modifiedAt || '') || 0) - (Date.parse(a.modifiedAt || '') || 0);
        if (difference) return difference;
      }
      return a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' });
    });
    return this.cacheVisible;
  }
  private normalize(value: string): string {
    return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  }
  trackEntry(_index: number, entry: DocumentExplorerEntry): string { return entry.id; }
  goTo(path: string): void { this.navigate.emit(path); }
  goUp(): void { this.goTo(this.path.split('/').slice(0, -1).join('/')); }
  select(entry: DocumentExplorerEntry): void { this.selectedId = entry.id; }
  perform(type: DocumentExplorerAction['type'], entry = this.selected): void {
    if (!entry) return;
    if (['share-customer', 'hide-customer', 'inherit-customer'].includes(type) && !this.allowCustomerSharing) return;
    if (type === 'delete' && (!this.allowDelete || entry.locked)) return;
    if (type === 'rename' && (!this.writable || !this.allowRename || entry.locked)) return;
    if (type === 'email' && !this.allowEmail) return;
    if (type === 'print' && !this.allowPrint) return;
    this.action.emit({ type, entry });
  }
  visibilityLabel(entry: DocumentExplorerEntry): string {
    const state = entry.customerVisibility;
    if (!state) return '';
    const label = state.visible ? 'Visibile al cliente' : 'Nascosto al cliente';
    const source = {custom:'scelta sul cliente',inherited:'regola della cartella',default:'regola aziendale',private:''}[state.source as 'custom'|'inherited'|'default'|'private'];
    return label + (source ? ' · ' + source : '') + (state.hasExceptions ? ' · Eccezioni nei contenuti' : '');
  }
  visibilityStatus(entry:DocumentExplorerEntry):'shared'|'hidden'|'partial'{return entry.customerVisibility?.status||(entry.customerVisibility?.visible?'shared':'hidden');}
  visibilityStatusLabel(entry:DocumentExplorerEntry):string{return {shared:'Condiviso',hidden:'Nascosto',partial:'Parzialmente condiviso'}[this.visibilityStatus(entry)];}
  showContext(event: MouseEvent, entry: DocumentExplorerEntry | null): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextTrigger.closeMenu();
    this.contextEntry = entry;
    this.selectedId = entry?.id || '';
    this.menuX = Math.min(event.clientX, Math.max(0, window.innerWidth - 240));
    this.menuY = Math.min(event.clientY, Math.max(0, window.innerHeight - 330));
    this.changeDetector.detectChanges();
    this.contextTrigger.openMenu();
  }
  showItemMenu(entry: DocumentExplorerEntry): void {
    this.contextEntry = entry;
    this.select(entry);
  }
  beginFolder(): void {
    if (!this.writable || this.uploading) return;
    this.creatingFolder = true;
    this.folderName = '';
    setTimeout(() => this.folderNameInput?.nativeElement.focus());
  }
  get validFolderName(): boolean {
    const name = this.folderName.trim();
    return !!name && name !== '.' && name !== '..' && !/[\\/\x00-\x1f]/.test(name) && !this.entries.some(entry => entry.kind === 'folder' && this.normalize(entry.name) === this.normalize(name));
  }
  submitFolder(): void {
    if (!this.validFolderName || !this.writable) return;
    this.createFolder.emit(this.folderName.trim());
    this.cancelFolder();
  }
  cancelFolder(): void { this.creatingFolder = false; this.folderName = ''; }
  chooseFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emitFiles(Array.from(input.files || []));
    input.value = '';
  }
  private emitFiles(files: File[]): void {
    if (this.writable && !this.uploading && files.length) this.upload.emit(files);
  }
  dragEnter(event: DragEvent): void {
    event.preventDefault();
    if (!this.writable || this.uploading || !event.dataTransfer?.types.includes('Files')) return;
    this.dragDepth++;
    this.dragging = true;
  }
  dragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.writable && !this.uploading ? 'copy' : 'none';
  }
  dragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (!this.dragDepth) this.dragging = false;
  }
  drop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragDepth = 0;
    this.dragging = false;
    this.emitFiles(Array.from(event.dataTransfer?.files || []));
  }
  icon(entry: DocumentExplorerEntry): string {
    if (entry.kind === 'folder') return 'folder';
    if (/\.pdf$/i.test(entry.name)) return 'picture_as_pdf';
    if (/\.(png|jpe?g|webp|gif|heic)$/i.test(entry.name)) return 'image';
    if (/\.(xlsx?|csv)$/i.test(entry.name)) return 'table_chart';
    if (/\.p7m$/i.test(entry.name)) return 'verified_user';
    return 'description';
  }
  size(bytes?: number): string {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
}
