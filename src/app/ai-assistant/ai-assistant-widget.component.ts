import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  AiAssistantService,
  AiCommandResponse,
  AiConversationHistoryItem,
  AiExecuteResponse,
} from './ai-assistant.service';
import { GlobalService } from '../service/global.service';

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

interface AiChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: string;
}

interface WidgetPosition {
  x: number;
  y: number;
}

interface DocumentNavigationTarget {
  commands: any[];
  queryParams: Record<string, any>;
}

@Component({
  selector: 'app-ai-assistant-widget',
  templateUrl: './ai-assistant-widget.component.html',
  styleUrls: ['./ai-assistant-widget.component.css'],
})
export class AiAssistantWidgetComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;

  open = false;
  loading = false;
  listening = false;
  recording = false;
  transcribing = false;
  speechAvailable = false;
  draft = '';
  messages: AiChatMessage[] = [
    {
      role: 'assistant',
      text: 'Ciao, dimmi cosa vuoi fare in MVanager.',
    },
  ];
  pendingResponse: AiCommandResponse | null = null;
  position: WidgetPosition = { x: 0, y: 0 };

  private readonly positionKey = 'mvanager_ai_widget_position';
  private recognition: any = null;
  private shouldScroll = false;
  private dragging = false;
  private dragMoved = false;
  private dragOffset = { x: 0, y: 0 };
  private speechBaseDraft = '';
  private speechHadResult = false;
  private speechLastError = '';
  private speechStoppedManually = false;
  private preferServerTranscription = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordingStream: MediaStream | null = null;
  private recordingChunks: Blob[] = [];

  constructor(
    private ai: AiAssistantService,
    private router: Router,
    private globalService: GlobalService,
    private zone: NgZone,
  ) {}

  get isVisible(): boolean {
    return !!this.globalService.token && !this.isPublicRoute();
  }

  get statusLabel(): string {
    if (this.loading) return 'Sto lavorando';
    if (this.transcribing) return 'Trascrivo';
    if (this.recording) return 'Sto registrando';
    if (this.listening) return 'Sto ascoltando';
    return 'Pronto';
  }

  get speechButtonTitle(): string {
    if (this.recording) return 'Ferma registrazione';
    if (this.transcribing) return 'Trascrizione in corso';
    if (this.preferServerTranscription) return 'Registra comando vocale';
    if (!this.speechAvailable && this.canRecordAudio()) return 'Registra comando vocale';
    if (!this.speechAvailable) return 'Dettatura non disponibile in questo browser';
    if (this.listening) return 'Ferma dettatura';
    return 'Detta comando';
  }

  ngOnInit(): void {
    this.restorePosition();
    this.initSpeechRecognition();
  }

  ngAfterViewChecked(): void {
    if (!this.shouldScroll) return;
    this.shouldScroll = false;
    const el = this.messagesContainer?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  ngOnDestroy(): void {
    this.stopSpeech();
    this.stopRecordingStream();
  }

  toggleOpen(): void {
    this.open = !this.open;
    this.keepInsideViewport();
    this.markScroll();
  }

  onFabClick(event: MouseEvent): void {
    if (this.dragMoved) {
      event.preventDefault();
      event.stopPropagation();
      this.dragMoved = false;
      return;
    }
    this.toggleOpen();
  }

  startDrag(event: PointerEvent): void {
    if (this.open) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    this.dragging = true;
    this.dragMoved = false;
    this.dragOffset = {
      x: event.clientX - this.position.x,
      y: event.clientY - this.position.y,
    };
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    const next = {
      x: event.clientX - this.dragOffset.x,
      y: event.clientY - this.dragOffset.y,
    };
    if (
      Math.abs(next.x - this.position.x) > 3 ||
      Math.abs(next.y - this.position.y) > 3
    ) {
      this.dragMoved = true;
    }
    this.position = this.constrainPosition(next);
  }

  @HostListener('window:pointerup')
  onPointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.savePosition();
    setTimeout(() => {
      this.dragMoved = false;
    }, 80);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.keepInsideViewport();
  }

  send(): void {
    const text = this.draft.trim();
    if (!text || this.loading) return;

    const history = this.recentConversationHistory();
    const previousPending = this.pendingResponse;
    const pendingCommandId = previousPending?.commandId || null;
    this.pendingResponse = null;
    this.draft = '';
    this.messages.push({ role: 'user', text });
    this.messages.push({ role: 'system', text: 'Interpreto il comando e controllo i permessi.' });
    this.markScroll();
    this.loading = true;

    this.ai.sendCommand(text, this.router.url, history, pendingCommandId).subscribe({
      next: (response) => this.handleAiResponse(response),
      error: (error) => {
        this.loading = false;
        this.pendingResponse = previousPending;
        this.messages.push({
          role: 'assistant',
          text: this.parseError(error, 'Non riesco a completare il comando AI.'),
        });
        this.markScroll();
      },
    });
  }

  confirmPending(): void {
    if (!this.pendingResponse?.commandId || this.loading) return;
    const commandId = this.pendingResponse.commandId;
    this.loading = true;
    this.messages.push({ role: 'system', text: 'Eseguo l\'azione confermata.' });
    this.markScroll();

    this.ai.execute(commandId).subscribe({
      next: (response) => this.handleExecuteResponse(response),
      error: (error) => {
        this.loading = false;
        this.messages.push({
          role: 'assistant',
          text: this.parseError(error, 'Non sono riuscito a eseguire l\'azione.'),
        });
        this.markScroll();
      },
    });
  }

  cancelPending(): void {
    this.pendingResponse = null;
    this.messages.push({ role: 'assistant', text: 'Ok, azione annullata.' });
    this.markScroll();
  }

  toggleSpeech(): void {
    if (this.loading || this.transcribing) return;
    if (this.recording) {
      this.stopServerRecording();
      return;
    }
    if (this.preferServerTranscription || !this.speechAvailable) {
      this.startServerRecording();
      return;
    }
    if (!this.speechAvailable) {
      this.addSpeechMessage('Dettatura non disponibile in questo browser. Prova Chrome o Edge, oppure scrivi il comando.');
      return;
    }
    if (this.listening) {
      this.stopSpeech();
      return;
    }
    this.startSpeech();
  }

  actionTitle(response: AiCommandResponse): string {
    if (!response.action) return 'Azione';
    if (response.action.name === 'create_quote') return 'Crea preventivo';
    if (response.action.name === 'update_quote') return 'Aggiorna preventivo';
    if (response.action.name === 'create_calendar_appointment') return 'Crea appuntamento';
    if (response.action.name === 'create_deadline') return 'Crea scadenza';
    if (response.action.name === 'send_employee_notification') return 'Invia notifica';
    if (response.action.name === 'navigate') return 'Navigazione';
    return response.action.name;
  }

  private handleAiResponse(response: AiCommandResponse): void {
    this.loading = false;
    const meta = response.requestId ? `debug ${response.requestId}` : undefined;
    if (response.reply) {
      this.messages.push({ role: 'assistant', text: response.reply, meta });
    }

    if (response.status === 'ready' && response.action) {
      if (response.requiresConfirmation && response.commandId) {
        this.pendingResponse = response;
      } else if (response.action.name === 'navigate') {
        this.performNavigation(response.action.arguments);
      }
    }

    if (response.status === 'needs_clarification' && response.missingFields?.length) {
      const missing = response.missingFields
        .map((item) => item.reason ? `${item.label}: ${item.reason}` : item.label)
        .join('\n');
      this.messages.push({ role: 'system', text: missing });
    }

    this.markScroll();
  }

  private handleExecuteResponse(response: AiExecuteResponse): void {
    this.loading = false;
    this.pendingResponse = null;
    const result = response.result || {};
    if (result['kind'] === 'quote') {
      const numero = result['numeroPreventivo'];
      const pdfNote = result['pdfCreated']
        ? 'PDF generato.'
        : result['pdfError']
          ? `Preventivo creato, PDF non generato: ${result['pdfError']}`
          : '';
      this.messages.push({
        role: 'assistant',
        text: [`Preventivo ${numero} creato.`, pdfNote].filter(Boolean).join('\n'),
      });
      if (numero) {
        this.router.navigate(['/editQuote', numero]).catch((err) => {
          console.error('[AI Assistant] Navigazione preventivo fallita:', err);
        });
      }
    } else if (result['kind'] === 'quote_update') {
      const numero = result['numeroPreventivo'];
      const pdfNote = result['pdfCreated']
        ? 'PDF rigenerato.'
        : result['pdfError']
          ? `Preventivo aggiornato, PDF non rigenerato: ${result['pdfError']}`
          : '';
      this.messages.push({
        role: 'assistant',
        text: [`Preventivo ${numero} aggiornato.`, pdfNote].filter(Boolean).join('\n'),
      });
      if (numero) {
        this.router.navigate(['/editQuote', numero]).catch((err) => {
          console.error('[AI Assistant] Navigazione preventivo fallita:', err);
        });
      }
    } else if (result['kind'] === 'appointment') {
      this.messages.push({ role: 'assistant', text: 'Appuntamento creato nel calendario.' });
      this.router.navigate(['/calendarHome']).catch((err) => {
        console.error('[AI Assistant] Navigazione calendario fallita:', err);
      });
    } else if (result['kind'] === 'deadline') {
      this.messages.push({ role: 'assistant', text: 'Scadenza creata.' });
      this.navigateDeadlineResult(result['deadline']);
    } else if (result['kind'] === 'employee_notification') {
      const names = Array.isArray(result['employees'])
        ? result['employees'].map((item: any) => item?.name).filter(Boolean).join(', ')
        : '';
      this.messages.push({
        role: 'assistant',
        text: names ? `Notifica inviata a ${names}.` : 'Notifica inviata.',
      });
    } else {
      this.messages.push({ role: 'assistant', text: 'Azione completata.' });
    }
    this.markScroll();
  }

  private performNavigation(args: Record<string, any>): void {
    const route = this.normalizeAiRoute(String(args?.['route'] || '').trim());
    const queryParams = args?.['queryParams'] || {};
    if (!route) return;
    const documentNavigation = this.documentRouteNavigation(route, queryParams);
    if (documentNavigation) {
      this.router.navigate(documentNavigation.commands, {
        queryParams: documentNavigation.queryParams,
      }).catch((err) => {
        console.error('[AI Assistant] Navigazione documenti fallita:', err);
        this.messages.push({ role: 'assistant', text: 'Non sono riuscito ad aprire la pagina richiesta.' });
        this.markScroll();
      });
      return;
    }
    this.router.navigate([route], { queryParams }).catch((err) => {
      console.error('[AI Assistant] Navigazione fallita:', err);
      this.messages.push({ role: 'assistant', text: 'Non sono riuscito ad aprire la pagina richiesta.' });
      this.markScroll();
    });
  }

  private normalizeAiRoute(route: string): string {
    if (route === '/shifts') return '/homeAdmin/shifts';
    if (route === '/shifts/create') return '/homeAdmin/shifts/create';
    return route;
  }

  private documentRouteNavigation(route: string, queryParams: Record<string, any>): DocumentNavigationTarget | null {
    if (route === '/documenti/client') {
      const targetKey = String(
        queryParams?.['targetKey'] ||
        queryParams?.['numeroCliente'] ||
        queryParams?.['customerId'] ||
        '',
      ).trim();
      return targetKey
        ? {
          commands: ['/homeAdmin/documenti/client', targetKey],
          queryParams: this.documentRouteQueryParams(queryParams),
        }
        : null;
    }
    if (route === '/documenti/employee') {
      const employeeId = String(
        queryParams?.['employeeId'] ||
        queryParams?.['id'] ||
        '',
      ).trim();
      return employeeId
        ? {
          commands: ['/homeAdmin/documenti/employee', employeeId],
          queryParams: this.documentRouteQueryParams(queryParams),
        }
        : null;
    }
    return null;
  }

  private documentRouteQueryParams(queryParams: Record<string, any>): Record<string, any> {
    const allowedKeys = [
      'folder',
      'cartella',
      'path',
      'documentName',
      'document',
      'filename',
      'file',
      'allegato',
      'search',
      'q',
      'openDocument',
      'open',
      'preview',
    ];
    const result: Record<string, any> = {};

    for (const key of allowedKeys) {
      const rawValue = queryParams?.[key];
      if (rawValue === undefined || rawValue === null) continue;
      if (typeof rawValue === 'boolean' || typeof rawValue === 'number') {
        result[key] = rawValue;
        continue;
      }
      const value = String(rawValue).trim();
      if (value) result[key] = value;
    }

    return result;
  }

  private navigateDeadlineResult(deadline: any): void {
    const entityType = String(deadline?.entityType || '');
    if (entityType === 'employee') {
      this.router.navigate(['/employee-deadlines'], {
        queryParams: { employeeId: deadline.employeeId },
      });
    } else if (entityType === 'vehicle') {
      this.router.navigate(['/vehicle-deadlines'], {
        queryParams: { vehicleId: deadline.vehicleId },
      });
    } else if (entityType === 'customer') {
      this.router.navigate(['/customer-deadlines'], {
        queryParams: { targetKey: deadline.targetKey },
      });
    } else if (entityType === 'equipment') {
      this.router.navigate(['/equipment-deadlines'], {
        queryParams: { targetKey: deadline.targetKey },
      });
    } else if (entityType === 'internal') {
      this.router.navigate(['/internal-deadlines']);
    }
  }

  private initSpeechRecognition(): void {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.speechAvailable = !!Recognition;
    if (!Recognition) return;
    this.recognition = new Recognition();
    this.recognition.lang = 'it-IT';
    this.recognition.interimResults = true;
    this.recognition.continuous = false;
    this.recognition.maxAlternatives = 1;
    this.recognition.onstart = () => {
      this.zone.run(() => {
        this.listening = true;
        this.speechLastError = '';
        this.speechStoppedManually = false;
      });
    };
    this.recognition.onresult = (event: any) => {
      const transcript = this.extractSpeechTranscript(event);
      this.zone.run(() => {
        if (!transcript) return;
        this.speechHadResult = true;
        this.draft = [this.speechBaseDraft, transcript].filter(Boolean).join(' ').trim();
        if (this.hasFinalSpeechResult(event)) {
          this.speechBaseDraft = this.draft;
        }
      });
    };
    this.recognition.onend = () => {
      this.zone.run(() => {
        const shouldNotifyNoSpeech = this.listening &&
          !this.speechHadResult &&
          !this.speechStoppedManually &&
          !this.speechLastError;
        this.listening = false;
        if (shouldNotifyNoSpeech) {
          this.addSpeechMessage('Non ho sentito nulla. Riprova parlando dopo il segnale del browser.');
        }
      });
    };
    this.recognition.onerror = (event: any) => {
      this.zone.run(() => {
        const message = this.speechErrorMessage(event?.error);
        this.speechLastError = message;
        this.listening = false;
        if (event?.error === 'network') {
          this.preferServerTranscription = true;
        }
        if (message && !(event?.error === 'aborted' && this.speechStoppedManually)) {
          this.addSpeechMessage(message);
        }
      });
    };
  }

  private async startSpeech(): Promise<void> {
    if (!this.recognition) {
      this.addSpeechMessage('Dettatura non disponibile in questo browser.');
      return;
    }
    if (!window.isSecureContext) {
      this.addSpeechMessage(this.secureContextMessage());
      return;
    }

    const canUseMic = await this.ensureMicrophonePermission();
    if (!canUseMic) return;

    try {
      this.speechBaseDraft = this.draft.trim();
      this.speechHadResult = false;
      this.speechLastError = '';
      this.speechStoppedManually = false;
      this.listening = true;
      this.recognition.start();
    } catch (error: any) {
      this.listening = false;
      this.addSpeechMessage(error?.message || 'Non sono riuscito ad avviare il microfono.');
    }
  }

  private stopSpeech(): void {
    if (!this.recognition) return;
    try {
      this.speechStoppedManually = true;
      this.recognition.stop();
    } catch {
      this.listening = false;
    }
  }

  private async startServerRecording(): Promise<void> {
    if (!this.canRecordAudio()) {
      this.addSpeechMessage('Registrazione audio non disponibile in questo browser.');
      return;
    }
    if (!window.isSecureContext) {
      this.addSpeechMessage(this.secureContextMessage());
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.preferredRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.recordingStream = stream;
      this.mediaRecorder = recorder;
      this.recordingChunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size) this.recordingChunks.push(event.data);
      };
      recorder.onerror = () => {
        this.zone.run(() => {
          this.recording = false;
          this.stopRecordingStream();
          this.addSpeechMessage('Non sono riuscito a registrare l\'audio.');
        });
      };
      recorder.onstop = () => {
        this.zone.run(() => {
          const chunks = [...this.recordingChunks];
          const type = recorder.mimeType || mimeType || 'audio/webm';
          this.recording = false;
          this.stopRecordingStream();
          if (!chunks.length) {
            this.addSpeechMessage('Non ho registrato audio. Riprova parlando dopo aver premuto il microfono.');
            return;
          }
          this.transcribeRecordedAudio(new Blob(chunks, { type }));
        });
      };

      recorder.start();
      this.recording = true;
      this.preferServerTranscription = true;
      this.messages.push({ role: 'system', text: 'Registrazione avviata. Premi di nuovo il microfono per terminare.' });
      this.markScroll();
    } catch (error: any) {
      this.recording = false;
      this.stopRecordingStream();
      this.addSpeechMessage(this.microphonePermissionMessage(error));
    }
  }

  private stopServerRecording(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      this.recording = false;
      this.stopRecordingStream();
      return;
    }
    try {
      this.mediaRecorder.stop();
    } catch {
      this.recording = false;
      this.stopRecordingStream();
      this.addSpeechMessage('Non sono riuscito a fermare la registrazione.');
    }
  }

  private stopRecordingStream(): void {
    this.recordingStream?.getTracks().forEach((track) => track.stop());
    this.recordingStream = null;
    this.mediaRecorder = null;
  }

  private transcribeRecordedAudio(audio: Blob): void {
    this.transcribing = true;
    this.messages.push({ role: 'system', text: 'Trascrivo il messaggio vocale.' });
    this.markScroll();

    this.ai.transcribeAudio(audio).subscribe({
      next: (response) => {
        this.transcribing = false;
        const text = String(response?.normalizedText || response?.text || '').trim();
        if (!text) {
          this.addSpeechMessage('Non sono riuscito a capire il messaggio vocale.');
          return;
        }
        this.draft = [this.draft.trim(), text].filter(Boolean).join(' ').trim();
        this.markScroll();
      },
      error: (error) => {
        this.transcribing = false;
        this.addSpeechMessage(this.parseError(error, 'Non sono riuscito a trascrivere il messaggio vocale.'));
      },
    });
  }

  private async ensureMicrophonePermission(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error: any) {
      this.zone.run(() => {
        this.listening = false;
        this.addSpeechMessage(this.microphonePermissionMessage(error));
      });
      return false;
    }
  }

  private extractSpeechTranscript(event: any): string {
    const results = Array.from(event?.results || []) as any[];
    const startIndex = Math.max(0, Number(event?.resultIndex) || 0);
    return results
      .slice(startIndex)
      .map((result) => result?.[0]?.transcript || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hasFinalSpeechResult(event: any): boolean {
    return (Array.from(event?.results || []) as any[]).some((result) => !!result?.isFinal);
  }

  private addSpeechMessage(text: string): void {
    this.messages.push({ role: 'assistant', text });
    this.markScroll();
  }

  private speechErrorMessage(error: string): string {
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      return 'Permesso microfono negato. Abilita il microfono per MVanager dalle impostazioni del browser.';
    }
    if (error === 'audio-capture') {
      return 'Non trovo un microfono disponibile su questo dispositivo.';
    }
    if (error === 'no-speech') {
      return 'Non ho sentito nulla. Riprova parlando dopo il segnale del browser.';
    }
    if (error === 'network') {
      return 'Il servizio vocale del browser non è raggiungibile. Premi di nuovo il microfono per usare la registrazione MVanager.';
    }
    if (error === 'aborted') {
      return '';
    }
    return 'Non sono riuscito a usare il microfono. Controlla permessi e browser.';
  }

  private microphonePermissionMessage(error: any): string {
    const name = String(error?.name || '').toLowerCase();
    if (name.includes('notallowed') || name.includes('permission')) {
      return 'Permesso microfono negato. Abilita il microfono per MVanager dalle impostazioni del browser.';
    }
    if (name.includes('notfound')) {
      return 'Non trovo un microfono disponibile su questo dispositivo.';
    }
    return 'Non riesco ad accedere al microfono. Controlla permessi e dispositivo.';
  }

  private secureContextMessage(): string {
    const origin = window.location.origin;
    const host = window.location.hostname.toLowerCase();
    const port = window.location.port ? `:${window.location.port}` : '';
    if (host.endsWith('.local')) {
      const localhostHost = host.replace(/\.local$/, '.localhost');
      return `Il browser blocca il microfono su ${origin}. In locale apri http://${localhostHost}${port} oppure avvia MVanager in HTTPS.`;
    }
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) {
      return `Il browser blocca il microfono su ${origin}. Su rete locale o telefono devi aprire MVanager in HTTPS.`;
    }
    return `Il browser blocca il microfono su ${origin}. Serve HTTPS oppure un indirizzo localhost.`;
  }

  private canRecordAudio(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  private preferredRecordingMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  private restorePosition(): void {
    const fallback = {
      x: window.innerWidth - 82,
      y: window.innerHeight - 86,
    };
    try {
      const stored = JSON.parse(localStorage.getItem(this.positionKey) || 'null');
      this.position = this.constrainPosition(stored || fallback);
    } catch {
      this.position = this.constrainPosition(fallback);
    }
  }

  private savePosition(): void {
    localStorage.setItem(this.positionKey, JSON.stringify(this.position));
  }

  private constrainPosition(position: WidgetPosition): WidgetPosition {
    const margin = 12;
    const size = 58;
    return {
      x: Math.max(margin, Math.min(window.innerWidth - size - margin, Number(position.x) || margin)),
      y: Math.max(margin, Math.min(window.innerHeight - size - margin, Number(position.y) || margin)),
    };
  }

  private keepInsideViewport(): void {
    this.position = this.constrainPosition(this.position);
    this.savePosition();
  }

  private markScroll(): void {
    this.shouldScroll = true;
  }

  private recentConversationHistory(): AiConversationHistoryItem[] {
    return this.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-8)
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        text: message.text.trim(),
      }))
      .filter((message) => !!message.text);
  }

  private parseError(error: any, fallback: string): string {
    return String(error?.error?.error || error?.error?.message || error?.message || fallback);
  }

  private isPublicRoute(): boolean {
    const path = this.router.url.split('?')[0].toLowerCase();
    return path.startsWith('/quote-accept/') || path.startsWith('/contract-accept/');
  }
}
