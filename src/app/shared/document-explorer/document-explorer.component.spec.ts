import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { OverlayContainer } from '@angular/cdk/overlay';
import { DocumentExplorerComponent, DocumentExplorerEntry } from './document-explorer.component';

describe('DocumentExplorerComponent', () => {
  it('offre la visibilità cliente nel menu contestuale solo a chi può configurarla',()=>{
    fixture.componentRef.setInput('allowCustomerSharing',true);
    fixture.componentRef.setInput('entries',[{...folder,customerVisibility:{visible:true,source:'custom',explicit:true}}]);fixture.detectChanges();
    element.querySelector('.entry')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
    if(!component.contextEntry)element.querySelector<HTMLButtonElement>('.item-menu')!.click();fixture.detectChanges();
    const overlay=TestBed.inject(OverlayContainer).getContainerElement();
    expect(overlay.textContent).not.toContain('Abilita visualizzazione al cliente');expect(overlay.textContent).toContain('Disabilita visualizzazione al cliente');expect(overlay.textContent).toContain('Ripristina regole ereditate');
    const action=spyOn(component.action,'emit');Array.from(overlay.querySelectorAll('button')).find(b=>b.textContent?.includes('Disabilita visualizzazione'))!.click();
    expect(action).toHaveBeenCalledWith(jasmine.objectContaining({type:'hide-customer'}));
    fixture.componentRef.setInput('allowCustomerSharing',false);fixture.detectChanges();action.calls.reset();component.perform('share-customer',folder);expect(action).not.toHaveBeenCalled();
  });
  it('mostra badge riconoscibili e propone solo l’attivazione per un elemento nascosto',()=>{
    fixture.componentRef.setInput('allowCustomerSharing',true);fixture.componentRef.setInput('entries',[
      {...folder,customerVisibility:{visible:false,source:'private',explicit:null,status:'hidden'}},
      {...file,customerVisibility:{visible:true,source:'default',explicit:null,status:'shared'}},
    ]);fixture.detectChanges();
    expect(element.querySelector('.customer-visibility-badge.is-hidden')?.textContent).toContain('Nascosto');
    expect(element.querySelector('.customer-visibility-badge.is-shared')?.textContent).toContain('Condiviso');
    element.querySelector('.entry')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));fixture.detectChanges();
    const overlay=TestBed.inject(OverlayContainer).getContainerElement();expect(overlay.textContent).toContain('Abilita visualizzazione al cliente');expect(overlay.textContent).not.toContain('Disabilita visualizzazione al cliente');
  });
  let fixture: ComponentFixture<DocumentExplorerComponent>;
  let component: DocumentExplorerComponent;
  let element: HTMLElement;
  const folder: DocumentExplorerEntry = { id: 'folder:commessa', name: 'Commessa conclusa', kind: 'folder', data: 'Commessa conclusa' };
  const file: DocumentExplorerEntry = { id: 'file:preventivo', name: 'Preventivo accettato.pdf', kind: 'file', size: 42000, modifiedAt: '2026-11-23T09:00:00Z', data: { filename: '123-preventivo.pdf' } };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DocumentExplorerComponent, NoopAnimationsModule] }).compileComponents();
    fixture = TestBed.createComponent(DocumentExplorerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('entries', [file, folder]);
    fixture.detectChanges();
    element = fixture.nativeElement;
  });
  afterEach(() => TestBed.inject(OverlayContainer).getContainerElement().innerHTML = '');

  it('seleziona con un clic e apre solo con doppio clic o Invio', () => {
    const action = spyOn(component.action, 'emit');
    const button = element.querySelector<HTMLButtonElement>('.entry-main')!;
    button.click();
    fixture.detectChanges();
    expect(component.selectedId).toBe(folder.id);
    expect(action).not.toHaveBeenCalled();
    button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(action).toHaveBeenCalledOnceWith({ type: 'open', entry: folder });
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(action.calls.count()).toBe(2);
  });

  it('offre Apri e il menu azioni anche senza doppio clic', () => {
    const action = spyOn(component.action, 'emit');
    element.querySelector<HTMLButtonElement>('.entry-main')!.click();
    fixture.detectChanges();
    const open = Array.from(element.querySelectorAll<HTMLButtonElement>('.commands button')).find(button => button.textContent?.includes('Apri'))!;
    open.click();
    expect(action).toHaveBeenCalledWith({ type: 'open', entry: folder });
    element.querySelector<HTMLButtonElement>('.item-menu')!.click();
    fixture.detectChanges();
    expect(TestBed.inject(OverlayContainer).getContainerElement().textContent).toContain('Apri');
  });

  it('il clic destro nello spazio vuoto propone Nuova cartella e Carica documenti', () => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 70 });
    element.querySelector('.workspace')!.dispatchEvent(event);
    fixture.detectChanges();
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    expect(event.defaultPrevented).toBeTrue();
    expect(overlay.textContent).toContain('Nuova cartella');
    expect(overlay.textContent).toContain('Carica documenti');
    const create = Array.from(overlay.querySelectorAll('button')).find(button => button.textContent?.includes('Nuova cartella'))!;
    create.click(); fixture.detectChanges();
    expect(element.querySelector('.new-folder')).not.toBeNull();
  });

  it('non propone modifiche per i documenti gestiti dalle scadenze', () => {
    const locked = { ...file, locked: true };
    fixture.componentRef.setInput('entries', [locked]);
    fixture.componentRef.setInput('allowRename', true);
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.item-menu')!.click(); fixture.detectChanges();
    const text = TestBed.inject(OverlayContainer).getContainerElement().textContent!;
    expect(text).toContain('Scarica');
    expect(text).not.toContain('Elimina');
    expect(text).not.toContain('Rinomina');
    const action = spyOn(component.action, 'emit');
    component.perform('delete', locked);
    expect(action).not.toHaveBeenCalled();
  });

  it('non carica né crea cartelle quando la cartella è protetta o durante un caricamento', () => {
    const upload = spyOn(component.upload, 'emit');
    fixture.componentRef.setInput('writable', false); fixture.detectChanges();
    expect(element.querySelector('.primary-button')).toBeNull();
    component.beginFolder(); expect(component.creatingFolder).toBeFalse();
    const data = new DataTransfer(); data.items.add(new File(['test'], 'prova.txt'));
    component.drop(new DragEvent('drop', { dataTransfer: data }));
    expect(upload).not.toHaveBeenCalled();
    fixture.componentRef.setInput('writable', true);
    fixture.componentRef.setInput('uploading', true); fixture.detectChanges();
    component.drop(new DragEvent('drop', { dataTransfer: data }));
    expect(upload).not.toHaveBeenCalled();
  });

  it('crea una cartella con nome valido e rifiuta duplicati o percorsi', () => {
    const create = spyOn(component.createFolder, 'emit');
    component.folderName = '../altro'; component.submitFolder();
    component.folderName = folder.name; component.submitFolder();
    expect(create).not.toHaveBeenCalled();
    component.folderName = '  Evidenze  '; component.submitFolder();
    expect(create).toHaveBeenCalledOnceWith('Evidenze');
  });

  it('naviga tramite il percorso e azzera selezione e ricerca', () => {
    fixture.componentRef.setInput('path', 'ISO 9001/SAMI'); fixture.detectChanges();
    const navigate = spyOn(component.navigate, 'emit');
    const crumbs = element.querySelectorAll<HTMLButtonElement>('.breadcrumbs button');
    crumbs[1].click(); expect(navigate).toHaveBeenCalledWith('ISO 9001');
    component.query = 'documento'; component.select(file);
    fixture.componentRef.setInput('path', 'ISO 9001'); fixture.detectChanges();
    expect(component.query).toBe(''); expect(component.selectedId).toBe('');
  });

  it('filtra nella cartella corrente e mantiene le cartelle prima dei file', () => {
    expect(component.visibleEntries[0]).toBe(folder);
    component.query = 'PREVENTIVO'; fixture.detectChanges();
    expect(element.querySelectorAll('.entry').length).toBe(1);
    expect(element.querySelector('.entry')?.textContent).toContain(file.name);
    component.query = 'non esiste'; fixture.detectChanges();
    expect(element.textContent).toContain('Nessun risultato');
  });

  it('mostra data di caricamento e dimensione dei file e ordina dal più recente', () => {
    const newer = { ...file, id: 'file:valutazione', name: 'Valutazione periodica.pdf', modifiedAt: '2026-11-26T09:00:00Z' };
    fixture.componentRef.setInput('dateLabel', 'Data di caricamento');
    fixture.componentRef.setInput('entries', [file, newer]);
    fixture.detectChanges();

    const sort = element.querySelector<HTMLSelectElement>('.sort select')!;
    expect(sort.options[1].text).toBe('Data di caricamento');
    sort.selectedIndex = 1;
    sort.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(element.querySelector('.list-head')?.textContent).toContain('Data di caricamento');
    expect(element.querySelector('.entry-label')?.textContent).toBe(newer.name);
    expect(element.querySelector('.entry-date')?.textContent).toContain('26/11/2026');
    expect(element.querySelector('.entry-size')?.textContent).toBe('41.0 KB');
  });

  it('mostra data e dimensione anche per una cartella vuota', () => {
    fixture.componentRef.setInput('entries', [{ ...folder, modifiedAt: '2026-11-25T09:00:00Z', size: 0 }]);
    fixture.detectChanges();

    expect(element.querySelector('.entry-date')?.textContent).toContain('25/11/2026');
    expect(element.querySelector('.entry-size')?.textContent).toBe('0 B');
  });

  it('non deborda in elenco o griglia su uno schermo stretto', () => {
    (element as HTMLElement).style.width = '320px';
    (element as HTMLElement).style.display = 'block';
    for (const view of ['list', 'grid'] as const) {
      component.view = view; fixture.detectChanges();
      const explorer = element.querySelector<HTMLElement>('.explorer')!;
      expect(explorer.scrollWidth).withContext(view).toBeLessThanOrEqual(explorer.clientWidth + 1);
    }
  });
});
